import { useState } from 'react';
import { XCircle, Users, Smartphone, Share2, Copy, CheckCircle2, LogIn } from 'lucide-react';

export default function ProfileModal({ onClose, user, userData, partnerId, setPartnerId }) {
  const [inputId, setInputId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');

  const stats = {
    saved: userData?.saves?.length || 0,
    watched: userData?.watched?.length || 0
  };

  const copyMyId = () => {
    if (user?.uid) {
      navigator.clipboard?.writeText(user.uid).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        // Legacy fallback
        const textArea = document.createElement("textarea");
        textArea.value = user.uid;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (err) {}
        document.body.removeChild(textArea);
      });
    }
  };

  const handleConnectPartner = () => {
    const trimmed = inputId.trim();
    if (!trimmed) {
      setConnectMsg('Введіть ID партнера');
      setTimeout(() => setConnectMsg(''), 2000);
      return;
    }
    if (trimmed === user?.uid) {
      setConnectMsg('Не можна підключити самого себе');
      setTimeout(() => setConnectMsg(''), 2000);
      return;
    }
    setPartnerId(trimmed);
    setConnectMsg('✅ Партнера підключено!');
    setInputId('');
    setTimeout(() => setConnectMsg(''), 3000);
  };

  const handleShareInvite = () => {
    if (!user?.tgId) {
      // Not in Telegram — show a message
      if (user?.uid) {
        // Copy invite link to clipboard
        const link = `https://t.me/q_moviebot/app?startapp=${user.uid.replace('tg_', '')}`;
        navigator.clipboard?.writeText(link).then(() => {
          setConnectMsg('Посилання скопійовано!');
          setTimeout(() => setConnectMsg(''), 2000);
        });
      }
      return;
    }
    
    const link = `https://t.me/q_moviebot/app?startapp=${user.tgId}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("🎥 Давай дивитись фільми разом! Приєднуйся до мого вішліста:")}`;
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (!user?.displayName) return '?';
    const parts = user.displayName.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0][0]?.toUpperCase() || '?';
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto scrollbar-hide bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl animate-zoom-in">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10">
          <XCircle size={20} />
        </button>
        
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Профіль</h2>

        {/* Telegram Profile */}
        {user ? (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-4 mb-5 flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full border-2 border-white/20 object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
                {getInitials()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.displayName || 'Користувач'}</p>
              {user.username && <p className="text-xs text-white/40 truncate">@{user.username}</p>}
            </div>
            <div className="px-2 py-1 bg-white/10 text-white/70 text-[10px] font-bold rounded-md uppercase tracking-wider border border-white/10">
              Telegram
            </div>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-5 mb-5 text-center">
            <LogIn size={28} className="text-white/30 mx-auto mb-3" />
            <p className="text-sm font-bold text-white mb-2">Увійдіть через Telegram</p>
            <p className="text-xs text-white/50 leading-relaxed">
              Відкрийте цей додаток через бота <b className="text-white/80">@q_moviebot</b>, щоб збереження та вішліст працювали.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-2xl font-bold text-white">{stats.saved}</div>
            <div className="text-[10px] text-white/40 font-bold uppercase mt-1">Збережено</div>
          </div>
          <div className="flex-1 bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-2xl font-bold text-white/80">{stats.watched}</div>
            <div className="text-[10px] text-white/40 font-bold uppercase mt-1">Переглянуто</div>
          </div>
        </div>

        {/* Partner / Shared Wishlist section */}
        <div className="bg-white/5 rounded-2xl border border-white/10 p-4 mb-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5 text-white/90">
            <Users size={14} className="text-white/70" /> Спільний Вішліст
          </h3>
          
          {partnerId ? (
            <div className="bg-white/10 p-3 rounded-xl flex items-center justify-between border border-white/10 mb-3">
              <div>
                <span className="text-[10px] text-white/50 uppercase font-bold">Партнер підключено</span>
                <code className="block text-[10px] font-mono text-white/40 mt-0.5 truncate max-w-[180px]">{partnerId}</code>
              </div>
              <button onClick={() => setPartnerId('')} className="text-[10px] bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg font-bold border border-red-500/20 active:scale-95 transition-transform">
                Відключити
              </button>
            </div>
          ) : (
            <p className="text-xs text-white/50 mb-3">Надішліть запрошення, щоб дивитись фільми разом.</p>
          )}
          
          {/* Invite Button */}
          {user && (
            <button 
              onClick={handleShareInvite}
              className="w-full bg-white hover:bg-gray-200 text-black text-sm font-bold py-3 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2 mb-3"
            >
              <Share2 size={16} /> Надіслати запрошення
            </button>
          )}
          
          <div className="text-[10px] text-center text-white/30 mb-3 uppercase font-bold tracking-wider">— або введіть вручну —</div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="ID партнера..." 
              value={inputId} 
              onChange={(e) => setInputId(e.target.value)} 
              className="flex-1 bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs focus:outline-none focus:border-white/30 text-white transition-colors" 
            />
            <button 
              onClick={handleConnectPartner} 
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 rounded-xl active:scale-95 transition-all"
            >
              Ок
            </button>
          </div>
          
          {/* Connection feedback */}
          {connectMsg && (
            <p className="text-xs text-center mt-2 text-white/60 animate-in">{connectMsg}</p>
          )}
        </div>

        {/* My ID */}
        {user && (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-4 mb-4">
            <h3 className="text-sm font-bold mb-1.5 text-white/90">Ваш ID</h3>
            <div className="flex gap-2 p-1 bg-black/50 rounded-xl border border-white/5">
              <code className="flex-1 px-2 text-xs font-mono text-white/60 truncate flex items-center">{user.uid}</code>
              <button 
                onClick={copyMyId} 
                className="bg-white/10 px-3 py-2 rounded-lg text-xs font-bold text-white active:scale-95 transition-transform hover:bg-white/20 shrink-0 flex items-center gap-1"
              >
                {copied ? <><CheckCircle2 size={12} /> Скопійовано</> : <><Copy size={12} /> Копіювати</>}
              </button>
            </div>
          </div>
        )}

        {/* Add to Home Screen Hint */}
        <div className="bg-white/5 rounded-2xl border border-white/5 p-4 flex gap-3 items-start">
          <div className="p-2 bg-white/10 rounded-xl mt-0.5">
            <Smartphone size={16} className="text-white/70" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white/90 mb-1">Додати на головний екран</h3>
            <p className="text-[10px] text-white/50 leading-relaxed">
              Натисніть <b className="text-white/70">Поділитися</b> (iOS) або меню <b className="text-white/70">⋮</b> (Android) та оберіть <b className="text-white/70">На початковий екран</b>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
