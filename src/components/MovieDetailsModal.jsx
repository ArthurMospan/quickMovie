import { useState, useEffect, useRef } from 'react';
import { X, Star, Film, Tv, Play, Copy, Calendar, Clock } from 'lucide-react';
import { getMovieDetailsWithVideos, getTVDetailsWithVideos, getWatchProviders, getTrailerKey, getCreditsInfo } from '../services/tmdb';
import { copyToClipboard, haptic } from '../services/ui';

const IMG = 'https://image.tmdb.org/t/p/';

const formatRuntime = (min) => {
  if (!min) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} год${m ? ` ${m} хв` : ''}` : `${m} хв`;
};

const seasonsLabel = (n) => {
  if (!n) return null;
  if (n === 1) return '1 сезон';
  if (n >= 2 && n <= 4) return `${n} сезони`;
  return `${n} сезонів`;
};

function ProviderRow({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider w-16 shrink-0 pt-2.5">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 8).map(p => (
          <div key={p.provider_id} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl pl-1 pr-2.5 py-1">
            <img src={`${IMG}w92${p.logo_path}`} alt="" className="w-6 h-6 rounded-md" loading="lazy" />
            <span className="text-[11px] font-semibold text-white/80">{p.provider_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Модалка деталей фільму (bottom-sheet у стилі фільтрів/профілю).
 * movie — slim-обʼєкт зі списку (з _key), повні деталі довантажуються тут.
 */
export default function MovieDetailsModal({ movie, onClose, onWatchTrailer, notify }) {
  const isTv = movie.media_type === 'tv' || String(movie._key || '').startsWith('tv_');
  const [details, setDetails] = useState(null);
  const [providers, setProviders] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Sheet drag-to-close (як у FiltersModal) ---
  const sheetRef = useRef(null);
  const headerRef = useRef(null);
  const scrollRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragRef = useRef({ startY: 0, startTime: 0, offset: 0, dragging: false, eligible: false });
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [d, p] = await Promise.allSettled([
          isTv ? getTVDetailsWithVideos(movie.id) : getMovieDetailsWithVideos(movie.id),
          getWatchProviders(isTv, movie.id)
        ]);
        if (!alive) return;
        if (d.status === 'fulfilled') setDetails(d.value);
        if (p.status === 'fulfilled') setProviders(p.value);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      const d = dragRef.current;
      d.startY = e.touches[0].clientY;
      d.startTime = Date.now();
      d.offset = 0;
      d.dragging = false;
      const inHeader = headerRef.current && headerRef.current.contains(e.target);
      d.eligible = inHeader || !scrollRef.current || scrollRef.current.scrollTop <= 0;
    };
    const onTouchMove = (e) => {
      const d = dragRef.current;
      const diff = e.touches[0].clientY - d.startY;
      if (!d.eligible && scrollRef.current && scrollRef.current.scrollTop <= 0 && diff > 0) {
        d.eligible = true;
        d.startY = e.touches[0].clientY;
        return;
      }
      if (!d.eligible) return;
      if (!d.dragging) {
        if (diff > 6) { d.dragging = true; setIsDragging(true); }
        else if (diff < -6) { d.eligible = false; return; }
        else return;
      }
      if (e.cancelable) e.preventDefault();
      const clamped = Math.max(0, diff);
      d.offset = clamped * (clamped > 100 ? 0.4 : 0.85);
      setDragOffset(d.offset);
    };
    const onTouchEnd = () => {
      const d = dragRef.current;
      if (!d.dragging) return;
      d.dragging = false;
      setIsDragging(false);
      const velocity = d.offset / Math.max(Date.now() - d.startTime, 1);
      if (d.offset > 110 || (velocity > 0.5 && d.offset > 40)) {
        setIsClosing(true);
        setTimeout(() => onCloseRef.current(), 300);
      } else {
        d.offset = 0;
        setDragOffset(0);
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const animateClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  };

  const title = details?.title || details?.name || movie.title || movie.name;
  const original = details?.original_title || details?.original_name || movie.original_title || movie.original_name;
  const showOriginal = original && original !== title;
  const year = (details?.release_date || details?.first_air_date || movie.release_date || '').split('-')[0];
  const poster = (details?.poster_path || movie.poster_path) ? `${IMG}w342${details?.poster_path || movie.poster_path}` : null;
  const vote = details?.vote_average || 0;
  const votes = details?.vote_count || 0;
  const runtime = isTv ? seasonsLabel(details?.number_of_seasons) : formatRuntime(details?.runtime);
  const country = details?.production_countries?.[0]?.iso_3166_1 || details?.origin_country?.[0] || '';
  const trailerKey = details ? getTrailerKey(details) : null;
  const credits = details ? getCreditsInfo(details) : null;
  const upcoming = (details?.release_date || movie.release_date) && new Date(details?.release_date || movie.release_date) > new Date();
  const hasProviders = providers && ((providers.flatrate?.length || 0) + (providers.rent?.length || 0) + (providers.buy?.length || 0) > 0);

  const handleCopyTitle = () => {
    const full = showOriginal ? `${title} / ${original}` : title;
    copyToClipboard(full);
    haptic('success');
    notify?.('Назву скопійовано 📋');
  };

  const handleTrailer = () => {
    if (!details || !trailerKey || !onWatchTrailer) return;
    onWatchTrailer({
      id: movie.id,
      title,
      overview: details.overview,
      vote_average: details.vote_average,
      release_date: details.release_date || details.first_air_date,
      backdrop_path: details.backdrop_path,
      poster_path: details.poster_path,
      trailerKey,
      director: credits?.director,
      actors: credits?.actors || [],
      country,
      type: isTv ? 'series' : 'movie'
    });
    onClose();
  };

  const openJustWatch = () => {
    if (!providers?.link) return;
    const wa = window.Telegram?.WebApp;
    if (typeof wa?.openLink === 'function') {
      try { wa.openLink(providers.link); return; } catch (e) { /* fall through */ }
    }
    window.open(providers.link, '_blank');
  };

  const sheetStyle = {
    transform: isClosing ? 'translateY(100%)' : `translateY(${dragOffset}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={animateClose}
      ></div>
      <div
        ref={sheetRef}
        style={sheetStyle}
        className="sheet-modal relative w-full bg-[#111] border-t border-white/10 rounded-t-3xl flex flex-col max-h-[88vh] animate-in"
      >
        {/* Header = зона перетягування */}
        <div ref={headerRef} className="shrink-0 pt-3 pb-1" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1.5 bg-white/30 rounded-full mx-auto mb-2"></div>
          <button
            onClick={animateClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 active:scale-90 transition-transform z-10"
          >
            <X size={14} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-5" style={{ overscrollBehavior: 'contain' }}>

          {/* Афіша + назва + бейджі */}
          <div className="flex gap-4 mb-4">
            <div className="w-28 shrink-0 rounded-2xl overflow-hidden border border-white/10 aspect-[2/3] bg-white/5">
              {poster ? (
                <img src={poster} alt={title} className="w-full h-full object-cover" draggable={false} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20"><Film size={28} /></div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center">
              {/* Назва — тап = копіювати */}
              <button onClick={handleCopyTitle} className="no-callout text-left active:opacity-60 transition-opacity">
                <h2 className="text-lg font-bold text-white leading-snug">
                  {title}
                  <Copy size={12} className="inline-block ml-1.5 text-white/30 align-baseline" />
                </h2>
                {showOriginal && (
                  <p className="text-[13px] text-white/45 font-medium mt-0.5 leading-snug">{original}</p>
                )}
              </button>

              {/* Бейджі */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span className="flex items-center gap-1 bg-white/10 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white/80">
                  {isTv ? <Tv size={10} /> : <Film size={10} />} {isTv ? 'Серіал' : 'Фільм'}
                </span>
                {year && (
                  <span className="flex items-center gap-1 bg-white/10 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white/80">
                    <Calendar size={10} /> {year}
                  </span>
                )}
                {runtime && (
                  <span className="flex items-center gap-1 bg-white/10 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white/80">
                    <Clock size={10} /> {runtime}
                  </span>
                )}
                {country && (
                  <span className="bg-white/10 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white/80">{country}</span>
                )}
                {upcoming && (
                  <span className="bg-white text-black rounded-full px-2 py-0.5 text-[10px] font-bold">Скоро</span>
                )}
              </div>

              {/* Рейтинг */}
              {vote > 0 && (
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Star size={14} className="text-white fill-white" />
                  <span className="text-sm font-bold text-white">{vote.toFixed(1)}</span>
                  {votes > 0 && <span className="text-[11px] text-white/40">({votes.toLocaleString('uk-UA')} голосів)</span>}
                </div>
              )}
            </div>
          </div>

          {/* Жанри */}
          {details?.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {details.genres.map(g => (
                <span key={g.id} className="bg-white/5 border border-white/10 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/60">{g.name}</span>
              ))}
            </div>
          )}

          {/* Де подивитись */}
          <div className="mb-4">
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2.5">Де подивитись</p>
            {loading ? (
              <div className="h-10 rounded-xl bg-white/5 animate-shimmer"></div>
            ) : hasProviders ? (
              <div className="space-y-2.5">
                {!providers.isUA && (
                  <p className="text-[10px] text-white/30">Для України даних немає — показано US</p>
                )}
                <ProviderRow label="Підписка" items={providers.flatrate} />
                <ProviderRow label="Оренда" items={providers.rent} />
                <ProviderRow label="Купівля" items={providers.buy} />
                {providers.link && (
                  <button onClick={openJustWatch} className="text-[11px] text-white/40 underline underline-offset-2 active:text-white/70">
                    Більше на JustWatch →
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/35">Немає даних про стрімінги для цього тайтла</p>
            )}
          </div>

          {/* Опис */}
          {(details?.overview || movie.overview) && (
            <div className="mb-4">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Опис</p>
              <p className="text-sm text-white/70 leading-relaxed">{details?.overview || movie.overview}</p>
            </div>
          )}

          {/* Знімальна група */}
          {credits && (credits.director !== 'Невідомо' || credits.actors.length > 0) && (
            <div className="mb-2 space-y-1">
              {credits.director !== 'Невідомо' && (
                <p className="text-[12px] text-white/50"><span className="text-white/30 font-semibold">Режисер:</span> {credits.director}</p>
              )}
              {credits.actors.length > 0 && (
                <p className="text-[12px] text-white/50"><span className="text-white/30 font-semibold">У ролях:</span> {credits.actors.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        {/* Кнопка трейлера */}
        {trailerKey && onWatchTrailer && (
          <div className="shrink-0 px-5 pt-2 pb-6">
            <button
              onClick={handleTrailer}
              className="w-full bg-white text-black font-bold py-3.5 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Play size={16} fill="currentColor" /> Дивитись трейлер
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
