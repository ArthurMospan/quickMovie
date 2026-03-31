import { Search, Sparkles, User } from 'lucide-react';

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
  return (
    <div className="absolute top-0 left-0 right-0 z-40 flex justify-between items-center px-6 pt-12 pb-4 bg-gradient-to-b from-black/70 via-black/40 to-transparent pointer-events-none">
      
      {/* Left: AI Magic Search Button */}
      <button 
        onClick={() => setActiveTab('ai')} 
        className={`pointer-events-auto relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 group backdrop-blur-md border shadow-lg active:scale-90 ${
          activeTab === 'ai' 
            ? 'bg-purple-500/20 border-purple-500/50' 
            : 'bg-white/10 border-white/10 hover:bg-white/20'
        }`}
      >
        <Search size={18} className={`transition-colors ${activeTab === 'ai' ? 'text-purple-300' : 'text-white'}`} />
        <Sparkles size={10} className={`absolute top-2 right-2 transition-colors ${activeTab === 'ai' ? 'text-purple-400' : 'text-purple-300 opacity-80'}`} />
      </button>

      {/* Center: TikTok Tabs */}
      <div className="flex gap-5 items-center pointer-events-auto">
        <TabButton active={activeTab === 'feed'} onClick={() => setActiveTab('feed')}>Огляд</TabButton>
        <TabButton active={activeTab === 'watchlist'} onClick={() => setActiveTab('watchlist')}>Watchlist</TabButton>
      </div>

      {/* Right: Profile Avatar */}
      <button 
        onClick={onProfileClick} 
        className="pointer-events-auto rounded-full w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 border border-white/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center overflow-hidden shadow-lg"
      >
        {userPhotoURL ? (
          <img src={userPhotoURL} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <User size={18} className="text-white drop-shadow-md" />
        )}
      </button>
    </div>
  );
}
