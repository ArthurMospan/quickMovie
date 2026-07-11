import { useState } from 'react';
import { X, Users, Smartphone, Copy, CheckCircle2, Send, Heart, Eye, Clapperboard, Timer, Cloud, CloudOff } from 'lucide-react';

const BOT_USERNAME = 'q_moviebot';

// Fun level based on watched count
const getLevel = (watched) => {
  if (watched >= 50) return 'Кіноман 🏆';
  if (watched >= 20) return 'Сінефіл';
  if (watched >= 5) return 'Кіноглядач';
  return 'Новачок';
};

export default function ProfileModal({ onClose, user, userData, partnerId, partnerProfile, setPartnerId, syncOk }) {
  const [inputId, setInputId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [partnerAvatarError, setPartnerAvatarError] = useState(false);

  const insideTG = !!window.Telegram?.WebApp?.initDataUnsafe?.user;

  const saved = userData?.saves?.length || 0;
  const watched = userData?.watched?.length || 0;
  const trailerMinutes = Math.round((saved + watched) * 2.4); // ~2.4 min per trailer

  const flash = (msg, ms = 2500) => {
    setConnectMsg(msg);
    setTimeout(() => setConnectMsg(''), ms);
  };

  const copyText = (text, okMsg) => {
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      if (okMsg) flash(okMsg);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        if (okMsg) flash(okMsg);
      }).catch(legacy);
    } else {
      legacy();
    }
  };

  const handleConnectPartner = () => {
    const trimmed = inputId.trim();
    if (!trimmed) return flash('Введіть ID партнера');
    if (trimmed === user?.uid) return flash('Не можна підключити самого себе');
    setPartnerId(trimmed);
    setInputId('');
    flash('✅ Партнера підключено!', 3000);
  };

  const inviteLink = user?.tgId ? `https://t.me/${BOT_USERNAME}?startapp=${user.tgId}` : null;

  const handleShareInvite = () => {
    if (!inviteLink) {
      flash('Відкрийте додаток через Telegram, щоб запрошувати друзів');
      return;
    }
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎬 Давай дивитись фільми разом! Відкрий — і наші вішлісти з\'єднаються:')}`;
    try {
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    } catch (e) {
      copyText(inviteLink, 'Посилання скопійовано — надішліть його другу');
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0][0]?.toUpperCase() || '?';
  };

  const partnerName = partnerProfile?.name || null;

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full sm:max-w-sm max-h-[90vh] overflow-y-auto scrollbar-hide bg-[#0b0b0b]/95 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in overflow-x-hidden">

        {/* Ambient glow — same visual language as the main screen */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] h-[340px] bg-purple-600/25 rounded-full blur-[110px]"></div>
        <div className="pointer-events-none absolute top-40 -left-20 w-[220px] h-[220px] bg-blue-500/15 rounded-full blur-[100px]"></div>

        {/* Header */}
        <div className="relative pt-9 pb-6 px-6 flex flex-col items-center">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/60 hover:text-white active:scale-90 transition-all">
            <X size={16} />
          </button>

          <div className="relative">
            {user?.photoURL && !avatarError ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-24 h-24 rounded-full object-cover shadow-[0_0_50px_rgba(168,85,247,0.35)] ring-1 ring-white/20"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white font-bold text-3xl shadow-[0_0_50px_rgba(168,85,247,0.35)] ring-1 ring-white/20">
                {getInitials(user?.displayName)}
              </div>
            )}
            {/* Level badge */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl px-2.5 py-0.5 rounded-full ring-1 ring-white/15 whitespace-nowrap">
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/80">{getLevel(watched)}</span>
            </div>
          </div>

          {user ? (
            <>
              <p className="mt-4 text-xl font-bold text-white drop-shadow-md">{user.displayName}</p>
              {user.username && <p className="text-xs text-white/40 mt-0.5">@{user.username}</p>}
            </>
          ) : (
            <>
              <p className="mt-4 text-xl font-bold text-white">Гість</p>
              <p className="text-xs text-white/40 text-center max-w-[240px] mt-1 leading-relaxed">
                Відкрийте додаток через бота <b className="text-white/70">@{BOT_USERNAME}</b>, щоб синхронізувати збереження
              </p>
            </>
          )}

          {/* Sync status */}
          <div className="mt-2.5 flex items-center gap-1.5">
            {user && syncOk !== false ? (
              <><Cloud size={11} className="text-emerald-400/80" /><span className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider">Синхронізовано</span></>
            ) : (
              <><CloudOff size={11} className="text-white/35" /><span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">Локальний режим</span></>
            )}
          </div>
        </div>

        <div className="relative px-5 pb-7 space-y-3">

          {/* Stats — glass tiles, no borders */}
          <div className="flex gap-2.5">
            <div className="flex-1 bg-white/[0.07] backdrop-blur-md py-4 rounded-2xl text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-white">
                <Heart size={16} className="text-white/50" /> {saved}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-1 tracking-wider">У списку</div>
            </div>
            <div className="flex-1 bg-white/[0.07] backdrop-blur-md py-4 rounded-2xl text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-white">
                <Eye size={16} className="text-white/50" /> {watched}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-1 tracking-wider">Переглянуто</div>
            </div>
          </div>

          {/* Fun mini-metrics */}
          <div className="flex gap-2.5">
            <div className="flex-1 bg-white/[0.04] py-2.5 px-3 rounded-2xl flex items-center gap-2.5">
              <Timer size={14} className="text-white/35 shrink-0" />
              <div className="text-[11px] text-white/50 leading-tight">≈ <b className="text-white/80">{trailerMinutes} хв</b> у трейлерах</div>
            </div>
            <div className="flex-1 bg-white/[0.04] py-2.5 px-3 rounded-2xl flex items-center gap-2.5">
              <Clapperboard size={14} className="text-white/35 shrink-0" />
              <div className="text-[11px] text-white/50 leading-tight">Відкрито <b className="text-white/80">{saved + watched}</b> тайтлів</div>
            </div>
          </div>

          {/* Partner / Shared Wishlist */}
          <div className="bg-white/[0.07] backdrop-blur-md rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5 text-white">
              <Users size={14} className="text-white/60" /> Спільний вішліст
            </h3>

            {partnerId ? (
              <div className="bg-black/30 p-3 rounded-xl flex items-center gap-3 mb-1">
                {partnerProfile?.photo && !partnerAvatarError ? (
                  <img
                    src={partnerProfile.photo}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setPartnerAvatarError(true)}
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-white/15 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white/70 font-bold text-sm ring-1 ring-white/15 shrink-0">
                    {getInitials(partnerName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {partnerName ? (
                    <>
                      <p className="text-sm font-bold text-white truncate">{partnerName}</p>
                      <p className="text-[10px] text-emerald-400/80 font-semibold">● Підключено{partnerProfile?.username ? ` · @${partnerProfile.username}` : ''}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-white/70">Запрошення надіслано</p>
                      <p className="text-[10px] text-white/40">Очікуємо, коли партнер відкриє додаток</p>
                    </>
                  )}
                </div>
                <button onClick={() => { setPartnerId(''); setPartnerAvatarError(false); }} className="text-[10px] bg-red-500/15 text-red-400 px-2.5 py-1.5 rounded-lg font-bold active:scale-95 transition-transform shrink-0">
                  Відключити
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/45 leading-relaxed mb-1">
                Запросіть друга — його ім'я з'явиться тут, а спільні фільми у вкладці «Спільні».
              </p>
            )}

            <button
              onClick={handleShareInvite}
              className="mt-2.5 w-full bg-white text-black text-sm font-bold py-3 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.12)]"
            >
              <Send size={15} /> Надіслати запрошення
            </button>

            {inviteLink && (
              <button
                onClick={() => copyText(inviteLink, 'Посилання-запрошення скопійовано')}
                className="mt-2 w-full bg-white/[0.06] text-white/60 text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-1.5"
              >
                <Copy size={12} /> Скопіювати посилання
              </button>
            )}

            <div className="text-[10px] text-center text-white/25 my-3 uppercase font-bold tracking-wider">або введіть ID вручну</div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ID партнера..."
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                className="flex-1 min-w-0 bg-black/40 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-white/25 text-white transition-all placeholder-white/25"
              />
              <button
                onClick={handleConnectPartner}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 rounded-xl active:scale-95 transition-all shrink-0"
              >
                Ок
              </button>
            </div>

            {connectMsg && (
              <p className="text-xs text-center mt-2.5 text-white/70 animate-in">{connectMsg}</p>
            )}
          </div>

          {/* My ID */}
          {user && (
            <div className="bg-white/[0.04] rounded-2xl px-4 py-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white/35 font-bold uppercase tracking-wider">Ваш ID</p>
                <code className="block text-xs font-mono text-white/55 truncate">{user.uid}</code>
              </div>
              <button
                onClick={() => copyText(user.uid)}
                className="bg-white/10 px-3 py-2 rounded-lg text-[11px] font-bold text-white active:scale-95 transition-transform hover:bg-white/20 shrink-0 flex items-center gap-1"
              >
                {copied ? <><CheckCircle2 size={12} /> Ок</> : <><Copy size={12} /> Копіювати</>}
              </button>
            </div>
          )}

          {/* Add to Home Screen — only relevant OUTSIDE Telegram */}
          {!insideTG && (
            <div className="bg-white/[0.04] rounded-2xl p-4 flex gap-3 items-start">
              <div className="p-2 bg-white/10 rounded-xl mt-0.5 shrink-0">
                <Smartphone size={16} className="text-white/60" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white/90 mb-1">Додати на головний екран</h3>
                <p className="text-[10px] text-white/45 leading-relaxed">
                  Натисніть <b className="text-white/70">Поділитися</b> (iOS) або меню <b className="text-white/70">⋮</b> (Android) та оберіть <b className="text-white/70">На початковий екран</b>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
