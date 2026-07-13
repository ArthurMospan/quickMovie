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
  toggleSharedMovie,
  removeUserData,
  updateUserPartnerId,
  addReleaseReminder,
  reconcileUserData,
  unlinkPartner
} from './services/firebase';
import { SlidersHorizontal, Film } from 'lucide-react';

// --- Local-first storage keys (saves work even without Firebase) ---
const LS_SAVES = 'qm_saves';
const LS_WATCHED = 'qm_watched';
const LS_SHARED = 'qm_shared';
const readLS = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
};
const writeLS = (key, arr) => {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* full */ }
};

// --- Тумбстоуни видалень (фікс «видалив, а воно повернулось») ---
// Причина бага: one-time reconcile бачив у localStorage id, яких немає в
// хмарі, і вважав їх «збереженими офлайн» → заливав НАЗАД, хоча насправді
// вони були ВИДАЛЕНІ (на іншому пристрої або поки Firestore не відповів).
// Тепер кожне видалення лишає мітку на 30 днів: такі id не реконсилюються,
// фільтруються зі снапшота і ще раз добиваються в хмарі (cloud-heal).
const LS_TOMB = 'qm_deleted';
const TOMB_TTL_MS = 30 * 864e5;
const readTomb = () => {
  try {
    const t = JSON.parse(localStorage.getItem(LS_TOMB)) || {};
    const now = Date.now();
    for (const list of Object.keys(t)) {
      for (const [id, ts] of Object.entries(t[list])) {
        if (now - ts > TOMB_TTL_MS) delete t[list][id];
      }
    }
    return t;
  } catch (e) { return {}; }
};
const writeTomb = (t) => {
  try { localStorage.setItem(LS_TOMB, JSON.stringify(t)); } catch (e) { /* full */ }
};
const addTomb = (list, id) => {
  const t = readTomb();
  (t[list] = t[list] || {})[id] = Date.now();
  writeTomb(t);
};
const clearTomb = (list, id) => {
  const t = readTomb();
  if (t[list]?.[id] != null) { delete t[list][id]; writeTomb(t); }
};
const tombSet = (list) => new Set(Object.keys(readTomb()[list] || {}));

// --- Media key for saves/watched/shared/seen ---
// TMDB movie and TV ids are SEPARATE id spaces (movie/1396 ≠ tv/1396).
// Movies keep the bare numeric id (backward compatible with old saves),
// series are stored as 'tv_<id>' so the wishlist can't resolve them as a
// totally different movie with the same number.
const mediaKey = (m) => (m.type === 'series' ? `tv_${m.id}` : m.id);

// Порожні фільтри (одне джерело істини для reset і для скидання при відкритті трейлера)
const DEFAULT_FILTERS = {
  type: 'all', genreIds: [], countries: [], minRating: 0,
  personId: null, personName: '', yearFrom: null, yearTo: null, upcoming: false
};
// Toggles accept either a movie object (feed) or a ready storage key (wishlist)
const keyOf = (arg) => (typeof arg === 'object' && arg !== null ? mediaKey(arg) : arg);

// Native Telegram confirm with a browser fallback (used for partner linking consent)
const confirmDialog = (message) => new Promise((resolve) => {
  const wa = window.Telegram?.WebApp;
  if (typeof wa?.showConfirm === 'function') {
    try { wa.showConfirm(message, (ok) => resolve(!!ok)); return; } catch (e) { /* old client */ }
  }
  resolve(window.confirm(message));
});

// --- Seen-trailers memory: a trailer the user already watched is not shown
// again for SEEN_TTL days (only in the no-filters smart feed). ---
const LS_SEEN = 'qm_seen';
const SEEN_TTL_MS = 3 * 864e5; // 3 days
const readSeen = () => {
  try { return JSON.parse(localStorage.getItem(LS_SEEN)) || {}; } catch (e) { return {}; }
};
const markSeen = (id) => {
  try {
    const seen = readSeen();
    seen[id] = Date.now();
    let entries = Object.entries(seen);
    if (entries.length > 500) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, 400); // keep newest
    }
    localStorage.setItem(LS_SEEN, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) { /* full */ }
};
const isSeenRecently = (id) => {
  const t = readSeen()[id];
  return !!t && (Date.now() - t) < SEEN_TTL_MS;
};

// Country code to name map
const COUNTRY_NAMES = {
  US: 'США', GB: 'UK', KR: 'Корея', JP: 'Японія', FR: 'Франція', DE: 'Німеччина',
  IN: 'Індія', UA: 'Україна', AU: 'Австралія', ES: 'Іспанія', IT: 'Італія', TR: 'Туреччина'
};

// Generate short filter description (multi-select aware)
function getFilterSummary(filters, genreMap) {
  const parts = [];
  if (filters.upcoming) parts.push('Майбутні');
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

// Скелетон картки фіда: та сама розкладка, що у VideoCard (відео-сцена,
// текст знизу зліва, стовпчик кнопок справа) — при появі реальної картки
// нічого не «стрибає» і не миготить. Використовується і для пагінації,
// і для першого завантаження, і як оверлей повороту.
function FeedSkeleton() {
  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="yt-stage skel"></div>
      </div>
      <div className="absolute bottom-4 left-4 right-20 z-10 flex flex-col gap-2">
        <div className="h-6 w-3/5 rounded-lg skel"></div>
        <div className="h-3.5 w-full rounded-md skel"></div>
        <div className="h-3.5 w-4/5 rounded-md skel"></div>
        <div className="h-3 w-2/5 rounded-md skel mt-1"></div>
      </div>
      <div className="absolute right-3 bottom-20 z-10 flex flex-col gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="w-10 h-10 rounded-full skel"></div>
        ))}
      </div>
    </>
  );
}

export default function App() {
  // --- Tab State ---
  const [activeTab, setActiveTab] = useState('feed');

  // --- Feed State ---
  const [movies, setMovies] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [feedEnded, setFeedEnded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef(null);
  const isFetching = useRef(false);
  const loadSeq = useRef(0); // bumped on every reset — stale fetches discard themselves
  const feedScrollPos = useRef(0);
  const moviesRef = useRef([]); // fresh feed snapshot for stable callbacks
  const pinnedRef = useRef(null); // deep-linked/AI-opened movie survives the initial reset

  // Свіжий activeIndex для ре-снапу після повороту (ефект підписаний один раз)
  const activeIndexRef = useRef(0);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  // --- Rotation overlay ---
  // Раніше: показати на фіксовані 350мс — але WebView перескладає layout
  // серією resize-подій і часто не встигає, тому «криво» було видно.
  // Тепер: оверлей висить, ПОКИ йдуть resize-події (+300мс тиші), потім фід
  // ре-снапиться до активної картки (висота слайда змінилась — scrollTop у px
  // вказував би «між» картками) і оверлей плавно зникає.
  const [rotating, setRotating] = useState(false);
  const [rotFading, setRotFading] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const r = { active: false, settleT: null, failT: null, fadeT: null };

    const finish = () => {
      if (!r.active) return;
      r.active = false;
      clearTimeout(r.settleT);
      clearTimeout(r.failT);
      // Ре-снап фіда до активної картки (тільки коли фід видимий)
      const el = containerRef.current;
      if (el && el.clientHeight > 0) {
        el.scrollTo({ top: activeIndexRef.current * el.clientHeight, behavior: 'instant' });
      }
      setRotFading(true);
      r.fadeT = setTimeout(() => { setRotating(false); setRotFading(false); }, 220);
    };
    const settle = () => {
      clearTimeout(r.settleT);
      r.settleT = setTimeout(finish, 300); // 300мс без resize = layout устаканився
    };
    const begin = () => {
      clearTimeout(r.fadeT);
      setRotFading(false);
      setRotating(true);
      r.active = true;
      settle();
      clearTimeout(r.failT);
      r.failT = setTimeout(finish, 1600); // страховка: оверлей ніколи не висне
    };
    const onResize = () => { if (r.active) settle(); };

    // Safari/old WebViews: matchMedia 'change' may not fire — orientationchange is the fallback
    mq.addEventListener?.('change', begin);
    window.addEventListener('orientationchange', begin);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(r.settleT); clearTimeout(r.failT); clearTimeout(r.fadeT);
      mq.removeEventListener?.('change', begin);
      window.removeEventListener('orientationchange', begin);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // --- Telegram User & Data (local-first: starts from localStorage) ---
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({
    saves: readLS(LS_SAVES),
    watched: readLS(LS_WATCHED),
    shared: readLS(LS_SHARED),
    partnerId: ''
  });
  const [wishlistInitTab, setWishlistInitTab] = useState('mine');
  const [partnerId, setPartnerId] = useState('');
  const [partnerData, setPartnerData] = useState({ saves: [], watched: [] });
  const reconciled = useRef(false);

  // Fresh refs so save/watch/share handlers can be STABLE (useCallback([]))
  // — that's what makes React.memo(VideoCard) actually skip re-renders.
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  const userDataRef = useRef(userData);
  useEffect(() => { userDataRef.current = userData; }, [userData]);
  useEffect(() => { moviesRef.current = movies; }, [movies]);

  // --- Toast feedback ---
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // --- Modals ---
  const [showFilters, setShowFilters] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // --- Global Audio State ---
  // everUnmuted: чи вмикав користувач звук хоч раз за сесію. Поки ні —
  // перший тап по відео вмикає звук (жест для WebView) замість паузи.
  const [isGlobalMuted, setIsGlobalMutedRaw] = useState(true);
  const [everUnmuted, setEverUnmuted] = useState(false);
  const setIsGlobalMuted = useCallback((muted) => {
    setIsGlobalMutedRaw(muted);
    if (muted === false) setEverUnmuted(true);
  }, []);

  // --- Genre map for filter summary ---
  const [genreMap, setGenreMap] = useState({});

  // --- Filters (multi-select) ---
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

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

      // Guard: another Telegram account was used on this device before.
      // localStorage is shared per-bot across accounts, so the previous
      // owner's local saves would otherwise be reconciled INTO this
      // account's cloud list ("movies I never added").
      const prevOwner = localStorage.getItem('qm_owner');
      if (prevOwner && prevOwner !== tgUser.uid) {
        writeLS(LS_SAVES, []);
        writeLS(LS_WATCHED, []);
        writeLS(LS_SHARED, []);
        localStorage.removeItem('qw_partner_id');
        localStorage.removeItem(LS_SEEN);
        setUserData({ saves: [], watched: [], shared: [], partnerId: '' });
      }
      localStorage.setItem('qm_owner', tgUser.uid);

      setUser(tgUser);
      await ensureUserDoc(tgUser.uid);
      saveUserProfile(tgUser); // so the partner sees who they're connected with

      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

      // Deep link to a title: startapp=m_<id> (movie) / s_<id> (series)
      const mediaLink = startParam?.match(/^(m|s)_(\d+)$/);
      if (mediaLink) {
        openSharedMedia(mediaLink[1] === 's', Number(mediaLink[2]));
        return;
      }

      // Invite link → partner connect, but ONLY with explicit consent
      // (before: anyone's link auto-linked watchlists both ways, silently)
      if (startParam && startParam !== tgUser.tgId.toString()) {
        const newPartnerId = `tg_${startParam.replace(/\D/g, '')}`;
        const alreadyLinked = localStorage.getItem('qw_partner_id') === newPartnerId;
        if (newPartnerId.length > 3 && !alreadyLinked) {
          const ok = await confirmDialog('З\'єднати вотчлісти з користувачем, який надіслав запрошення? Ви бачитимете спільні збереження одне одного.');
          if (!ok) return;
          setPartnerId(newPartnerId);
          localStorage.setItem('qw_partner_id', newPartnerId);
          try {
            await updateUserPartnerId(tgUser.uid, newPartnerId);      // me -> partner
            await updateUserPartnerId(newPartnerId, tgUser.uid);      // partner -> me (accept invite both ways)
            showToast('Вотчлісти з\'єднано ✓');
          } catch (e) {
            console.warn('Partner link failed:', e?.message);
          }
        }
      }
    };
    initUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- User Data Subscription (merges remote with local-pending saves once) ---
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUser(user.uid, (docSnap) => {
      if (!docSnap.exists()) return;
      const remote = docSnap.data();
      const tombSaves = tombSet('saves');
      const tombShared = tombSet('shared');
      const tombWatched = tombSet('watched');

      // One-time reconcile: push local-only saves/shared (made while offline)
      // to Firestore — але БЕЗ видалених (tombstone), інакше видалене воскресає
      const localSaves = readLS(LS_SAVES);
      const localShared = readLS(LS_SHARED);
      const missing = localSaves.filter(id => !(remote.saves || []).includes(id) && !tombSaves.has(id));
      const missingShared = localShared.filter(id => !(remote.shared || []).includes(id) && !tombShared.has(id));
      if ((missing.length > 0 || missingShared.length > 0) && !reconciled.current) {
        reconciled.current = true;
        // Single write instead of one request per movie
        reconcileUserData(user.uid, { saves: missing, shared: missingShared }).catch(() => {});
      }

      // Cloud-heal: видалене досі лежить у хмарі (видалення було офлайн або
      // запис не пройшов) → прибираємо там ще раз, одним записом
      const staleSaves = (remote.saves || []).filter(id => tombSaves.has(id));
      const staleShared = (remote.shared || []).filter(id => tombShared.has(id));
      const staleWatched = (remote.watched || []).filter(id => tombWatched.has(id));
      if (staleSaves.length > 0 || staleShared.length > 0 || staleWatched.length > 0) {
        removeUserData(user.uid, { saves: staleSaves, shared: staleShared, watched: staleWatched }).catch(() => {});
      }

      const merged = {
        ...remote,
        saves: [...new Set([...(remote.saves || []), ...missing])].filter(id => !tombSaves.has(id)),
        shared: [...new Set([...(remote.shared || []), ...missingShared])].filter(id => !tombShared.has(id)),
        watched: (remote.watched || []).filter(id => !tombWatched.has(id))
      };
      setUserData(merged);
      writeLS(LS_SAVES, merged.saves);
      writeLS(LS_WATCHED, merged.watched);
      writeLS(LS_SHARED, merged.shared);

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
    const prevPartner = partnerId;
    setPartnerId(id);
    localStorage.setItem('qw_partner_id', id);
    if (!user?.uid) return;
    try {
      if (id) {
        await updateUserPartnerId(user.uid, id);
        await updateUserPartnerId(id, user.uid); // two-way
      } else {
        await updateUserPartnerId(user.uid, '');
        // Symmetric unlink: also clear the partner's pointer to me
        // (before: they kept seeing my ⭐ after I disconnected)
        if (prevPartner) await unlinkPartner(user.uid, prevPartner);
      }
    } catch (e) { console.warn(e); }
  };

  // --- Load Movies (smart feed when no filters, discover otherwise) ---
  const hasActiveFilters = (filters.genreIds?.length > 0) || (filters.countries?.length > 0) ||
    filters.minRating > 0 || filters.personId || filters.yearFrom || filters.yearTo ||
    filters.type !== 'all' || filters.upcoming;

  const loadMovies = useCallback(async (pageNum = 1, reset = false) => {
    // Race guard: a filter change (reset) must cancel any in-flight load,
    // otherwise the old fetch finishes AFTER the feed was cleared and fills
    // it with movies that don't match the new filters.
    if (isFetching.current && !reset) return;
    const seq = reset ? ++loadSeq.current : loadSeq.current;
    setLoading(true);
    if (reset) setFeedEnded(false);
    isFetching.current = true;

    try {
      const validMovies = [];
      const watched = userData?.watched || [];
      let cursor = pageNum;

      // A whole page can be filtered away (seen/watched/quality) — an empty
      // feed is worse than a repeat, so we walk up to 3 pages and on the
      // last attempt the seen-memory is ignored.
      for (let attempt = 0; attempt < 3 && validMovies.filter(v => v.trailerKey).length < 4; attempt++) {
      const ignoreSeen = attempt === 2;
      const data = hasActiveFilters
        ? await discoverWithFilters({
            type: filters.type,
            genreIds: filters.genreIds,
            countries: filters.countries,
            minRating: filters.minRating,
            personId: filters.personId,
            yearFrom: filters.yearFrom,
            yearTo: filters.yearTo,
            upcoming: filters.upcoming,
            page: cursor
          })
        : await getSmartFeed(cursor, userData?.saves || []);
      cursor++;
      if (!data.results || data.results.length === 0) break;

      // Pass 1: cheap filtering → candidate list (max 14 per page)
      const candidates = [];
      for (const m of data.results) {
        const isTV = m.media_type === 'tv' || (!m.title && m.name) || m.first_air_date;
        const key = isTV ? `tv_${m.id}` : m.id;
        // TMDB pagination can repeat a title across pages within one batch —
        // duplicates would produce duplicate React keys (undefined behaviour)
        if (candidates.some(c => c.m.id === m.id && c.isTV === isTV)) continue;
        if (validMovies.some(v => v.id === m.id && v.type === (isTV ? 'series' : 'movie'))) continue;
        if (watched.includes(key)) continue;
        // Recently seen trailers are skipped in the smart feed (not in search-like filters)
        if (!hasActiveFilters && !ignoreSeen && isSeenRecently(key)) continue;
        candidates.push({ m, isTV });
        if (candidates.length >= 14) break;
      }

      // Pass 2: details for the whole page IN PARALLEL (was: one-by-one await —
      // the single biggest source of slow feed loading)
      const settled = await Promise.allSettled(
        candidates.map(c => c.isTV ? getTVDetailsWithVideos(c.m.id) : getMovieDetailsWithVideos(c.m.id))
      );

      settled.forEach((resu, i) => {
        if (resu.status !== 'fulfilled') {
          console.warn(`Failed to fetch details for ${candidates[i].m.id}`);
          return;
        }
        const { m, isTV } = candidates[i];
        const details = resu.value;
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
      });
      }

      // Stale fetch (filters changed mid-flight) → throw the results away
      if (seq !== loadSeq.current) return;

      // End-of-feed detection BEFORE the state update (setMovies updater runs later)
      const existingKeys = new Set(moviesRef.current.map(p => `${p.type}_${p.id}`));
      const freshCount = validMovies.filter(v => !existingKeys.has(`${v.type}_${v.id}`)).length;
      if (!reset && freshCount === 0) setFeedEnded(true);

      setMovies(prev => {
        if (reset) {
          // A deep-linked/AI-opened movie must survive the initial reset load
          const pinned = pinnedRef.current;
          if (pinned) {
            return [pinned, ...validMovies.filter(v => !(v.id === pinned.id && v.type === pinned.type))];
          }
          return validMovies;
        }
        // Dedupe by type+id — movie and TV ids collide across types
        const currentKeys = new Set(prev.map(p => `${p.type}_${p.id}`));
        const newItems = validMovies.filter(v => !currentKeys.has(`${v.type}_${v.id}`));
        return [...prev, ...newItems];
      });
      setPage(cursor);
      setLoadError(false);
    } catch (e) {
      console.error("Failed to load movies:", e);
      if (seq === loadSeq.current) setLoadError(true);
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        isFetching.current = false;
      }
    }
  }, [filters, hasActiveFilters, userData?.watched, userData?.saves]);

  // --- Initial Load / filter change ---
  useEffect(() => {
    setMovies([]);
    setPage(1);
    setActiveIndex(0);
    loadMovies(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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

    // ×5 екранів: підвантаження стартує раніше — до скелетона доскролюєшся рідше
    if (scrollHeight - scrollTop <= clientHeight * 5 && !loading && !isFetching.current && !feedEnded && !loadError) {
      loadMovies(page);
    }
  };

  // --- Local-first mutation: instant UI + localStorage, then Firestore sync ---
  const applyLocal = useCallback((changes) => {
    setUserData(prev => {
      const next = { ...prev, ...changes };
      writeLS(LS_SAVES, next.saves || []);
      writeLS(LS_WATCHED, next.watched || []);
      writeLS(LS_SHARED, next.shared || []);
      return next;
    });
  }, []);

  // NOTE: the three toggles below are STABLE (useCallback + refs) so that
  // React.memo(VideoCard) can skip re-rendering ~20 iframe cards on every toast.
  // They accept a movie object (feed) or a ready storage key (wishlist).

  // --- Toggle Save (works ALWAYS — with or without Firebase) ---
  const handleToggleSave = useCallback(async (arg) => {
    const movieId = keyOf(arg);
    const cur = userDataRef.current;
    const isSaved = cur.saves?.includes(movieId);
    if (isSaved) addTomb('saves', movieId); else clearTomb('saves', movieId);
    const newSaves = isSaved
      ? (cur.saves || []).filter(id => id !== movieId)
      : [...(cur.saves || []), movieId];
    applyLocal({ saves: newSaves });
    showToast(isSaved ? 'Прибрано' : 'Додано ❤');

    const u = userRef.current;
    if (u) {
      try {
        await toggleSaveMovie(u.uid, movieId, isSaved);
      } catch (e) {
        console.error("Save sync error:", e);
      }
    }
  }, [applyLocal, showToast]);

  // --- Toggle Watched ---
  // Watch: the movie MOVES from the saved list to "Переглянуті" (not deleted).
  // Un-watch: it moves back to the saved list.
  const handleToggleWatched = useCallback(async (arg) => {
    const movieId = keyOf(arg);
    const cur = userDataRef.current;
    const isWatched = cur.watched?.includes(movieId);
    if (isWatched) {
      // не бачив → повертається у мій список
      addTomb('watched', movieId);
      clearTomb('saves', movieId);
      applyLocal({
        watched: (cur.watched || []).filter(id => id !== movieId),
        saves: [...new Set([...(cur.saves || []), movieId])]
      });
      showToast('Повернуто у список ❤');
    } else {
      // бачив → переїжджає зі збережених ТА зі спільних у переглянуті
      addTomb('saves', movieId);
      clearTomb('watched', movieId);
      const wasShared = cur.shared?.includes(movieId);
      if (wasShared) addTomb('shared', movieId);
      applyLocal({
        watched: [...(cur.watched || []), movieId],
        saves: (cur.saves || []).filter(id => id !== movieId),
        shared: (cur.shared || []).filter(id => id !== movieId)
      });
      showToast('Позначено як переглянуте ✓');

      const u = userRef.current;
      if (u) {
        try {
          await toggleMovieWatched(u.uid, movieId, isWatched);
          if (wasShared) await removeUserData(u.uid, { shared: [movieId] });
        } catch (e) {
          console.error("Watched sync error:", e);
        }
      }
      return;
    }

    const u = userRef.current;
    if (u) {
      try {
        await toggleMovieWatched(u.uid, movieId, isWatched);
      } catch (e) {
        console.error("Watched sync error:", e);
      }
    }
  }, [applyLocal, showToast]);

  // --- Toggle Shared (⭐) ---
  const handleToggleShared = useCallback(async (arg) => {
    const movieId = keyOf(arg);
    const cur = userDataRef.current;
    const isShared = cur.shared?.includes(movieId);
    if (isShared) addTomb('shared', movieId); else clearTomb('shared', movieId);
    const newShared = isShared
      ? (cur.shared || []).filter(id => id !== movieId)
      : [...(cur.shared || []), movieId];
    applyLocal({ shared: newShared });
    showToast(isShared ? 'Прибрано зі Спільних' : 'Додано у Спільні ⭐');

    const u = userRef.current;
    if (u) {
      try {
        await toggleSharedMovie(u.uid, movieId, isShared);
      } catch (e) {
        console.error("Shared sync error:", e);
      }
    }
  }, [applyLocal, showToast]);

  // --- Повне видалення: з усіх трьох списків одразу (🗑 у картці фільму) ---
  const handleRemoveCompletely = useCallback(async (arg) => {
    const movieId = keyOf(arg);
    const cur = userDataRef.current;
    addTomb('saves', movieId);
    addTomb('shared', movieId);
    addTomb('watched', movieId);
    applyLocal({
      saves: (cur.saves || []).filter(id => id !== movieId),
      shared: (cur.shared || []).filter(id => id !== movieId),
      watched: (cur.watched || []).filter(id => id !== movieId)
    });
    showToast('Видалено з усіх списків');

    const u = userRef.current;
    if (u) {
      try {
        await removeUserData(u.uid, { saves: [movieId], shared: [movieId], watched: [movieId] });
      } catch (e) {
        console.error('Remove sync error:', e);
      }
    }
  }, [applyLocal, showToast]);

  // --- Open watchlist on a specific tab (from profile dashboard tiles) ---
  const openListFromProfile = (tab) => {
    setShowProfile(false);
    setWishlistInitTab(tab);
    handleTabChange('watchlist');
  };

  // --- Watch Trailer from AI Search / deep link ---
  const handleWatchTrailer = useCallback((movie) => {
    pinnedRef.current = movie; // survives a concurrent reset load
    setMovies(prev => [movie, ...prev.filter(m => !(m.id === movie.id && m.type === movie.type))]);
    setActiveIndex(0);
    setActiveTab('feed');
    setFeedEnded(false);
    feedScrollPos.current = 0;
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    // Активні фільтри могли б виключити саме цей фільм із фіду → скидаємо їх,
    // щоб обраний трейлер точно показався (pinnedRef тримає його зверху).
    // Якщо фільтрів немає — повертаємо той самий обʼєкт, щоб не перезбирати фід.
    setFilters(prev => {
      const active = (prev.genreIds?.length > 0) || (prev.countries?.length > 0) ||
        prev.minRating > 0 || prev.personId || prev.yearFrom || prev.yearTo ||
        prev.type !== 'all' || prev.upcoming;
      return active ? DEFAULT_FILTERS : prev;
    });
  }, []);

  // --- Deep link (startapp=m_<id> / s_<id>) → open that title's card on top of the feed ---
  const openSharedMedia = async (isTV, id) => {
    try {
      const details = isTV ? await getTVDetailsWithVideos(id) : await getMovieDetailsWithVideos(id);
      const credits = getCreditsInfo(details);
      const movie = {
        id,
        title: details.title || details.name,
        overview: details.overview,
        vote_average: details.vote_average,
        release_date: details.release_date || details.first_air_date,
        backdrop_path: details.backdrop_path,
        poster_path: details.poster_path,
        trailerKey: getTrailerKey(details),
        director: credits.director,
        actors: credits.actors,
        country: details.production_countries?.[0]?.iso_3166_1 || details.origin_country?.[0] || '',
        type: isTV ? 'series' : 'movie'
      };
      // The feed renders only cards with a trailer (feedMovies filter)
      if (movie.trailerKey) handleWatchTrailer(movie);
      else showToast(`«${movie.title}» — трейлер недоступний`);
    } catch (e) {
      console.warn('Deep link failed:', e?.message);
    }
  };

  // --- Apply Filters ---
  const handleSetFilters = (newFilters) => {
    pinnedRef.current = null; // manual filter change releases the pinned card
    setFilters(newFilters);
  };

  // --- Filtered movies for feed ---
  const feedMovies = movies.filter(m => m.trailerKey);

  // --- Remember which trailer the user is currently watching ---
  // Only after 2.5s: a card the user swiped past in half a second should NOT
  // disappear from the feed for 3 days.
  useEffect(() => {
    if (activeTab !== 'feed') return;
    const current = feedMovies[activeIndex];
    if (!current) return;
    const t = setTimeout(() => markSeen(mediaKey(current)), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeTab, feedMovies.length]);

  // --- Release reminder: Telegram-bot message on release day ---
  // Stable callback (memo-friendly). Returns false when there's no Telegram
  // user — VideoCard then falls back to Google Calendar.
  const handleRemind = useCallback((movie) => {
    const u = userRef.current;
    if (!u?.tgId) return false;
    addReleaseReminder(u.uid, {
      id: movie.id,
      title: movie.title,
      date: movie.release_date
    })
      .then(() => showToast('Нагадаємо в Telegram у день виходу 🔔'))
      .catch((e) => {
        console.warn('Reminder save failed:', e?.message);
        showToast('Не вдалося зберегти нагадування');
      });
    return true;
  }, [showToast]);

  // --- Filter summary text ---
  const filterSummary = getFilterSummary(filters, genreMap);
  const hasFilters = filterSummary.length > 0;

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
                isSaved={userData.saves?.includes(mediaKey(movie))}
                onToggleSave={handleToggleSave}
                isGlobalMuted={isGlobalMuted}
                setIsGlobalMuted={setIsGlobalMuted}
                everUnmuted={everUnmuted}
                notify={showToast}
                onRemind={handleRemind}
                preload={index === activeIndex + 1}
              />
            ))}

            {/* Скелетон замість спінера: виглядає як картка, тому підміна
                на реальний трейлер не «миготить» */}
            {loading && (
              <div className="h-[100dvh] w-full snap-start relative bg-black overflow-hidden">
                <FeedSkeleton />
              </div>
            )}

            {/* End of feed: honest "that's all" card instead of a dead last screen */}
            {feedEnded && !loading && (
              <div className="h-[100dvh] w-full snap-start flex flex-col items-center justify-center text-center p-6 bg-black">
                <Film size={40} className="text-white/20 mb-3" />
                <p className="text-white/70 font-bold mb-1">Це всі трейлери за цими фільтрами</p>
                <p className="text-white/35 text-sm mb-5">Змініть або скиньте фільтри, щоб побачити більше</p>
                <button
                  onClick={() => setShowFilters(true)}
                  className="px-6 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 font-semibold text-sm active:scale-95 transition-transform"
                >
                  Змінити фільтри
                </button>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="h-[100dvh] w-full relative bg-black overflow-hidden">
            <FeedSkeleton />
          </div>
        ) : loadError ? (
          <div className="h-[100dvh] flex flex-col items-center justify-center text-center p-6 bg-black">
            <Film size={48} className="text-white/20 mb-4" />
            <h3 className="text-xl font-bold mb-2">Не вдалося завантажити</h3>
            <p className="text-white/40 text-sm mb-4">Перевірте інтернет і спробуйте ще раз</p>
            <button
              onClick={() => loadMovies(1, true)}
              className="px-6 py-2.5 rounded-full bg-white text-black font-semibold text-sm active:scale-95 transition-transform"
            >
              Спробувати ще раз
            </button>
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
          myShared={userData.shared || []}
          partnerShared={partnerData.shared || []}
          partnerId={partnerId}
          partnerProfile={partnerData}
          myPhoto={user?.photoURL}
          initialTab={wishlistInitTab}
          onToggleSave={handleToggleSave}
          onToggleWatched={handleToggleWatched}
          onToggleShared={handleToggleShared}
          onRemove={handleRemoveCompletely}
          watched={userData.watched || []}
          onGoToProfile={() => setShowProfile(true)}
          notify={showToast}
          onWatchTrailer={handleWatchTrailer}
        />
      )}

      {/* ===== AI SEARCH TAB (always mounted — the chat must survive tab switches) ===== */}
      <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
        <AISearchTab onWatchTrailer={handleWatchTrailer} />
      </div>

      {/* ===== TOAST (зверху, під шапкою — не перекривається клавіатурою/кнопками) ===== */}
      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[60] pointer-events-none toast-in"
          style={{ top: 'calc(var(--app-top) + 46px)' }}
        >
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
          onOpenList={openListFromProfile}
        />
      )}

      {/* ===== ROTATION SKELETON =====
          Оверлей той самий, що й скелетон фіда: висить, поки WebView шле
          resize-події, потім фід ре-снапиться і оверлей плавно розчиняється —
          «криве» перескладання iframe користувач не бачить. */}
      {rotating && (
        <div className={`fixed inset-0 z-[100] bg-black pointer-events-auto transition-opacity duration-200 ${rotFading ? 'opacity-0' : 'opacity-100'}`}>
          <FeedSkeleton />
        </div>
      )}
    </div>
  );
}
