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
  getCreditsInfo 
} from './services/tmdb';
import { 
  auth, 
  subscribeToUser, 
  subscribeToPartner, 
  toggleSaveMovie,
  toggleMovieWatched
} from './services/firebase';
import { SlidersHorizontal, Film } from 'lucide-react';

// Random start page for variety (1–10)
const getRandomStartPage = () => Math.floor(Math.random() * 5) + 1;

export default function App() {
  // --- Tab State ---
  const [activeTab, setActiveTab] = useState('feed');

  // --- Feed State ---
  const [movies, setMovies] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(() => getRandomStartPage());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const isFetching = useRef(false);
  const feedScrollPos = useRef(0); // Preserve scroll position

  // --- Firebase Auth & Data ---
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({ saves: [], watched: [] });
  const [partnerId, setPartnerId] = useState('');
  const [partnerData, setPartnerData] = useState({ saves: [], watched: [] });

  // --- Modals ---
  const [showFilters, setShowFilters] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // --- Global Audio State ---
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);

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

  // --- Auth Listener ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      const savedPartner = localStorage.getItem('qw_partner_id');
      if (savedPartner) setPartnerId(savedPartner);
    });
    return () => unsubscribe();
  }, []);

  // --- User Data Subscription ---
  useEffect(() => {
    if (!user) {
      setUserData({ saves: [], watched: [] });
      return;
    }
    const unsub = subscribeToUser(user.uid, (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data());
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

  // --- Set Partner ID (with localStorage persistence) ---
  const handleSetPartnerId = (id) => {
    setPartnerId(id);
    localStorage.setItem('qw_partner_id', id);
  };

  // --- Load Movies from TMDB ---
  const loadMovies = useCallback(async (pageNum = 1, reset = false) => {
    if (isFetching.current) return;
    setLoading(true);
    isFetching.current = true;

    try {
      const type = filters.type === 'all' ? 'movie' : filters.type;
      
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

        try {
          const details = type === 'series' 
            ? await getTVDetailsWithVideos(m.id)
            : await getMovieDetailsWithVideos(m.id);
          
          const trailerKey = getTrailerKey(details);
          const credits = getCreditsInfo(details);

          validMovies.push({
            id: m.id,
            title: details.title || details.name || m.title || m.name,
            overview: details.overview || m.overview,
            vote_average: details.vote_average || m.vote_average,
            release_date: details.release_date || details.first_air_date || m.release_date,
            backdrop_path: m.backdrop_path || details.backdrop_path,
            poster_path: m.poster_path || details.poster_path,
            trailerKey,
            director: credits.director,
            actors: credits.actors,
            country: details.production_countries?.[0]?.iso_3166_1 || '',
            type
          });

          if (validMovies.filter(v => v.trailerKey).length >= 5) break;
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
    const startPage = hasActiveFilters ? 1 : getRandomStartPage();
    setMovies([]);
    setPage(startPage);
    setActiveIndex(0);
    loadMovies(startPage, true);
  }, [filters]);

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

  // --- Filtered movies for feed ---
  const feedMovies = movies.filter(m => m.trailerKey);

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
                <div className="w-14 h-14 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4"></div>
                <p className="font-semibold tracking-wide text-sm">Завантаження трейлерів...</p>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="h-[100dvh] w-full flex flex-col items-center justify-center text-white/50 bg-black">
            <div className="w-14 h-14 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4"></div>
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

        {/* Filter Button (floating, subtle) */}
        <button 
          onClick={() => setShowFilters(true)}
          className="absolute top-[70px] left-1/2 -translate-x-1/2 z-30 bg-black/20 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-full flex items-center gap-1.5 active:scale-95 transition-transform opacity-60 hover:opacity-100"
        >
          <SlidersHorizontal size={12} className="text-white/70" />
          <span className="text-[10px] font-bold text-white/70 tracking-widest uppercase">Фільтри</span>
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
