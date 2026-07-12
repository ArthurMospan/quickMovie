import { useState, useRef, useEffect, useMemo } from 'react';
import { Heart, Share, Star, CheckCircle2, VolumeX, Volume2, Bell, Play } from 'lucide-react';

// How many px of the YouTube player we crop from top & bottom.
// YouTube UI (title bar, avatar, "watch on youtube", watermark, controls)
// physically lives in these zones — cropping removes it for real.
const YT_CROP = 60;

function ActionBtn({ icon, label, onClick, className = '' }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 group active:scale-90 transition-transform ${className}`}>
      <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:bg-white/20 transition-colors">
        {icon}
      </div>
      <span className="text-[9px] font-bold text-white drop-shadow-md">{label}</span>
    </button>
  );
}

function isUpcoming(releaseDateStr) {
  if (!releaseDateStr) return false;
  return new Date(releaseDateStr) > new Date(new Date().setHours(0,0,0,0));
}

function formatDateUA(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function openCalendarReminder(movie) {
  const d = new Date(movie.release_date);
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Прем'єра: "+movie.title)}&dates=${ds}/${ds}&details=${encodeURIComponent(movie.overview||'')}`;
  window.open(url, '_blank');
}

export default function VideoCard({
  movie, active, isSaved, onToggleSave,
  isGlobalMuted, setIsGlobalMuted, isFirstVideo, onRemind
}) {
  const iframeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedState, setSpeedState] = useState(1);
  const [copied, setCopied] = useState(false);
  // Warm-up cover: hides YouTube's control flashes (back/pause/forward) that the
  // mobile player shows for a moment when we fire autoplay/mute JS-API commands.
  const [warmingUp, setWarmingUp] = useState(true);
  const speeds = [1, 1.2, 1.5, 2];
  const upcoming = useMemo(() => isUpcoming(movie.release_date), [movie.release_date]);
  // Latest mute state without re-running the activation effect (extra JS-API
  // commands = extra YouTube control flashes).
  const mutedRef = useRef(isGlobalMuted);
  useEffect(() => { mutedRef.current = isGlobalMuted; }, [isGlobalMuted]);
  const revealTimer = useRef(null);
  const playingRef = useRef(false); // real player state from YT events
  const [embedError, setEmbedError] = useState(false);

  // TMDB backdrop first: YouTube's maxresdefault.jpg often doesn't exist and
  // renders as the ugly grey "3 dots" placeholder. hqdefault always exists.
  const thumbnailUrl = movie.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    : (movie.trailerKey ? `https://img.youtube.com/vi/${movie.trailerKey}/hqdefault.jpg` : null);

  const sendCommand = (func, args = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }), '*'
      );
    } catch (e) { /* iframe not ready */ }
  };

  // When card becomes active, try autoplay + set state.
  // Keep JS-API commands to a minimum — each one can make the mobile player
  // flash its native controls for a moment. The URL already starts muted, so
  // we only send unMute when sound is on (one command less = one flash less).
  useEffect(() => {
    if (!active) {
      setIsPlaying(false);
      return;
    }
    setWarmingUp(true);
    setEmbedError(false);
    playingRef.current = false;
    setIsPlaying(true); // optimistic: autoplay starts by itself; events correct this
    const t1 = setTimeout(() => {
      // Autoplay usually starts by itself; a redundant playVideo on an
      // already-playing video makes YouTube flash its pause bezel.
      if (!playingRef.current) sendCommand('playVideo');
      setIsPlaying(true);
      if (!mutedRef.current) sendCommand('unMute');
    }, 900);
    // Reveal is event-driven (onStateChange "playing" below) so YouTube's
    // start-up pause/play bezel stays hidden; this is only a safety fallback.
    const tWarm = setTimeout(() => setWarmingUp(false), 3500);
    return () => { clearTimeout(t1); clearTimeout(tWarm); clearTimeout(revealTimer.current); };
  }, [active]);

  // Loop via JS API instead of loop=1&playlist=... — playlist mode is what
  // makes YouTube render the prev/pause/next control trio on mobile.
  useEffect(() => {
    if (!active) return;
    const onMsg = (e) => {
      if (typeof e.data !== 'string' || !/youtube/.test(e.origin)) return;
      let d;
      try { d = JSON.parse(e.data); } catch (err) { return; }
      const state = d?.event === 'onStateChange' ? d.info : d?.info?.playerState;
      // Broken / non-embeddable video → show our own fallback, not YT's grey box
      if (d?.event === 'onError') {
        setEmbedError(true);
        setWarmingUp(false);
        return;
      }
      // Video ended → restart (manual loop, no end screen)
      if (state === 0) {
        playingRef.current = false;
        sendCommand('seekTo', [0, true]);
        sendCommand('playVideo');
      }
      if (state === 2) playingRef.current = false;
      // Actually playing → wait out YouTube's start-up pause bezel, then reveal
      if (state === 1) {
        playingRef.current = true;
        setIsPlaying(true);
        clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => setWarmingUp(false), 1500);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [active]);

  // Handshake so the iframe starts posting onStateChange events to us
  const handleIframeLoad = () => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: movie.trailerKey, channel: 'widget' }), '*'
      );
    } catch (e) { /* not ready */ }
  };

  // --- Tap to play/pause ---
  const handlePlayPause = () => {
    if (isPlaying) {
      sendCommand('pauseVideo');
      setIsPlaying(false);
    } else {
      sendCommand('playVideo');
      setIsPlaying(true);
      if (!isGlobalMuted) sendCommand('unMute');
    }
  };

  const handleSpeedChange = () => {
    const nextSpeed = speeds[(speeds.indexOf(speedState) + 1) % speeds.length];
    setSpeedState(nextSpeed);
    sendCommand('setPlaybackRate', [nextSpeed]);
  };

  const handleToggleMute = () => {
    const newMuted = !isGlobalMuted;
    setIsGlobalMuted(newMuted);
    sendCommand(newMuted ? 'mute' : 'unMute');
  };

  const handleOverlayUnmute = () => {
    setIsGlobalMuted(false);
    sendCommand('unMute');
    sendCommand('playVideo');
    setIsPlaying(true);
  };

  const handleShare = () => {
    const url = movie.trailerKey
      ? `https://www.youtube.com/watch?v=${movie.trailerKey}`
      : `https://www.themoviedb.org/movie/${movie.id}`;
    if (navigator.share) {
      navigator.share({ title: movie.title, text: `Заціни: ${movie.title}`, url }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // --- No trailer ---
  if (!movie.trailerKey) {
    return (
      <div className="relative w-full h-[100dvh] snap-start bg-black flex flex-col items-center justify-center overflow-hidden">
        {movie.backdrop_path && (
          <>
            <img src={`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm" />
            <div className="absolute inset-0 bg-black/50"></div>
          </>
        )}
        <div className="relative z-10 text-center p-6">
          <p className="text-white/50 text-sm mb-2">Трейлер не знайдено</p>
          <h2 className="text-white text-xl font-bold">{movie.title}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] snap-start bg-black flex items-center justify-center overflow-hidden">

      {/* 1. Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover opacity-70 blur-[70px] scale-125 saturate-[2]" />
        )}
        <div className="absolute inset-0 bg-black/40"></div>
      </div>

      {/* 2. Video stage: 16:9 box, overflow-hidden. The iframe inside is
             TALLER than the box by 2*YT_CROP, so YouTube's own UI
             (top title bar + bottom controls/watermark) is cropped away. */}
      <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none">
        <div className="yt-stage">
          {active && embedError ? (
            <>
              {thumbnailUrl && (
                <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <p className="text-white/70 text-sm font-semibold">Трейлер недоступний — свайпніть далі</p>
              </div>
            </>
          ) : active ? (
            <>
              <iframe
                ref={iframeRef}
                onLoad={handleIframeLoad}
                className="absolute left-0 w-full"
                style={{ top: `-${YT_CROP}px`, height: `calc(100% + ${YT_CROP * 2}px)` }}
                src={`https://www.youtube.com/embed/${movie.trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&origin=${encodeURIComponent(window.location.origin)}`}
                frameBorder="0"
                allow="autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                title={movie.title}
              ></iframe>
              {/* Warm-up cover: fully hides the player while start-up commands fire */}
              <div className={`absolute inset-0 z-[8] bg-black transition-opacity duration-500 ${warmingUp ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {thumbnailUrl && (
                  <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              {/* Extra safety masks while PAUSED (YouTube shows "More videos" shelf on pause) */}
              {!isPlaying && (
                <>
                  <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-[6]"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent z-[6]"></div>
                </>
              )}
            </>
          ) : (
            thumbnailUrl && (
              <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            )
          )}
        </div>
      </div>

      {/* 3. Bottom Gradient */}
      <div className="landscape-hide absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90 pointer-events-none z-20"></div>

      {/* 4. PLAY/PAUSE tap zone — covers the whole card (iframe never gets taps) */}
      {active && (
        <button
          onClick={handlePlayPause}
          className="absolute inset-0 pointer-events-auto"
          style={{ zIndex: 25 }}
        >
          {!isPlaying && !warmingUp && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 animate-pulse">
                <Play size={40} className="text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </button>
      )}

      {/* 5. First-run "Tap to unmute" overlay */}
      {active && isFirstVideo && isGlobalMuted && isPlaying && (
        <button
          onClick={(e) => { e.stopPropagation(); handleOverlayUnmute(); }}
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto bg-black/30"
        >
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl px-8 py-5 flex flex-col items-center gap-3 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
              <VolumeX size={32} className="text-white/80" />
            </div>
            <p className="text-white font-bold text-base">Натисніть, щоб увімкнути звук</p>
            <p className="text-white/50 text-xs">Або свайпайте далі без звуку</p>
          </div>
        </button>
      )}

      {/* Right Actions (portrait: right column; landscape: bottom row via CSS) */}
      <div className={`landscape-actions absolute right-3 bottom-20 flex flex-col items-center gap-4 z-30 pointer-events-auto transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
        <ActionBtn
          icon={<Heart size={24} className={isSaved ? 'fill-white text-white' : 'text-white'} />}
          label={isSaved ? "Додано" : "Зберегти"}
          onClick={onToggleSave}
        />

        {upcoming ? (
          <ActionBtn
            icon={<Bell size={22} className="text-white" />}
            label="Нагадати"
            onClick={() => onRemind ? onRemind(movie) : openCalendarReminder(movie)}
          />
        ) : (
          <ActionBtn icon={<div className="font-bold text-white text-sm">x{speedState}</div>} label="Швидкість" onClick={handleSpeedChange} />
        )}

        <ActionBtn
          icon={copied ? <CheckCircle2 size={22} className="text-white" /> : <Share size={20} className="text-white" />}
          label={copied ? "Скопійовано" : "Поділитись"}
          onClick={handleShare}
        />

        <ActionBtn
          icon={isGlobalMuted ? <VolumeX size={20} className="text-white/60" /> : <Volume2 size={20} className="text-white" />}
          label={isGlobalMuted ? "Увімкнути" : "Вимкнути"}
          onClick={handleToggleMute}
        />
      </div>

      {/* Bottom Info */}
      <div className={`landscape-info absolute bottom-4 left-4 right-20 z-30 flex flex-col gap-1.5 pointer-events-none text-white drop-shadow-lg transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
        {upcoming && (
          <span className="bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold self-start mb-0.5">
            Вихід: {formatDateUA(movie.release_date)}
          </span>
        )}
        <h2 className="text-2xl font-bold leading-tight drop-shadow-md">{movie.title}</h2>
        <p className="text-sm text-white/90 line-clamp-3 font-medium drop-shadow-md">{movie.overview}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs font-semibold text-white/90">
          <span className="flex items-center gap-1">
            <Star size={12} className="text-white fill-white" />
            {(movie.vote_average || 0).toFixed(1)}
          </span>
          <span>•</span>
          <span>{movie.release_date?.split('-')[0] || movie.year || '—'}</span>
          {movie.country && (<><span>•</span><span>{movie.country}</span></>)}
        </div>
        {movie.director && (
          <div className="text-[11px] text-white/70 font-medium drop-shadow-md">Реж: {movie.director}</div>
        )}
      </div>
    </div>
  );
}
