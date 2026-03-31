import { useState } from 'react';
import { XCircle, Users } from 'lucide-react';
import { loginWithGoogle, logout } from '../services/firebase';

export default function ProfileModal({ onClose, user, userData, partnerId, setPartnerId }) {
  const [inputId, setInputId] = useState(partnerId || '');
  const [copied, setCopied] = useState(false);

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

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleConnectPartner = () => {
    if (inputId.trim()) {
      setPartnerId(inputId.trim());
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl animate-zoom-in">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
          <XCircle size={20} />
        </button>
        
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Профіль</h2>

        {/* Google Auth */}
        {!user ? (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-5 mb-5 text-center">
            <p className="text-xs text-white/60 mb-4 leading-relaxed">
              Авторизуйтесь через Google, щоб алгоритми запам'ятовували ваші вподобання і підбирали найкращі фільми.
            </p>
            <button 
              onClick={handleLogin}
              className="w-full bg-white text-black font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-gray-100"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Увійти через Google
            </button>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-4 mb-5 flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-white/20" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {user.displayName?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.displayName || 'Анонім'}</p>
              <p className="text-xs text-white/40 truncate">{user.email || ''}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="text-xs text-red-400 hover:text-red-300 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              Вийти
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-2xl font-bold text-rose-400">{stats.saved}</div>
            <div className="text-[10px] text-white/40 font-bold uppercase mt-1">Збережено</div>
          </div>
          <div className="flex-1 bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-2xl font-bold text-emerald-400">{stats.watched}</div>
            <div className="text-[10px] text-white/40 font-bold uppercase mt-1">Переглянуто</div>
          </div>
        </div>

        {/* My ID */}
        {user && (
          <div className="bg-white/5 rounded-2xl border border-white/5 p-4 mb-4">
            <h3 className="text-sm font-bold mb-1.5 text-white/90">Ваш ID</h3>
            <div className="flex gap-2 p-1 bg-black/50 rounded-xl border border-white/5">
              <code className="flex-1 px-2 text-xs font-mono text-white/60 truncate flex items-center">{user.uid}</code>
              <button 
                onClick={copyMyId} 
                className="bg-white/10 px-3 py-2 rounded-lg text-xs font-bold text-white active:scale-95 transition-transform hover:bg-white/20 shrink-0"
              >
                {copied ? '✅' : 'Копіювати'}
              </button>
            </div>
          </div>
        )}

        {/* Partner ID */}
        <div className="bg-rose-500/10 rounded-2xl border border-rose-500/20 p-4">
          <h3 className="text-sm font-bold mb-1.5 flex items-center gap-1.5 text-white/90">
            <Users size={14} className="text-rose-400" /> Спільний Вішліст
          </h3>
          <div className="flex flex-col gap-2 mt-2">
            <input 
              type="text" 
              placeholder="ID партнера..." 
              value={inputId} 
              onChange={(e) => setInputId(e.target.value)} 
              className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500/50 text-white transition-colors" 
            />
            <button 
              onClick={handleConnectPartner} 
              className="w-full bg-rose-600/80 hover:bg-rose-600 text-white text-sm font-bold py-3 rounded-xl active:scale-95 transition-all"
            >
              Підключити
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
