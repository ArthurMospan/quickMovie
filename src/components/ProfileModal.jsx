import { useState } from 'react';
import { X, Users, Smartphone, Copy, CheckCircle2, Send, Heart, Eye } from 'lucide-react';

const BOT_USERNAME = 'q_moviebot';

export default function ProfileModal({ onClose, user, userData, partnerId, setPartnerId }) {
  const [inputId, setInputId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');
  const [avatarError, setAvatarError] = useState(false);

  const insideTG = !!window.Telegram?.WebApp?.initDataUnsafe?.user;

  const stats = {
    saved: userData?.saves?.length || 0,
    watched: userData?.watched?.length || 0
  };

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

  // Invite link: main Mini App deep link — opens the app with start_param
  const inviteLink = user?.tgId ? `https://t.me/${BOT_USERNAME}?startapp=${user.tgId}` : null;

  const handleShareInvite = () => {
    if (!inviteLink) {
      flash('Відкрийте додаток через Telegram, щоб запрошувати друзів');
      return;
    }
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎬 Давай дивитись фільми разом! Відкрий і наші вішлісти з\'єднаються:')}`;
    try {
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    } catch (e) {
      // Last resort — copy the link
      copyText(inviteLink, 'Посилання скопійовано — надішліть його другу');
    }
  };

  const getInitials = () => {
    if (!user?.displayName) return '?';
    const parts = user.displayName.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0][0]?.toUpperCase() || '?';
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full sm:max-w-sm max-h-[88vh] overflow-y-auto scrollbar-hide bg-[#101010] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in">

        {/* Header with avatar */}
        <div className="relative pt-8 pb-5 px-6 flex flex-col items-center bg-gradient-to-b from-white/[0.06] to-transparent">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white active:scale-90 transition-all">
            <X size={16} />
          </button>

          {user?.photoURL && !avatarError ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-20 h-20 rounded-full border-2 border-white/20 object-cover shadow-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white font-bold text-2xl border-2 border-white/20 shadow-xl">
              {getInitials()}
            </div>
          )}

          {user ? (
            <>
              <p className="mt-3 text-lg font-bold text-white">{user.displayName}</p>
              {user.username && <p className="text-xs text-white/40">@{user.username}</p>}
            </>
          ) : (
            <>
              <p className="mt-3 text-lg font-bold text-white">Гість</p>
              <p className="text-xs text-white/40 text-center max-w-[240px] mt-1 leading-relaxed">
                Відкрийте додаток через бота <b className="text-white/70">@{BOT_USERNAME}</b> в Telegram, щоб зберігати фільми
              </p>
            </>
          )}
        </div>

        <div className="px-5 pb-6 space-y-4">

          {/* Stats */}
          <div className="flex gap-3">
            <div className="flex-1 bg-white/5 py-3.5 rounded-2xl text-center border border-white/5">
              <div className="flex items-center justify-center gap-1.5 text-xl font-bold text-white">
                <Heart size={15} className="text-white/60" /> {stats.saved}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-0.5">У списку</div>
            </div>
            <div className="flex-1 bg-white/5 py-3.5 rounded-2xl text-center border border-white/5">
              <div className="flex items-center justify-center gap-1.5 text-xl font-bold text-white">
                <Eye size={15} className="text-white/60" /> {stats.watched}
              </div>
              <div className="text-[10px] text-white/40 font-bold uppercase mt-0.5">Переглянуто</div>
            </div>
          </div>

          {/* Partner / Shared Wishlist */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <h3 className="text-sm font-bold mb-1 flex items-center gap-1.5 text-white">
              <Users size={14} className="text-white/70" /> Спільний вішліст
            </h3>

            {partnerId ? (
              <div className="mt-3 bg-white/10 p-3 rounded-xl flex items-center justify-between border border-white/10">
                <div className="min-w-0">
                  <span className="text-[10px] text-emerald-400/90 uppercase font-bold">● Партнера підключено</span>
                  <code className="block text-[10px] font-mono text-white/40 mt-0.5 truncate max-w-[170px]">{partnerId}</code>
                </div>
                <button onClick={() => setPartnerId('')} className="text-[10px] bg-red-500/15 text-red-400 px-3 py-1.5 rounded-lg font-bold border border-red-500/20 active:scale-95 transition-transform shrink-0">
                  Відключити
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/50 leading-relaxed">
                Запросіть друга — його збереження з'являться у вкладці «Спільні».
              </p>
            )}

            <button
              onClick={handleShareInvite}
              className="mt-3 w-full bg-white text-black text-sm font-bold py-3 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2"
            >
              <Send size={15} /> Надіслати запрошення
            </button>

            {inviteLink && (
              <button
                onClick={() => copyText(inviteLink, 'Посилання-запрошення скопійовано')}
                className="mt-2 w-full bg-white/5 border border-white/10 text-white/70 text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-1.5"
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
                className="flex-1 min-w-0 bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs focus:outline-none focus:border-white/30 text-white transition-colors"
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
            <div className="bg-white/5 rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white/40 font-bold uppercase">Ваш ID</p>
                <code className="block text-xs font-mono text-white/60 truncate">{user.uid}</code>
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
            <div className="bg-white/5 rounded-2xl border border-white/5 p-4 flex gap-3 items-start">
              <div className="p-2 bg-white/10 rounded-xl mt-0.5 shrink-0">
                <Smartphone size={16} className="text-white/70" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white/90 mb-1">Додати на головний екран</h3>
                <p className="text-[10px] text-white/50 leading-relaxed">
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
