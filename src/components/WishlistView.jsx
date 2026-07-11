import { useState, useMemo, useEffect } from 'react';
import { Heart, Check, Users, Film, Trash2 } from 'lucide-react';
import { getMediaById } from '../services/tmdb';

export default function WishlistView({ mySaves, partnerSaves, partnerId, partnerProfile, onToggleSave, onToggleWatched, watched, onGoToProfile }) {
  const [tab, setTab] = useState('mine');
  const [moviesCache, setMoviesCache] = useState({});
  const [loading, setLoading] = useState(false);

  // Fetch movie details for all saved IDs
  const allIds = useMemo(() => {
    const ids = new Set([...mySaves]);
    if (partnerId) partnerSaves.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [mySaves, partnerSaves, partnerId]);

  useEffect(() => {
    const fetchMissing = async () => {
      const missing = allIds.filter(id => !moviesCache[id]);
      if (missing.length === 0) return;
      setLoading(true);
      try {
        const results = await Promise.allSettled(
          missing.map(id => getMediaById(id))
        );
        const newCache = { ...moviesCache };
        results.forEach((result, i) => {
          if (result.status === 'fulfilled' && result.value) {
            newCache[missing[i]] = result.value;
          }
        });
        setMoviesCache(newCache);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchMissing();
  }, [allIds]);

  const myItems = useMemo(() => mySaves.map(id => moviesCache[id]).filter(Boolean), [mySaves, moviesCache]);
  const matchItems = useMemo(() => {
    if (!partnerId) return [];
    return mySaves.filter(id => partnerSaves.includes(id)).map(id => moviesCache[id]).filter(Boolean);
  }, [mySaves, partnerSaves, partnerId, moviesCache]);

  const displayItems = tab === 'mine' ? myItems : matchItems;

  return (
    <div className="absolute inset-0 z-10 bg-[#0a0a0a] flex flex-col" style={{ paddingTop: 'var(--app-top)' }}>
      
      {/* Sticky Tabs */}
      <div className="shrink-0 px-4 pb-4">
        <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl">
          <button 
            onClick={() => setTab('mine')} 
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${tab === 'mine' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            Мій список ({myItems.length})
          </button>
          <button 
            onClick={() => setTab('matches')} 
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-2 ${tab === 'matches' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Heart size={12} className={tab === 'matches' ? 'fill-current' : ''} /> Спільні ({matchItems.length})
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 scrollbar-hide">

        {/* Partner info bar (matches tab) */}
        {tab === 'matches' && partnerId && (
          <div className="flex items-center gap-2.5 bg-white/[0.05] rounded-2xl px-3.5 py-2.5 mb-4 animate-in">
            {partnerProfile?.photo ? (
              <img src={partnerProfile.photo} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover ring-1 ring-white/15" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Users size={14} className="text-white/50" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {partnerProfile?.name ? `Спільно з ${partnerProfile.name}` : 'Партнер ще не відкрив додаток'}
              </p>
              <p className="text-[10px] text-white/40">
                У партнера збережено: {partnerSaves.length} · збігів: {matchItems.length}
              </p>
            </div>
          </div>
        )}

        {/* No partner message */}
        {tab === 'matches' && !partnerId && (
          <div className="text-center p-6 bg-white/5 border border-white/10 rounded-2xl mt-6 animate-in">
            <Users className="text-white/30 mx-auto mb-3" size={32} />
            <p className="text-sm text-white/60 mb-4">Додайте ID партнера у профілі, щоб бачити спільні фільми.</p>
            <button onClick={onGoToProfile} className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform">
              Відкрити профіль
            </button>
          </div>
        )}

        {/* Empty state */}
        {displayItems.length === 0 && (tab === 'mine' || (tab === 'matches' && partnerId)) && !loading && (
          <div className="text-center p-8 mt-6 animate-in">
            <Film className="text-white/20 mx-auto mb-3" size={40} />
            <p className="text-white/40 text-sm font-medium">
              {tab === 'mine' ? 'Зберігайте фільми з фіду, натискаючи ❤️' : 'Поки немає спільних фільмів'}
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-white/10 border-t-white/50 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-2 gap-3">
          {displayItems.map(movie => {
            const isWatched = watched.includes(movie.id);
            const posterUrl = movie.poster_path 
              ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
              : null;
            
            return (
              <div key={movie.id} className="bg-[#111] rounded-2xl overflow-hidden relative aspect-[2/3] border border-white/5 group">
                {posterUrl ? (
                  <img 
                    src={posterUrl} 
                    alt={movie.title} 
                    className={`absolute inset-0 w-full h-full object-cover transition-all ${isWatched ? 'opacity-20 grayscale' : 'opacity-90'}`} 
                  />
                ) : (
                  <div className="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center text-white/20">
                    <Film size={32} />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3">
                  <h3 className="font-bold text-sm leading-tight text-white mb-0.5">{movie.title}</h3>
                  <p className="text-[11px] text-white/50">{movie.release_date?.split('-')[0]}</p>
                  
                  {/* Action buttons — always visible on mobile */}
                  <div className="absolute top-2 right-2 flex flex-col gap-2">
                    <button 
                      onClick={() => onToggleSave(movie.id)} 
                      className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 active:scale-90 transition-transform"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => onToggleWatched(movie.id)} 
                      className={`p-2 backdrop-blur-md rounded-full border border-white/10 active:scale-90 transition-transform ${isWatched ? 'bg-white text-black' : 'bg-black/50 text-white/50'}`}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </div>

                {/* Watched overlay */}
                {isWatched && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 border border-white/20">
                      <Check size={24} className="text-white" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
