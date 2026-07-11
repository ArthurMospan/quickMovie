import { useState } from 'react';
import { X, Users, Smartphone, Send, Heart, Eye, Clapperboard, Timer, ChevronRight } from 'lucide-react';

const BOT_USERNAME = 'q_moviebot';

export default function ProfileModal({ onClose, user, userData, partnerId, partnerProfile, setPartnerId, onOpenList }) {
  const [avatarError, setAvatarError] = useState(false);
  const [partnerAvatarError, setPartnerAvatarError] = useState(false);
  const [msg, setMsg] = useState('');

  const insideTG = !!window.Telegram?.WebApp?.initDataUnsafe?.user;

  const saved = userData?.saves?.length || 0;
  const watched = userData?.watched?.length || 0;
  const trailerMinutes = Math.round((saved + watched) * 2.4);

  const flash = (text, ms = 2500) => {
    setMsg(text);
    setTimeout(() => setMsg(''), ms);
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
      flash('Не вдалося відкрити Telegram-шеринг');
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
        </div>

        <div className="relative px-5 pb-7 space-y-3">

          {/* Mini dashboard — tiles are clickable */}
          <div className="flex gap-2.5">
            <button
              onClick={() => onOpenList?.('mine')}
              className="flex-1 bg-white/[0.07] backdrop-blur-md py-4 rounded-2xl text-center active:scale-95 transition-transform relative"
            >
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-white">
                <Heart size={16} className="text-white/50" /> {saved}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-1 tracking-wider flex items-center justify-center gap-0.5">
                У списку <ChevronRight size={10} className="text-white/30" />
              </div>
            </button>
            <button
              onClick={() => onOpenList?.('watched')}
              className="flex-1 bg-white/[0.07] backdrop-blur-md py-4 rounded-2xl text-center active:scale-95 transition-transform relative"
            >
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-white">
                <Eye size={16} className="text-white/50" /> {watched}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-1 tracking-wider flex items-center justify-center gap-0.5">
                Переглянуто <ChevronRight size={10} className="text-white/30" />
              </div>
            </button>
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

          {/* Shared wishlist — minimal */}
          <div className="bg-white/[0.07] backdrop-blur-md rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5 text-white">
              <Users size={14} className="text-white/60" /> Спільний вішліст
            </h3>

            {partnerId ? (
              <div className="bg-black/30 p-3 rounded-xl flex items-center gap-3">
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
                      <p className="text-[10px] text-white/40">Очікуємо, коли друг відкриє додаток</p>
                    </>
                  )}
                </div>
                <button onClick={() => { setPartnerId(''); setPartnerAvatarError(false); }} className="text-[10px] bg-red-500/15 text-red-400 px-2.5 py-1.5 rounded-lg font-bold active:scale-95 transition-transform shrink-0">
                  Відключити
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/45 leading-relaxed">
                Запросіть друга — тисніть ⭐ на фільмах, і вони з'являться у «Спільних» у вас обох.
              </p>
            )}

            <button
              onClick={handleShareInvite}
              className={`mt-3 w-full text-sm font-bold py-3 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2 ${
                partnerId
                  ? 'bg-white/[0.06] text-white/60'
                  : 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.12)]'
              }`}
            >
              <Send size={15} /> Надіслати запрошення
            </button>

            {msg && (
              <p className="text-xs text-center mt-2.5 text-white/70 animate-in">{msg}</p>
            )}
          </div>

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
