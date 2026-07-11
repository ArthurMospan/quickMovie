import { useState, useEffect, useRef, useCallback } from 'react';
import TopNav from './components/TopNav';
import VideoCard from './components/VideoCard';
import ProfileModal from './components/ProfileModal';
import AISearchTab from './components/AISearchTab';
import FiltersModal from './components/FiltersModal';
import WishlistView from './components/WishlistView';
import { 
  discoverWithFilters, 
  getMovieDetailsWithVideos, 
  getTVDetailsWithVideos,
  getTrailerKey, 
  getCreditsInfo,
  getGenreList
} from './services/tmdb';
import { 
  getTelegramUser,
  ensureUserDoc,
  subscribeToUser, 
  subscribeToPartner, 
  toggleSaveMovie,
  toggleMovieWatched,
  updateUserPartnerId
} from './services/firebase';
import { SlidersHorizontal, Film, Play } from 'lucide-react';

// Random start page for variety (1-500 max allowed by TMDB)
const getRandomStartPage = () => Math.floor(Math.random() * 500) + 1;

// Country code to name map
const COUNTRY_NAMES = {
  US: 'США', GB: 'UK', KR: '🇰🇷', JP: '🇯🇵', FR: '🇫🇷', DE: '🇩🇪',
  IN: '🇮🇳', UA: '🇺🇦', AU: '🇦🇺', ES: '🇪🇸', IT: '🇮🇹', TR: '🇹🇷'
};

// Generate short filter description
function getFilterSummary(filters, genreMap) {
  const parts = [];
  if (filters.type === 'movie') parts.push('🎬 Фільми');
  if (filters.type === 'series') parts.push('📺 Серіали');
  if (filters.genreId && genreMap[filters.genreId]) parts.push(genreMap[filters.genreId]);
  if (filters.country) parts.push(COUNTRY_NAMES[filters.country] || filters.country);
  if (filters.minRating > 0) parts.push(`⭐${filters.minRating}+`);
  if (filters.personName) parts.push(filters.personName.split(' ')[0]);
  if (filters.yearFrom || filters.yearTo) {
    if (filters.yearFrom && filters.yearTo) {
      parts.push(`${filters.yearFrom}-${filters.yearTo}`);
    } else if (filters.yearFrom) {
      parts.push(`з ${filters.yearFrom}`);
    } else {
      parts.push(`до ${filters.yearTo}`);
    }
  }
  const text = parts.join(' · ');
  return text.length > 42 ? text.slice(0, 40) + '…' : text;
}

export default function App() {
  // --- Tab State ---
  const [activeTab, setActiveTab] = useState('feed');

  // --- Welcome Screen ---
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('qm_welcomed'));

  // --- Feed State ---
  const [movies, setMovies] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(() => getRandomStartPage());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const isFetching = useRef(false);
  const feedScrollPos = useRef(0); // Preserve scroll position

  // --- Telegram User & Data ---
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({ saves: [], watched: [], partnerId: '' });
  const [partnerId, setPartnerId] = useState('');
  const [partnerData, setPartnerData] = useState({ saves: [], watched: [] });

  // --- Modals ---
  const [showFilters, setShowFilters] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // --- Global Audio State ---
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);

  // --- Genre map for filter summary ---
  const [genreMap, setGenreMap] = useState({});

  // --- Filters ---
  const [filters, setFilters] = useState({
    type: 'all',
    genreId: null,
    country: '',
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
      if (tgUser) {
        setUser(tgUser);
        await ensureUserDoc(tgUser.uid);
        
        // Auto-connect partner if opened via invite link
        const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
        if (startParam && startParam !== tgUser.tgId.toString()) {
          const newPartnerId = `tg_${startParam}`;
          setPartnerId(newPartnerId);
          localStorage.setItem('qw_partner_id', newPartnerId);
          await import('./services/firebase').then(m => m.updateUserPartnerId(tgUser.uid, newPartnerId));
        }
      } else {
        // Look for a locally generated dev ID if not in TG? 
        // For now, if not in Telegram, they just can't save.
        console.log("No Telegram user found. App running in anonymous mode.");
      }
    };
    initUser();
  }, []);

  // --- User Data Subscription ---
  useEffect(() => {
    if (!user) {
      setUserData({ saves: [], watched: [], partnerId: '' });
      return;
    }
    const unsub = subscribeToUser(user.uid, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        if (data.partnerId) {
          setPartnerId(data.partnerId);
        } else {
          // If Firestore partnerId is empty, try local storage fallback
          const localPartner = localStorage.getItem('qw_partner_id');
          if (localPartner) setPartnerId(localPartner);
        }
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
    if (user?.uid) {
      await updateUserPartnerId(user.uid, id);
    }
  };

  // --- Load Movies from TMDB ---
  const loadMovies = useCallback(async (pageNum = 1, reset = false) => {
    if (isFetching.current) return;
    setLoading(true);
    isFetching.current = true;

    try {
      // Pass type directly — discoverWithFilters handles 'all' by merging movies+tv
      const type = filters.type;
      
      const data = await discoverWithFilters({
        type,
        genreId: filters.genreId,
        country: filters.country,
        minRating: filters.minRating,
        personId: filters.personId,
        yearFrom: filters.yearFrom,
        yearTo: filters.yearTo,
        page: pageNum
      });

      const validMovies = [];
      const watched = userData?.watched || [];

      for (const m of data.results) {
        if (watched.includes(m.id)) continue;

        // Determine if this is a TV show (has 'name' but not 'title', or media_type === 'tv')
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
  }, [filters, userData?.watched]);

  // --- Initial Load (random page only with default filters) ---
  const hasActiveFilters = filters.genreId || filters.country || filters.minRating > 0 || filters.personId || filters.yearFrom || filters.yearTo || filters.type !== 'all';

  useEffect(() => {
    if (showWelcome) return; // Don't load until welcome is dismissed
    const startPage = hasActiveFilters ? 1 : getRandomStartPage();
    setMovies([]);
    setPage(startPage);
    setActiveIndex(0);
    loadMovies(startPage, true);
  }, [filters, showWelcome]);

  // --- Save/restore scroll when switching tabs ---
  useEffect(() => {
    if (activeTab === 'feed' && containerRef.current && feedScrollPos.current > 0) {
      // Restore scroll position when returning to feed
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = feedScrollPos.current;
        }
      });
    }
  }, [activeTab]);

  const handleTabChange = (tab) => {
    // Save current feed scroll position before switching
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

  // --- Toggle Save ---
  const handleToggleSave = async (movieId) => {
    if (!user) {
      setShowProfile(true);
      return;
    }
    const isSaved = userData.saves?.includes(movieId);
    try {
      await toggleSaveMovie(user.uid, movieId, isSaved);
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  // --- Toggle Watched ---
  const handleToggleWatched = async (movieId) => {
    if (!user) {
      setShowProfile(true);
      return;
    }
    const isWatched = userData.watched?.includes(movieId);
    try {
      await toggleMovieWatched(user.uid, movieId, isWatched);
    } catch (e) {
      console.error("Watched error:", e);
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
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-purple-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/3 left-1/3 w-[200px] h-[200px] bg-blue-500/15 rounded-full blur-[100px]"></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center animate-in">
          {/* Logo */}
          <img src="/logo.png" alt="QuickMovie" className="w-24 h-24 rounded-3xl mb-6 shadow-2xl" />
          
          {/* Title */}
          <h1 className="text-3xl font-bold mb-2 tracking-tight">QuickMovie</h1>
          <p className="text-white/50 text-sm mb-8 text-center max-w-[260px] leading-relaxed">
            Свайпай трейлери як TikTok. Зберігай. Дивись разом з друзями.
          </p>

          {/* Features */}
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
          
          {/* Start Button */}
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
      
      {/* Top Navigation — uses handleTabChange instead of setActiveTab */}
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
                key={movie.id} 
                movie={movie} 
                active={activeTab === 'feed' && index === activeIndex}
                isSaved={userData.saves?.includes(movie.id)}
                onToggleSave={() => handleToggleSave(movie.id)}
                isGlobalMuted={isGlobalMuted}
                setIsGlobalMuted={setIsGlobalMuted}
                isFirstVideo={index === 0}
              />
            ))}

            {/* Loading spinner at bottom */}
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

        {/* Filter Button (floating, with description) */}
        <button 
          onClick={() => setShowFilters(true)}
          className="absolute left-1/2 -translate-x-1/2 z-30 bg-black/30 backdrop-blur-md border border-white/10 px-3.5 py-2 rounded-full flex items-center gap-2 active:scale-95 transition-transform hover:bg-black/50 max-w-[90vw]"
          style={{ top: 'calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)) + 120px)' }}
        >
          <SlidersHorizontal size={12} className="text-white/70 shrink-0" />
          <span className="text-[10px] font-bold text-white/70 tracking-wide uppercase truncate">
            {hasFilters ? filterSummary : 'Фільтри'}
          </span>
        </button>
      </div>

      {/* ===== WATCHLIST TAB ===== */}
      {activeTab === 'watchlist' && (
        <WishlistView 
          mySaves={userData.saves || []}
          partnerSaves={partnerData.saves || []}
          partnerId={partnerId}
          onToggleSave={handleToggleSave}
          onToggleWatched={handleToggleWatched}
          watched={userData.watched || []}
          onGoToProfile={() => setShowProfile(true)}
        />
      )}

      {/* ===== AI SEARCH TAB ===== */}
      {activeTab === 'ai' && (
        <AISearchTab onWatchTrailer={handleWatchTrailer} />
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
          setPartnerId={handleSetPartnerId}
        />
      )}
    </div>
  );
}
