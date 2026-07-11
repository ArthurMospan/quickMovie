import { useState, useMemo, useEffect, useRef } from 'react';
import { Heart, Check, Users, Film, Trash2, RotateCcw, Plus } from 'lucide-react';
import { getMediaById } from '../services/tmdb';

const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  legacyCopy(text);
  return Promise.resolve();
};
const legacyCopy = (text) => {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
};

// Full display title: "Українська / Original Title" (when they differ)
const getFullTitle = (movie) => {
  const original = movie.original_title || movie.original_name;
  return original && original !== movie.title ? `${movie.title} / ${original}` : movie.title;
};

/**
 * variant:
 *  'mine'    — trash (unsave) + check (mark watched)
 *  'partner' — plus-heart (add to MY list → creates a match)
 *  'watched' — restore (return to my list)
 */
function MovieCard({ movie, variant, onToggleSave, onToggleWatched, notify }) {
  const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null;
  const fullTitle = getFullTitle(movie);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  // Long-press anywhere on the card → copy the title
  const pressStart = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      copyToClipboard(fullTitle);
      notify?.('Назву скопійовано 📋');
    }, 500);
  };
  const pressEnd = () => clearTimeout(pressTimer.current);

  return (
    <div
      className="no-callout bg-[#111] rounded-2xl overflow-hidden relative aspect-[2/3] border border-white/5"
      onTouchStart={pressStart}
      onTouchEnd={pressEnd}
      onTouchMove={pressEnd}
      onMouseDown={pressStart}
      onMouseUp={pressEnd}
      onMouseLeave={pressEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={movie.title}
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover transition-all ${variant === 'watched' ? 'opacity-30 grayscale' : 'opacity-90'}`}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center text-white/20">
          <Film size={32} />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3">
        <h3 className="font-bold text-[13px] leading-tight text-white mb-0.5 line-clamp-2">
          {movie.title}
          {(movie.original_title || movie.original_name) && (movie.original_title || movie.original_name) !== movie.title && (
            <span className="text-white/50 font-medium"> / {movie.original_title || movie.original_name}</span>
          )}
        </h3>
        <p className="text-[11px] text-white/50">{movie.release_date?.split('-')[0]}</p>

        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex flex-col gap-2">
          {variant === 'mine' && (
            <>
              <button
                onClick={() => onToggleSave(movie.id)}
                className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 active:scale-90 transition-transform"
                title="Прибрати зі списку"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => onToggleWatched(movie.id)}
                className="p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-white/60 active:scale-90 transition-transform"
                title="Позначити переглянутим"
              >
                <Check size={14} />
              </button>
            </>
          )}

          {variant === 'partner' && (
            <button
              onClick={() => onToggleSave(movie.id)}
              className="p-2 bg-white text-black rounded-full active:scale-90 transition-transform shadow-lg"
              title="Додати у мій список"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          )}

          {variant === 'watched' && (
            <button
              onClick={() => onToggleWatched(movie.id)}
              className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 active:scale-90 transition-transform"
              title="Повернути у список"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Watched overlay */}
      {variant === 'watched' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 border border-white/20">
            <Check size={24} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function WishlistView({ mySaves, partnerSaves, partnerId, partnerProfile, onToggleSave, onToggleWatched, watched, onGoToProfile, notify }) {
  const [tab, setTab] = useState('mine');
  const [moviesCache, setMoviesCache] = useState({});
  const [loading, setLoading] = useState(false);

  // Fetch details for everything we might show: my saves + partner saves + watched
  const allIds = useMemo(() => {
    const ids = new Set([...mySaves, ...watched]);
    if (partnerId) partnerSaves.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [mySaves, partnerSaves, partnerId, watched]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds]);

  const myItems = useMemo(() => mySaves.map(id => moviesCache[id]).filter(Boolean), [mySaves, moviesCache]);
  const watchedItems = useMemo(() => watched.map(id => moviesCache[id]).filter(Boolean), [watched, moviesCache]);
  const matchItems = useMemo(() => {
    if (!partnerId) return [];
    return mySaves.filter(id => partnerSaves.includes(id)).map(id => moviesCache[id]).filter(Boolean);
  }, [mySaves, partnerSaves, partnerId, moviesCache]);
  // Partner's saves that I have NOT saved yet — tap ➕ to create a match
  const partnerOnlyItems = useMemo(() => {
    if (!partnerId) return [];
    return partnerSaves.filter(id => !mySaves.includes(id)).map(id => moviesCache[id]).filter(Boolean);
  }, [mySaves, partnerSaves, partnerId, moviesCache]);

  return (
    <div className="absolute inset-0 z-10 bg-[#0a0a0a] flex flex-col" style={{ paddingTop: 'var(--app-top)' }}>

      {/* Tabs */}
      <div className="shrink-0 px-4 pb-4">
        <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl">
          <button
            onClick={() => setTab('mine')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${tab === 'mine' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            Мій ({myItems.length})
          </button>
          <button
            onClick={() => setTab('matches')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${tab === 'matches' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Heart size={12} className={tab === 'matches' ? 'fill-current' : ''} /> Спільні ({matchItems.length})
          </button>
          <button
            onClick={() => setTab('watched')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${tab === 'watched' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Check size={12} /> Бачив ({watchedItems.length})
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 scrollbar-hide">

        {/* ===== MINE ===== */}
        {tab === 'mine' && (
          <>
            {myItems.length === 0 && !loading && (
              <div className="text-center p-8 mt-6 animate-in">
                <Film className="text-white/20 mx-auto mb-3" size={40} />
                <p className="text-white/40 text-sm font-medium">Зберігайте фільми з фіду, натискаючи ❤️</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {myItems.map(movie => (
                <MovieCard key={movie.id} movie={movie} variant="mine" onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} notify={notify} />
              ))}
            </div>
          </>
        )}

        {/* ===== MATCHES ===== */}
        {tab === 'matches' && (
          <>
            {!partnerId ? (
              <div className="text-center p-6 bg-white/5 border border-white/10 rounded-2xl mt-6 animate-in">
                <Users className="text-white/30 mx-auto mb-3" size={32} />
                <p className="text-sm text-white/60 mb-4">Запросіть партнера у профілі, щоб бачити спільні фільми.</p>
                <button onClick={onGoToProfile} className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform">
                  Відкрити профіль
                </button>
              </div>
            ) : (
              <>
                {/* Partner info bar */}
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
                      Збігів: {matchItems.length} · у списку партнера: {partnerSaves.length}
                    </p>
                  </div>
                </div>

                {/* Matched movies */}
                {matchItems.length === 0 && partnerOnlyItems.length === 0 && !loading && (
                  <div className="text-center p-8 animate-in">
                    <Heart className="text-white/20 mx-auto mb-3" size={36} />
                    <p className="text-white/40 text-sm font-medium">Поки немає спільних фільмів.<br />Збіг з'являється, коли ви ОБОЄ зберегли один фільм.</p>
                  </div>
                )}

                {matchItems.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {matchItems.map(movie => (
                      <MovieCard key={movie.id} movie={movie} variant="mine" onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} notify={notify} />
                    ))}
                  </div>
                )}

                {/* Partner's list — tap ➕ to match */}
                {partnerOnlyItems.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
                      У списку {partnerProfile?.name ? partnerProfile.name.split(' ')[0] : 'партнера'} — тисни ➕ якщо теж хочеш
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {partnerOnlyItems.map(movie => (
                        <MovieCard key={movie.id} movie={movie} variant="partner" onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} notify={notify} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ===== WATCHED ===== */}
        {tab === 'watched' && (
          <>
            {watchedItems.length === 0 && !loading && (
              <div className="text-center p-8 mt-6 animate-in">
                <Check className="text-white/20 mx-auto mb-3" size={40} />
                <p className="text-white/40 text-sm font-medium">Позначайте переглянуте ✓ у своєму списку — воно збережеться тут, а не зникне</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {watchedItems.map(movie => (
                <MovieCard key={movie.id} movie={movie} variant="watched" onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} notify={notify} />
              ))}
            </div>
          </>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-white/10 border-t-white/50 rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
