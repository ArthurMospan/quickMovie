import { useState, useRef, useEffect, useMemo } from 'react';
import { Heart, Share2, Star, CheckCircle2, VolumeX, Volume2, Bell } from 'lucide-react';

function ActionBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group active:scale-90 transition-transform">
      <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:bg-white/20 transition-colors">
        {icon}
      </div>
      <span className="text-[9px] font-bold text-white drop-shadow-md">{label}</span>
    </button>
  );
}

// --- Upcoming / Release Date Helpers ---
function isUpcoming(releaseDateStr) {
  if (!releaseDateStr) return false;
  const releaseDate = new Date(releaseDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return releaseDate > today;
}

function formatDateUA(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function toGoogleCalendarDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function openCalendarReminder(movie) {
  const dateStr = toGoogleCalendarDate(movie.release_date);
  const title = encodeURIComponent(`Прем'єра: ${movie.title}`);
  const details = encodeURIComponent(movie.overview || '');
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}&details=${details}`;
  window.open(url, '_blank');
}

export default function VideoCard({ movie, active, isSaved, onToggleSave, isGlobalMuted, setIsGlobalMuted, isFirstVideo }) {
  const iframeRef = useRef(null);
  const [speedState, setSpeedState] = useState(1);
  const [copied, setCopied] = useState(false);
  const speeds = [1, 1.2, 1.5, 2];

  const upcoming = useMemo(() => isUpcoming(movie.release_date), [movie.release_date]);

  const thumbnailUrl = movie.trailerKey 
    ? `https://img.youtube.com/vi/${movie.trailerKey}/maxresdefault.jpg`
    : (movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null);

  // --- Send mute/unmute command to iframe ---
  const sendMuteCommand = (mute) => {
    if (iframeRef.current?.contentWindow) {
      const func = mute ? 'mute' : 'unMute';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: [] }), '*'
      );
    }
  };

  // --- Send playVideo command to force autoplay ---
  const sendPlayCommand = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
      );
    }
  };

  // --- When this card becomes active: force play + handle audio ---
  useEffect(() => {
    if (active) {
      // Force play after small delay to ensure iframe is ready
      const playTimer = setTimeout(() => sendPlayCommand(), 200);

      if (!isGlobalMuted) {
        const muteTimer = setTimeout(() => sendMuteCommand(false), 800);
        return () => { clearTimeout(playTimer); clearTimeout(muteTimer); };
      }
      return () => clearTimeout(playTimer);
    }
  }, [active, isGlobalMuted]);

  // --- Toggle global mute ---
  const handleToggleMute = () => {
    const newMuted = !isGlobalMuted;
    setIsGlobalMuted(newMuted);
    sendMuteCommand(newMuted);
  };

  // --- First-run overlay click (unmute) ---
  const handleOverlayUnmute = () => {
    setIsGlobalMuted(false);
    sendMuteCommand(false);
  };

  const handleSpeedChange = () => {
    const nextSpeed = speeds[(speeds.indexOf(speedState) + 1) % speeds.length];
    setSpeedState(nextSpeed);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [nextSpeed] }), '*'
      );
    }
  };

  const handleShare = () => {
    const url = movie.trailerKey 
      ? `https://www.youtube.com/watch?v=${movie.trailerKey}`
      : `https://www.themoviedb.org/movie/${movie.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: movie.title,
        text: `Заціни цей трейлер: ${movie.title}`,
        url: url
      }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try { 
        document.execCommand('copy'); 
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {}
      document.body.removeChild(textArea);
    });
  };

  // --- No trailer fallback ---
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
      
      {/* 1. Ambient Background Effect */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {thumbnailUrl && (
          <img 
            src={thumbnailUrl} 
            alt="" 
            className="w-full h-full object-cover opacity-70 blur-[70px] scale-125 saturate-[2]" 
          />
        )}
        <div className="absolute inset-0 bg-black/40"></div>
      </div>

      {/* 2. Video Player */}
      <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none">
        {active ? (
          <iframe
            ref={iframeRef}
            className="w-full aspect-video shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            src={`https://www.youtube.com/embed/${movie.trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&loop=1&playlist=${movie.trailerKey}&enablejsapi=1`}
            frameBorder="0" 
            allow="autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
            loading="lazy"
          ></iframe>
        ) : (
          thumbnailUrl && (
            <img 
              src={thumbnailUrl} 
              alt="" 
              className="w-full aspect-video object-cover shadow-[0_0_50px_rgba(0,0,0,0.8)]" 
              loading="lazy"
            />
          )
        )}
      </div>

      {/* 3. Bottom Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90 pointer-events-none z-20"></div>

      {/* 4. First-run "Tap to unmute" overlay — only on first active video when muted */}
      {active && isFirstVideo && isGlobalMuted && (
        <button
          onClick={handleOverlayUnmute}
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto bg-black/30"
        >
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl px-8 py-5 flex flex-col items-center gap-3 shadow-[0_8px_40px_rgba(0,0,0,0.5)] animate-zoom-in">
            <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
              <VolumeX size={32} className="text-white/80" />
            </div>
            <p className="text-white font-bold text-base">Натисніть, щоб увімкнути звук</p>
            <p className="text-white/50 text-xs">Або свайпайте далі без звуку</p>
          </div>
        </button>
      )}

      {/* TikTok Right Actions */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-30 pointer-events-auto">
        {/* Save / Like */}
        <ActionBtn 
          icon={<Heart size={24} className={isSaved ? 'fill-rose-500 text-rose-500' : 'text-white'} />} 
          label={isSaved ? "У watchlist" : "Зберегти"} 
          onClick={onToggleSave} 
        />
        
        {/* Upcoming → Remind Me | Normal → Speed */}
        {upcoming ? (
          <ActionBtn 
            icon={<Bell size={22} className="text-amber-400" />} 
            label="Нагадати" 
            onClick={() => openCalendarReminder(movie)} 
          />
        ) : (
          <ActionBtn 
            icon={<div className="font-bold text-white text-sm">x{speedState}</div>} 
            label="Швидкість" 
            onClick={handleSpeedChange} 
          />
        )}

        {/* Share */}
        <ActionBtn 
          icon={copied ? <CheckCircle2 size={22} className="text-emerald-400" /> : <Share2 size={22} className="text-white" />} 
          label={copied ? "Скопійовано" : "Поділитись"} 
          onClick={handleShare} 
        />

        {/* Single Mute/Unmute button */}
        <ActionBtn 
          icon={isGlobalMuted ? <VolumeX size={20} className="text-white/60" /> : <Volume2 size={20} className="text-white" />} 
          label={isGlobalMuted ? "Увімкнути" : "Вимкнути"} 
          onClick={handleToggleMute} 
        />
      </div>

      {/* TikTok Bottom Info */}
      <div className="absolute bottom-4 left-4 right-20 z-30 flex flex-col gap-1.5 pointer-events-none text-white drop-shadow-lg">
        {/* Coming Soon yellow badge */}
        {upcoming && (
          <span className="bg-yellow-400 text-black px-2 py-0.5 rounded text-[10px] font-bold self-start mb-0.5">
            Вихід: {formatDateUA(movie.release_date)}
          </span>
        )}

        <h2 className="text-2xl font-bold leading-tight drop-shadow-md">{movie.title}</h2>
        <p className="text-sm text-white/90 line-clamp-3 font-medium drop-shadow-md">{movie.overview}</p>
        
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs font-semibold text-white/90">
          <span className="flex items-center gap-1">
            <Star size={12} className="text-yellow-400 fill-yellow-400" /> 
            {(movie.vote_average || 0).toFixed(1)}
          </span>
          <span>•</span>
          <span>{movie.release_date?.split('-')[0] || movie.year || '—'}</span>
          {movie.country && (
            <>
              <span>•</span>
              <span>{movie.country}</span>
            </>
          )}
        </div>
        {movie.director && (
          <div className="text-[11px] text-white/70 font-medium drop-shadow-md">Реж: {movie.director}</div>
        )}
      </div>
    </div>
  );
}
