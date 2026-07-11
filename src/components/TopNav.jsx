import { useState } from 'react';
import { Search, User, Smartphone } from 'lucide-react';

function TabButton({ children, active, onClick }) {
  return (
    <button onClick={onClick} className="relative py-1 flex flex-col items-center group">
      <span className={`text-[15px] font-bold transition-all duration-300 ${active ? 'text-white drop-shadow-md' : 'text-white/50 hover:text-white/80'}`}>
        {children}
      </span>
      <div className={`absolute -bottom-1 h-[3px] bg-white rounded-full transition-all duration-300 ${active ? 'w-5 opacity-100' : 'w-0 opacity-0'}`}></div>
    </button>
  );
}

export default function TopNav({ activeTab, setActiveTab, onProfileClick, userPhotoURL }) {
  const [avatarError, setAvatarError] = useState(false);

  return (
    <div
      className="app-topnav absolute top-0 left-0 right-0 z-40 flex justify-between items-center px-6 pb-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none"
      style={{ paddingTop: 'calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)) + 64px)' }}
    >

      {/* Left: AI Search Button (plain magnifier) */}
      <button
        onClick={() => setActiveTab('ai')}
        className={`pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 backdrop-blur-md border shadow-lg active:scale-90 ${
          activeTab === 'ai'
            ? 'bg-white/25 border-white/30'
            : 'bg-white/10 border-white/10 hover:bg-white/20'
        }`}
      >
        <Search size={18} className="text-white" />
      </button>

      {/* Center: Tabs + unobtrusive rotate hint below the white line */}
      <div className="relative flex gap-5 items-center pointer-events-auto">
        <TabButton active={activeTab === 'feed'} onClick={() => setActiveTab('feed')}>Огляд</TabButton>
        <TabButton active={activeTab === 'watchlist'} onClick={() => setActiveTab('watchlist')}>Watchlist</TabButton>

        {activeTab === 'feed' && (
          <div className="portrait-hint absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex items-center gap-1.5 whitespace-nowrap pointer-events-none">
            <Smartphone size={10} className="tilt-anim text-white/40" />
            <span className="text-[10px] font-medium text-white/40">Розверніть для зручності</span>
          </div>
        )}
      </div>

      {/* Right: Profile Avatar */}
      <button
        onClick={onProfileClick}
        className="pointer-events-auto rounded-full w-10 h-10 bg-gradient-to-tr from-zinc-800 to-zinc-950 border border-white/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center overflow-hidden shadow-lg"
      >
        {userPhotoURL && !avatarError ? (
          <img
            src={userPhotoURL}
            alt="Avatar"
            referrerPolicy="no-referrer"
            onError={() => setAvatarError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <User size={18} className="text-white drop-shadow-md" />
        )}
      </button>
    </div>
  );
}
