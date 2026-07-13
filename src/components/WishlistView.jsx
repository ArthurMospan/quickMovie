import { useState, useMemo, useEffect, useRef } from 'react';
import { Heart, Star, Eye, Check, Users, Film, Trash2, RotateCcw } from 'lucide-react';
import { getMediaByIds } from '../services/tmdb';
import { copyToClipboard, haptic } from '../services/ui';
import MovieDetailsModal from './MovieDetailsModal';

// Full display title: "Українська / Original Title" (when they differ)
const getFullTitle = (movie) => {
  const original = movie.original_title || movie.original_name;
  return original && original !== movie.title ? `${movie.title} / ${original}` : movie.title;
};

function MiniAvatar({ src, fallback }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setErr(true)} className="w-5 h-5 rounded-full object-cover ring-1 ring-black/60" />;
  }
  return (
    <div className="w-5 h-5 rounded-full bg-zinc-700 ring-1 ring-black/60 flex items-center justify-center text-[8px] font-bold text-white/80">
      {fallback || '?'}
    </div>
  );
}

/**
 * variant:
 *  'mine'    — star (add to shared) + trash (unsave) + check (mark watched)
 *  'shared'  — adder avatars; star (filled) to remove IF I added it
 *  'watched' — restore (return to my list)
 */
function MovieCard({ movie, variant, isShared, isWatched, partnerSaw, sharedByMe, sharedByPartner, myPhoto, partnerPhoto, partnerName, onToggleSave, onToggleWatched, onToggleShared, notify, onOpen }) {
  const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null;
  const fullTitle = getFullTitle(movie);
  const pressTimer = useRef(null);
  const longFired = useRef(false); // long-press спрацював → наступний click ігноруємо

  // Long-press anywhere on the card → copy the title (+ вібрація)
  const pressStart = () => {
    longFired.current = false;
    pressTimer.current = setTimeout(() => {
      longFired.current = true;
      copyToClipboard(fullTitle);
      haptic('success');
      notify?.('Назву скопійовано 📋');
    }, 500);
  };
  const pressEnd = () => clearTimeout(pressTimer.current);

  // Звичайний тап по картці (не по кнопках) → модалка деталей
  const handleClick = (e) => {
    if (longFired.current) { longFired.current = false; return; }
    if (e.target.closest('button')) return;
    onOpen?.(movie);
  };

  return (
    <div
      className="no-callout bg-[#111] rounded-2xl overflow-hidden relative aspect-[2/3] border border-white/5 cursor-pointer"
      onClick={handleClick}
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
          className={`absolute inset-0 w-full h-full object-cover transition-all ${variant === 'watched' || (variant === 'shared' && isWatched) ? 'opacity-30 grayscale' : 'opacity-90'}`}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center text-white/20">
          <Film size={32} />
        </div>
      )}

      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3 ${variant === 'mine' ? 'pr-11' : ''}`}>
        <h3 className="font-bold text-[13px] leading-tight text-white mb-0.5 line-clamp-2">
          {movie.title}
          {(movie.original_title || movie.original_name) && (movie.original_title || movie.original_name) !== movie.title && (
            <span className="text-white/50 font-medium"> / {movie.original_title || movie.original_name}</span>
          )}
        </h3>
        <p className="text-[11px] text-white/50">{movie.release_date?.split('-')[0]}</p>

        {/* Who added it to shared (avatars, top-left) */}
        {variant === 'shared' && (
          <div className="absolute top-2 left-2 flex -space-x-1.5">
            {sharedByMe && <MiniAvatar src={myPhoto} fallback="Я" />}
            {sharedByPartner && <MiniAvatar src={partnerPhoto} fallback={partnerName?.[0]?.toUpperCase()} />}
          </div>
        )}

        {/* Партнер уже бачив цей тайтл (з його watched-списку) */}
        {variant === 'shared' && partnerSaw && (
          <div className="absolute top-8 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full pl-1.5 pr-2 py-0.5 border border-white/10">
            <Eye size={9} className="text-white/80" />
            <span className="text-[8px] font-bold text-white/80">{partnerName ? `${partnerName.split(' ')[0]} бачив` : 'Партнер бачив'}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex flex-col gap-2">
          {variant === 'mine' && (
            <>
              <button
                onClick={() => onToggleShared(movie._key ?? movie.id)}
                className={`p-2 backdrop-blur-md rounded-full border active:scale-90 transition-transform ${isShared ? 'bg-white text-black border-white' : 'bg-black/50 text-white/70 border-white/10'}`}
                title={isShared ? 'Прибрати зі Спільних' : 'Додати у Спільні'}
              >
                <Star size={14} className={isShared ? 'fill-current' : ''} />
              </button>
              <button
                onClick={() => onToggleWatched(movie._key ?? movie.id)}
                className="p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-white/60 active:scale-90 transition-transform"
                title="Позначити переглянутим"
              >
                <Check size={14} />
              </button>
            </>
          )}

          {variant === 'shared' && (
            <>
              <button
                onClick={() => onToggleWatched(movie._key ?? movie.id)}
                className={`p-2 backdrop-blur-md rounded-full border active:scale-90 transition-transform ${isWatched ? 'bg-white text-black border-white' : 'bg-black/50 text-white/60 border-white/10'}`}
                title={isWatched ? 'Повернути (не бачив)' : 'Позначити «Бачив»'}
              >
                <Eye size={14} />
              </button>
              {sharedByMe && (
                <button
                  onClick={() => onToggleShared(movie._key ?? movie.id)}
                  className="p-2 bg-white text-black rounded-full active:scale-90 transition-transform shadow-lg"
                  title="Прибрати зі Спільних"
                >
                  <Star size={14} className="fill-current" />
                </button>
              )}
            </>
          )}

          {variant === 'watched' && (
            <button
              onClick={() => onToggleWatched(movie._key ?? movie.id)}
              className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 active:scale-90 transition-transform"
              title="Повернути у список"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        {/* Delete — bottom-right corner, far from the other actions */}
        {variant === 'mine' && (
          <button
            onClick={() => onToggleSave(movie._key ?? movie.id)}
            className="absolute bottom-2 right-2 p-2 bg-black/50 backdrop-blur-md rounded-full text-white/60 border border-white/10 active:scale-90 transition-transform"
            title="Прибрати зі списку"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {(variant === 'watched' || (variant === 'shared' && isWatched)) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 border border-white/20">
            <Check size={24} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function WishlistView({
  mySaves, myShared, partnerShared, partnerId, partnerProfile, myPhoto, initialTab,
  onToggleSave, onToggleWatched, onToggleShared, watched, onGoToProfile, notify, onWatchTrailer
}) {
  const [tab, setTab] = useState(initialTab || 'mine');
  const [moviesCache, setMoviesCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // фільм для модалки деталей

  // Shared list = MY starred + PARTNER's starred (union)
  const sharedIds = useMemo(() => {
    const ids = new Set([...(myShared || [])]);
    if (partnerId) (partnerShared || []).forEach(id => ids.add(id));
    return Array.from(ids);
  }, [myShared, partnerShared, partnerId]);

  // Fetch details for everything we might show
  const allIds = useMemo(() => {
    return Array.from(new Set([...mySaves, ...watched, ...sharedIds]));
  }, [mySaves, watched, sharedIds]);

  useEffect(() => {
    const fetchMissing = async () => {
      const missing = allIds.filter(id => !moviesCache[id]);
      if (missing.length === 0) return;
      setLoading(true);
      try {
        // Batched + persistently cached: big lists no longer hammer TMDB
        // (429 made titles silently vanish); onBatch renders progressively.
        const fetched = await getMediaByIds(missing, (partial) => {
          setMoviesCache(prev => ({ ...prev, ...partial }));
        });
        setMoviesCache(prev => ({ ...prev, ...fetched }));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds]);

  // Each item carries its storage key (_key): series are stored as 'tv_<id>',
  // movies as a bare id. All toggles must use _key, NOT movie.id — otherwise
  // toggling a series would create/remove a bare id that resolves to a movie.
  const withKey = (id) => (moviesCache[id] ? { ...moviesCache[id], _key: id } : null);
  // Списки зберігаються у порядку додавання (push у кінець) —
  // для показу розвертаємо: останні додані першими.
  const myItems = useMemo(() => [...mySaves].reverse().map(withKey).filter(Boolean), [mySaves, moviesCache]);
  const watchedItems = useMemo(() => [...watched].reverse().map(withKey).filter(Boolean), [watched, moviesCache]);
  const sharedItems = useMemo(() => [...sharedIds].reverse().map(withKey).filter(Boolean), [sharedIds, moviesCache]);

  const partnerName = partnerProfile?.name || null;

  return (
    // z-50 коли відкрита модалка деталей: інакше TopNav (z-40) висів би над нею
    <div className={`absolute inset-0 ${selected ? 'z-50' : 'z-10'} bg-[#0a0a0a] flex flex-col`} style={{ paddingTop: 'var(--app-top)' }}>

      {/* Tabs: ❤ Мій · ⭐ Спільні · 👁 Бачив */}
      <div className="wl-tabs shrink-0 px-4 pb-4">
        <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl">
          <button
            onClick={() => setTab('mine')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${tab === 'mine' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Heart size={12} className={tab === 'mine' ? 'fill-current' : ''} /> Мій ({myItems.length})
          </button>
          <button
            onClick={() => setTab('shared')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${tab === 'shared' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Star size={12} className={tab === 'shared' ? 'fill-current' : ''} /> Спільні ({sharedItems.length})
          </button>
          <button
            onClick={() => setTab('watched')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${tab === 'watched' ? 'bg-white/20 text-white' : 'text-white/40'}`}
          >
            <Eye size={12} /> Бачив ({watchedItems.length})
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
            <div className="wl-grid grid grid-cols-2 gap-3">
              {myItems.map(movie => (
                <MovieCard
                  key={movie._key} movie={movie} variant="mine"
                  isShared={myShared?.includes(movie._key)}
                  onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} onToggleShared={onToggleShared}
                  notify={notify} onOpen={setSelected}
                />
              ))}
            </div>
          </>
        )}

        {/* ===== SHARED ===== */}
        {tab === 'shared' && (
          <>
            {/* Connected partner avatars */}
            {partnerId && (
              <div className="flex items-center gap-2 mb-4 animate-in">
                <div className="flex -space-x-2">
                  <MiniAvatar src={myPhoto} fallback="Я" />
                  <MiniAvatar src={partnerProfile?.photo} fallback={partnerName?.[0]?.toUpperCase()} />
                </div>
                <p className="text-[11px] text-white/40 font-medium">
                  {partnerName ? `Разом з ${partnerName}` : 'Партнер ще не відкрив додаток'}
                </p>
              </div>
            )}

            {!partnerId && (
              <div className="text-center p-6 bg-white/5 border border-white/10 rounded-2xl mb-4 animate-in">
                <Users className="text-white/30 mx-auto mb-3" size={32} />
                <p className="text-sm text-white/60 mb-4">Запросіть друга у профілі — і збирайте спільний список на вечір.</p>
                <button onClick={onGoToProfile} className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform">
                  Запросити
                </button>
              </div>
            )}

            {sharedItems.length === 0 && !loading && (
              <div className="text-center p-8 animate-in">
                <Star className="text-white/20 mx-auto mb-3" size={36} />
                <p className="text-white/40 text-sm font-medium">
                  Тисніть ⭐ на фільмі у вкладці «Мій» — і він з'явиться тут для вас обох
                </p>
              </div>
            )}

            <div className="wl-grid grid grid-cols-2 gap-3">
              {sharedItems.map(movie => (
                <MovieCard
                  key={movie._key} movie={movie} variant="shared"
                  isWatched={watched?.includes(movie._key)}
                  partnerSaw={(partnerProfile?.watched || []).includes(movie._key)}
                  sharedByMe={myShared?.includes(movie._key)}
                  sharedByPartner={partnerShared?.includes(movie._key)}
                  myPhoto={myPhoto}
                  partnerPhoto={partnerProfile?.photo}
                  partnerName={partnerName}
                  onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} onToggleShared={onToggleShared}
                  notify={notify} onOpen={setSelected}
                />
              ))}
            </div>
          </>
        )}

        {/* ===== WATCHED ===== */}
        {tab === 'watched' && (
          <>
            {watchedItems.length === 0 && !loading && (
              <div className="text-center p-8 mt-6 animate-in">
                <Eye className="text-white/20 mx-auto mb-3" size={40} />
                <p className="text-white/40 text-sm font-medium">Позначайте переглянуте ✓ у своєму списку — воно збережеться тут, а не зникне</p>
              </div>
            )}
            <div className="wl-grid grid grid-cols-2 gap-3">
              {watchedItems.map(movie => (
                <MovieCard
                  key={movie._key} movie={movie} variant="watched"
                  onToggleSave={onToggleSave} onToggleWatched={onToggleWatched} onToggleShared={onToggleShared}
                  notify={notify} onOpen={setSelected}
                />
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

      {/* Модалка деталей фільму (стан кнопок живе тут — оновлюється одразу) */}
      {selected && (
        <MovieDetailsModal
          movie={selected}
          onClose={() => setSelected(null)}
          onWatchTrailer={onWatchTrailer}
          notify={notify}
          isSaved={mySaves?.includes(selected._key)}
          isShared={myShared?.includes(selected._key)}
          isWatched={watched?.includes(selected._key)}
          onToggleSave={onToggleSave}
          onToggleShared={onToggleShared}
          onToggleWatched={onToggleWatched}
        />
      )}
    </div>
  );
}
