import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, Play, Star, RotateCcw } from 'lucide-react';
import { guessMovieFromDescription, extractEnglishTitle } from '../services/gemini';
import { searchMovie, getMovieDetailsWithVideos, getTrailerKey } from '../services/tmdb';

export default function AISearchTab({ onWatchTrailer }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleAISearch = async () => {
    if (loading || !query.trim()) return;
    const userMessage = query.trim();
    setQuery('');
    setLoading(true);
    
    // Add user message
    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);
    
    try {
      // 1. Ask Gemini to guess the movie
      const geminiAnswer = await guessMovieFromDescription(userMessage);
      
      if (geminiAnswer.includes('Не вдалося розпізнати')) {
        setMessages(prev => [...prev, { 
          type: 'ai', 
          text: 'Не вдалося розпізнати фільм за описом 😔 Спробуйте описати більше деталей — сюжет, акторів, або рік випуску.',
          movie: null 
        }]);
        setLoading(false);
        return;
      }

      // 2. Extract English title for TMDB search
      const searchTitle = extractEnglishTitle(geminiAnswer);
      
      // 3. Search TMDB
      const searchRes = await searchMovie(searchTitle);
      
      if (!searchRes.results || searchRes.results.length === 0) {
        setMessages(prev => [...prev, { 
          type: 'ai', 
          text: geminiAnswer,
          subtext: 'Не знайдено у базі TMDB, але здається це:',
          movie: null 
        }]);
        setLoading(false);
        return;
      }
      
      const bestMatch = searchRes.results[0];
      
      // 4. Get trailer
      const fullDetails = await getMovieDetailsWithVideos(bestMatch.id);
      const trailerKey = getTrailerKey(fullDetails);

      setMessages(prev => [...prev, { 
        type: 'ai', 
        text: geminiAnswer,
        movie: {
          id: bestMatch.id,
          title: fullDetails.title || bestMatch.title,
          overview: fullDetails.overview || bestMatch.overview,
          backdrop_path: bestMatch.backdrop_path || fullDetails.backdrop_path,
          poster_path: bestMatch.poster_path || fullDetails.poster_path,
          release_date: fullDetails.release_date || bestMatch.release_date,
          vote_average: fullDetails.vote_average || bestMatch.vote_average,
          trailerKey
        }
      }]);
      
    } catch (err) {
      setMessages(prev => [...prev, { 
        type: 'ai', 
        text: `Помилка: ${err.message || 'Не вдалося підключитися до ШІ'} 😵`,
        isError: true,
        movie: null 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAISearch();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setQuery('');
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0a0a0a]" style={{ paddingTop: 'calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)) + 100px)' }}>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
        
        {/* Welcome / Empty State */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/30 to-blue-500/30 border border-purple-500/20 flex items-center justify-center mb-4">
              <Sparkles size={28} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Кіно-ШІ</h3>
            <p className="text-sm text-white/50 mb-6 max-w-[260px]">Опишіть фільм своїми словами, і я знайду його для вас</p>
            
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {[
                'Чувак летить у чорну діру',
                'Фільм про сни всередині снів',
                'Хлопець знаходить кільце зла',
              ].map((hint, i) => (
                <button 
                  key={i}
                  onClick={() => { setQuery(hint); inputRef.current?.focus(); }}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-in`}>
            {msg.type === 'user' ? (
              /* User bubble */
              <div className="max-w-[80%] bg-white/15 backdrop-blur-sm border border-white/10 rounded-2xl rounded-br-md px-4 py-3">
                <p className="text-sm text-white font-medium">{msg.text}</p>
              </div>
            ) : (
              /* AI bubble */
              <div className="max-w-[85%] flex gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center mt-1">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="flex-1 space-y-3">
                  {/* Text response */}
                  <div className={`bg-white/5 border border-white/10 rounded-2xl rounded-tl-md px-4 py-3 ${msg.isError ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                    {msg.subtext && <p className="text-[10px] text-white/40 mb-1">{msg.subtext}</p>}
                    <p className="text-sm text-white/90 font-medium">{msg.text}</p>
                  </div>
                  
                  {/* Movie card */}
                  {msg.movie && (
                    <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                      {msg.movie.backdrop_path && (
                        <div className="relative aspect-video w-full">
                          <img 
                            src={`https://image.tmdb.org/t/p/w780${msg.movie.backdrop_path}`} 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-black/30 to-transparent" />
                          <div className="absolute bottom-3 left-3 right-3">
                            <h4 className="text-white font-bold text-sm">{msg.movie.title}</h4>
                          </div>
                        </div>
                      )}
                      
                      <div className="p-3 space-y-2">
                        {msg.movie.overview && (
                          <p className="text-xs text-white/50 line-clamp-2">{msg.movie.overview}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-white/50">
                            <span className="flex items-center gap-1">
                              <Star size={11} className="text-yellow-500 fill-yellow-500" />
                              {(msg.movie.vote_average || 0).toFixed(1)}
                            </span>
                            <span>{msg.movie.release_date?.split('-')[0] || '—'}</span>
                          </div>
                          {msg.movie.trailerKey && onWatchTrailer && (
                            <button 
                              onClick={() => onWatchTrailer(msg.movie)}
                              className="bg-white text-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                            >
                              <Play size={12} fill="black" /> Трейлер
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {loading && (
          <div className="mb-4 flex justify-start animate-in">
            <div className="flex gap-2.5">
              <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-white/40 ml-1">Шукаю фільм...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar — fixed at bottom */}
      <div className="shrink-0 px-4 pb-5 pt-2 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
        {/* Clear chat button */}
        {messages.length > 0 && (
          <button 
            onClick={handleClearChat}
            className="mx-auto mb-2 flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors font-semibold uppercase tracking-wider"
          >
            <RotateCcw size={10} /> Очистити чат
          </button>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <textarea 
              ref={inputRef}
              placeholder="Опишіть фільм..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full bg-transparent px-4 py-3 text-sm text-white resize-none focus:outline-none placeholder-white/30 max-h-[100px]"
              style={{ minHeight: '44px' }}
            ></textarea>
          </div>
          <button 
            onClick={handleAISearch}
            disabled={loading || !query.trim()}
            className="shrink-0 w-11 h-11 rounded-xl bg-white text-black flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 disabled:scale-100"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
