import { useState, useEffect, useRef, useCallback } from 'react';
import TopNav from './components/TopNav';
import VideoCard from './components/VideoCard';
import ProfileModal from './components/ProfileModal';
import AISearchTab from './components/AISearchTab';
import FiltersModal from './components/FiltersModal';
import WishlistView from './components/WishlistView';
import {
  discoverWithFilters,
  getSmartFeed,
  getMovieDetailsWithVideos,
  getTVDetailsWithVideos,
  getTrailerKey,
  getCreditsInfo,
  getGenreList
} from './services/tmdb';
import {
  getTelegramUser,
  ensureUserDoc,
  saveUserProfile,
  subscribeToUser,
  subscribeToPartner,
  toggleSaveMovie,
  toggleMovieWatched,
  updateUserPartnerId
} from './services/firebase';
import { SlidersHorizontal, Film, Play } from 'lucide-react';

// --- Local-first storage keys (saves work even without Firebase) ---
const LS_SAVES = 'qm_saves';
const LS_WATCHED = 'qm_watched';
const readLS = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
};
const writeLS = (key, arr) => {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* full */ }
};

// Country code to name map
const COUNTRY_NAMES = {
  US: 'США', GB: 'UK', KR: 'Корея', JP: 'Японія', FR: 'Франція', DE: 'Німеччина',
  IN: 'Індія', UA: 'Україна', AU: 'Австралія', ES: 'Іспанія', IT: 'Італія', TR: 'Туреччина'
};

// Generate short filter description (multi-select aware)
function getFilterSummary(filters, genreMap) {
  const parts = [];
  if (filters.type === 'movie') parts.push('Фільми');
  if (filters.type === 'series') parts.push('Серіали');

  const genreNames = (filters.genreIds || []).map(id => genreMap[id]).filter(Boolean);
  if (genreNames.length === 1) parts.push(genreNames[0]);
  if (genreNames.length > 1) parts.push(`${genreNames[0]} +${genreNames.length - 1}`);

  const countryNames = (filters.countries || []).map(c => COUNTRY_NAMES[c] || c);
  if (countryNames.length === 1) parts.push(countryNames[0]);
  if (countryNames.length > 1) parts.push(`${countryNames[0]} +${countryNames.length - 1}`);

  if (filters.minRating > 0) parts.push(`⭐${filters.minRating}+`);
  if (filters.personName) parts.push(filters.personName.split(' ')[0]);
  if (filters.yearFrom || filters.yearTo) {
    if (filters.yearFrom && filters.yearTo) {
      parts.push(filters.yearFrom === filters.yearTo ? `${filters.yearFrom}` : `${filters.yearFrom}–${filters.yearTo}`);
    } else if (filters.yearFrom) {
      parts.push(`з ${filters.yearFrom}`);
    } else {
      parts.push(`до ${filters.yearTo}`);
    }
  }
  const text = parts.join(' · ');
  // Hard character limit so the pill always fits on screen
  return text.length > 36 ? text.slice(0, 34).trimEnd() + '…' : text;
}

export default function App() {
  // --- Tab State ---
  const [activeTab, setActiveTab] = useState('feed');

  // --- Welcome Screen ---
  // Inside Telegram the bot already shows a native splash with a start button,
  // so we skip the in-app welcome there and go straight to the feed.
  const [showWelcome, setShowWelcome] = useState(() =>
    !localStorage.getItem('qm_welcomed') && !window.Telegram?.WebApp?.initDataUnsafe?.user
  );

  // --- Feed State ---
  const [movies, setMovies] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const isFetching = useRef(false);
  const feedScrollPos = useRef(0);

  // --- Telegram User & Data (local-first: starts from localStorage) ---
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({
    saves: readLS(LS_SAVES),
    watched: readLS(LS_WATCHED),
    partnerId: ''
  });
  const [partnerId, setPartnerId] = useState('');
  const [partnerData, setPartnerData] = useState({ saves: [], watched: [] });
  const reconciled = useRef(false);

  // --- Toast feedback ---
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  // --- Modals ---
  const [showFilters, setShowFilters] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // --- Global Audio State ---
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);

  // --- Genre map for filter summary ---
  const [genreMap, setGenreMap] = useState({});

  // --- Filters (multi-select) ---
  const [filters, setFilters] = useState({
    type: 'all',
    genreIds: [],
    countries: [],
    minRating: 0,
    personId: null,
    personName: '',
    yearFrom: null,
    yearTo: null
  });

  // Load genre map
  useEffect(() => {
    getGenreList().then(genres => {
      const map = {};
      genres.forEach(g => { map[g.id] = g.name; });
      setGenreMap(map);
    }).catch(() => {});
  }, []);

  // --- Init Telegram User ---
  useEffect(() => {
    const initUser = async () => {
      const tgUser = await getTelegramUser();
      if (!tgUser) {
        console.log('No Telegram user found. App running in local mode.');
        return;
      }
      setUser(tgUser);
      await ensureUserDoc(tgUser.uid);
      saveUserProfile(tgUser); // so the partner sees who they're connected with

      // Auto-connect partner if opened via invite link (TWO-WAY link)
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
      if (startParam && startParam !== tgUser.tgId.toString()) {
        const newPartnerId = `tg_${startParam.replace(/\D/g, '')}`;
        if (newPartnerId.length > 3) {
          setPartnerId(newPartnerId);
          localStorage.setItem('qw_partner_id', newPartnerId);
          try {
            await updateUserPartnerId(tgUser.uid, newPartnerId);      // me -> partner
            await updateUserPartnerId(newPartnerId, tgUser.uid);      // partner -> me (accept invite both ways)
            showToast('Вішлісти з\'єднано ✓');
          } catch (e) {
            console.warn('Partner link failed:', e?.message);
          }
        }
      }
    };
    initUser();
  }, []);

  // --- User Data Subscription (merges remote with local-pending saves once) ---
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUser(user.uid, (docSnap) => {
      if (!docSnap.exists()) return;
      const remote = docSnap.data();

      // One-time reconcile: push local-only saves (made while offline) to Firestore
      const localSaves = readLS(LS_SAVES);
      const missing = localSaves.filter(id => !(remote.saves || []).includes(id));
      if (missing.length > 0 && !reconciled.current) {
        reconciled.current = true;
        missing.forEach(id => toggleSaveMovie(user.uid, id, false).catch(() => {}));
      }

      const merged = {
        ...remote,
        saves: [...new Set([...(remote.saves || []), ...missing])],
        watched: remote.watched || []
      };
      setUserData(merged);
      writeLS(LS_SAVES, merged.saves);
      writeLS(LS_WATCHED, merged.watched);

      if (remote.partnerId) {
        setPartnerId(remote.partnerId);
      } else {
        const localPartner = localStorage.getItem('qw_partner_id');
        if (localPartner) setPartnerId(localPartner);
      }
    });
    return () => unsub();
  }, [user]);

  // --- Partner Data Subscription ---
  useEffect(() => {
    if (!partnerId || partnerId.length < 5) {
      setPartnerData({ saves: [], watched: [] });
      return;
    }
    const unsub = subscribeToPartner(partnerId, (docSnap) => {
      if (docSnap.exists()) {
        setPartnerData(docSnap.data());
      } else {
        setPartnerData({ saves: [], watched: [] });
      }
    });
    return () => unsub();
  }, [partnerId]);

  // --- Set Partner ID ---
  const handleSetPartnerId = async (id) => {
    setPartnerId(id);
    localStorage.setItem('qw_partner_id', id);
    if (user?.uid && id) {
      try {
        await updateUserPartnerId(user.uid, id);
        await updateUserPartnerId(id, user.uid); // two-way
      } catch (e) { console.warn(e); }
    } else if (user?.uid) {
      try { await updateUserPartnerId(user.uid, ''); } catch (e) { /* ignore */ }
    }
  };

  // --- Load Movies (smart feed when no filters, discover otherwise) ---
  const hasActiveFilters = (filters.genreIds?.length > 0) || (filters.countries?.length > 0) ||
    filters.minRating > 0 || filters.personId || filters.yearFrom || filters.yearTo || filters.type !== 'all';

  const loadMovies = useCallback(async (pageNum = 1, reset = false) => {
    if (isFetching.current) return;
    setLoading(true);
    isFetching.current = true;

    try {
      const data = hasActiveFilters
        ? await discoverWithFilters({
            type: filters.type,
            genreIds: filters.genreIds,
            countries: filters.countries,
            minRating: filters.minRating,
            personId: filters.personId,
            yearFrom: filters.yearFrom,
            yearTo: filters.yearTo,
            page: pageNum
          })
        : await getSmartFeed(pageNum);

      const validMovies = [];
      const watched = userData?.watched || [];

      for (const m of data.results) {
        if (watched.includes(m.id)) continue;

        const isTV = m.media_type === 'tv' || (!m.title && m.name) || m.first_air_date;

        try {
          const details = isTV
            ? await getTVDetailsWithVideos(m.id)
            : await getMovieDetailsWithVideos(m.id);

          const trailerKey = getTrailerKey(details);
          const credits = getCreditsInfo(details);

          validMovies.push({
            id: m.id,
            title: details.title || details.name || m.title || m.name,
            overview: details.overview || m.overview,
            vote_average: details.vote_average || m.vote_average,
            release_date: details.release_date || details.first_air_date || m.release_date || m.first_air_date,
            backdrop_path: m.backdrop_path || details.backdrop_path,
            poster_path: m.poster_path || details.poster_path,
            trailerKey,
            director: credits.director,
            actors: credits.actors,
            country: details.production_countries?.[0]?.iso_3166_1 || details.origin_country?.[0] || '',
            type: isTV ? 'series' : 'movie'
          });

          if (validMovies.filter(v => v.trailerKey).length >= 8) break;
        } catch (e) {
          console.warn(`Failed to fetch details for ${m.id}`, e);
        }
      }

      setMovies(prev => {
        if (reset) return validMovies;
        const currentIds = new Set(prev.map(p => p.id));
        const newItems = validMovies.filter(v => !currentIds.has(v.id));
        return [...prev, ...newItems];
      });
      setPage(pageNum + 1);
    } catch (e) {
      console.error("Failed to load movies:", e);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [filters, hasActiveFilters, userData?.watched]);

  // --- Initial Load / filter change ---
  useEffect(() => {
    if (showWelcome) return;
    setMovies([]);
    setPage(1);
    setActiveIndex(0);
    loadMovies(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, showWelcome]);

  // --- Save/restore scroll when switching tabs ---
  useEffect(() => {
    if (activeTab === 'feed' && containerRef.current && feedScrollPos.current > 0) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = feedScrollPos.current;
        }
      });
    }
  }, [activeTab]);

  const handleTabChange = (tab) => {
    if (activeTab === 'feed' && containerRef.current) {
      feedScrollPos.current = containerRef.current.scrollTop;
    }
    setActiveTab(tab);
  };

  // --- Scroll Handler ---
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = containerRef.current;

    const index = Math.round(scrollTop / clientHeight);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }

    if (scrollHeight - scrollTop <= clientHeight * 3 && !loading && !isFetching.current) {
      loadMovies(page);
    }
  };

  // --- Local-first mutation: instant UI + localStorage, then Firestore sync ---
  const applyLocal = (changes) => {
    setUserData(prev => {
      const next = { ...prev, ...changes };
      writeLS(LS_SAVES, next.saves || []);
      writeLS(LS_WATCHED, next.watched || []);
      return next;
    });
  };

  // --- Toggle Save (works ALWAYS — with or without Firebase) ---
  const handleToggleSave = async (movieId) => {
    const isSaved = userData.saves?.includes(movieId);
    const newSaves = isSaved
      ? (userData.saves || []).filter(id => id !== movieId)
      : [...(userData.saves || []), movieId];
    applyLocal({ saves: newSaves });
    showToast(isSaved ? 'Прибрано з вішліста' : 'Додано у вішліст ❤');

    if (user) {
      try {
        await toggleSaveMovie(user.uid, movieId, isSaved);
      } catch (e) {
        console.error("Save sync error:", e);
      }
    }
  };

  // --- Toggle Watched ---
  // Watch: the movie MOVES from the saved list to "Переглянуті" (not deleted).
  // Un-watch: it moves back to the saved list.
  const handleToggleWatched = async (movieId) => {
    const isWatched = userData.watched?.includes(movieId);
    if (isWatched) {
      applyLocal({
        watched: (userData.watched || []).filter(id => id !== movieId),
        saves: [...new Set([...(userData.saves || []), movieId])]
      });
      showToast('Повернуто у список ❤');
    } else {
      applyLocal({
        watched: [...(userData.watched || []), movieId],
        saves: (userData.saves || []).filter(id => id !== movieId)
      });
      showToast('Позначено як переглянуте ✓');
    }

    if (user) {
      try {
        await toggleMovieWatched(user.uid, movieId, isWatched);
      } catch (e) {
        console.error("Watched sync error:", e);
      }
    }
  };

  // --- Watch Trailer from AI Search ---
  const handleWatchTrailer = (movie) => {
    setMovies(prev => [movie, ...prev.filter(m => m.id !== movie.id)]);
    setActiveIndex(0);
    setActiveTab('feed');
    feedScrollPos.current = 0;
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  // --- Apply Filters ---
  const handleSetFilters = (newFilters) => {
    setFilters(newFilters);
  };

  // --- Welcome dismiss ---
  const handleDismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('qm_welcomed', '1');
  };

  // --- Filtered movies for feed ---
  const feedMovies = movies.filter(m => m.trailerKey);

  // --- Filter summary text ---
  const filterSummary = getFilterSummary(filters, genreMap);
  const hasFilters = filterSummary.length > 0;

  // =================== WELCOME SCREEN ===================
  if (showWelcome) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-purple-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/3 left-1/3 w-[200px] h-[200px] bg-blue-500/15 rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center animate-in">
          <img src="/logo.png" alt="QuickMovie" className="w-24 h-24 rounded-3xl mb-6 shadow-2xl" />

          <h1 className="text-3xl font-bold mb-2 tracking-tight">QuickMovie</h1>
          <p className="text-white/50 text-sm mb-8 text-center max-w-[260px] leading-relaxed">
            Свайпай трейлери як TikTok. Зберігай. Дивись разом з друзями.
          </p>

          <div className="space-y-3 mb-10 w-full max-w-[280px]">
            {[
              { emoji: '🎬', text: 'Трейлери фільмів та серіалів' },
              { emoji: '🤖', text: 'ШІ знайде фільм за описом' },
              { emoji: '❤️', text: 'Спільний вішліст з друзями' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-lg">{item.emoji}</span>
                <span className="text-sm text-white/80 font-medium">{item.text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleDismissWelcome}
            className="w-full max-w-[280px] bg-white text-black font-bold py-4 rounded-2xl text-base active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_40px_rgba(255,255,255,0.15)]"
          >
            <Play size={18} fill="black" /> Почати пошук
          </button>
        </div>
      </div>
    );
  }

  // =================== MAIN APP ===================
  return (
    <div className="min-h-[100dvh] bg-black text-white font-sans relative overflow-hidden">

      <TopNav
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onProfileClick={() => setShowProfile(true)}
        userPhotoURL={user?.photoURL}
      />

      {/* ===== FEED TAB (always mounted, hidden when not active) ===== */}
      <div style={{ display: activeTab === 'feed' ? 'block' : 'none' }}>
        {feedMovies.length > 0 ? (
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black"
          >
            {feedMovies.map((movie, index) => (
              <VideoCard
                key={`${movie.type}_${movie.id}`}
                movie={movie}
                active={activeTab === 'feed' && index === activeIndex}
                isSaved={userData.saves?.includes(movie.id)}
                onToggleSave={() => handleToggleSave(movie.id)}
                isGlobalMuted={isGlobalMuted}
                setIsGlobalMuted={setIsGlobalMuted}
                isFirstVideo={index === 0}
              />
            ))}

            {loading && (
              <div className="h-[100dvh] w-full snap-start flex flex-col items-center justify-center text-white/50 bg-black">
                <div className="w-14 h-14 border-4 border-white/10 border-t-white/80 rounded-full animate-spin mb-4"></div>
                <p className="font-semibold tracking-wide text-sm">Завантаження трейлерів...</p>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="h-[100dvh] w-full flex flex-col items-center justify-center text-white/50 bg-black">
            <div className="w-14 h-14 border-4 border-white/10 border-t-white/80 rounded-full animate-spin mb-4"></div>
            <p className="font-semibold tracking-wide text-sm">Завантаження трейлерів...</p>
          </div>
        ) : (
          <div className="h-[100dvh] flex flex-col items-center justify-center text-center p-6 bg-black">
            <Film size={48} className="text-white/20 mb-4" />
            <h3 className="text-xl font-bold mb-2">Нічого не знайдено</h3>
            <p className="text-white/40 text-sm mb-4">Спробуйте змінити фільтри</p>
            <button
              onClick={() => setShowFilters(true)}
              className="px-6 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 font-semibold text-sm active:scale-95 transition-transform"
            >
              Змінити фільтри
            </button>
          </div>
        )}

        {/* Filter Button (floating, shows a short summary of active filters) */}
        <button
          onClick={() => setShowFilters(true)}
          className={`filter-pill absolute left-1/2 -translate-x-1/2 z-30 backdrop-blur-md border px-3.5 py-2 rounded-full flex items-center gap-2 active:scale-95 transition-transform max-w-[85vw] ${
            hasFilters ? 'bg-white/15 border-white/25' : 'bg-black/30 border-white/10 hover:bg-black/50'
          }`}
          style={{ top: 'var(--app-top)' }}
        >
          <SlidersHorizontal size={12} className={`shrink-0 ${hasFilters ? 'text-white' : 'text-white/70'}`} />
          <span className={`text-[10px] font-bold tracking-wide uppercase truncate ${hasFilters ? 'text-white' : 'text-white/70'}`}>
            {hasFilters ? filterSummary : 'Фільтри'}
          </span>
        </button>

        {/* Landscape-only filters button — left side, under the search button */}
        <button
          onClick={() => setShowFilters(true)}
          className="landscape-filter-btn absolute left-6 z-30 w-10 h-10 rounded-full bg-black/30 backdrop-blur-md border border-white/10 items-center justify-center active:scale-90 transition-transform"
          style={{ top: 'calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)) + 62px)' }}
        >
          <SlidersHorizontal size={16} className="text-white" />
          {hasFilters && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white"></span>}
        </button>
      </div>

      {/* ===== WATCHLIST TAB ===== */}
      {activeTab === 'watchlist' && (
        <WishlistView
          mySaves={userData.saves || []}
          partnerSaves={partnerData.saves || []}
          partnerId={partnerId}
          partnerProfile={partnerData}
          onToggleSave={handleToggleSave}
          onToggleWatched={handleToggleWatched}
          watched={userData.watched || []}
          onGoToProfile={() => setShowProfile(true)}
          notify={showToast}
        />
      )}

      {/* ===== AI SEARCH TAB ===== */}
      {activeTab === 'ai' && (
        <AISearchTab onWatchTrailer={handleWatchTrailer} />
      )}

      {/* ===== TOAST ===== */}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 z-[60] pointer-events-none animate-in">
          <div className="bg-black/70 backdrop-blur-xl border border-white/15 rounded-full px-5 py-2.5 shadow-2xl">
            <p className="text-sm font-semibold text-white whitespace-nowrap">{toast}</p>
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      {showFilters && (
        <FiltersModal
          onClose={() => setShowFilters(false)}
          filters={filters}
          setFilters={handleSetFilters}
        />
      )}
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          user={user}
          userData={userData}
          partnerId={partnerId}
          partnerProfile={partnerData}
          setPartnerId={handleSetPartnerId}
        />
      )}
    </div>
  );
}
