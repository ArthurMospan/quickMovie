import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Play, Star, RotateCcw } from 'lucide-react';

function AIAvatar({ size = 'w-7 h-7' }) {
  return (
    <img src="/logo.png" alt="AI" className={`${size} rounded-full object-cover shrink-0 border border-white/15`} />
  );
}
import { guessMovieFromDescription, parseAIAnswer } from '../services/gemini';
import { searchMulti, getMovieDetailsWithVideos, getTVDetailsWithVideos, getTrailerKey } from '../services/tmdb';

// Pick the best TMDB match: prefer matching type, then closest year, then popularity order
function pickBestMatch(results, ai) {
  const candidates = (results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
  if (candidates.length === 0) return null;

  const scored = candidates.map((r, idx) => {
    const year = parseInt((r.release_date || r.first_air_date || '').split('-')[0]) || null;
    let score = idx; // keep TMDB relevance order as base
    if (ai.type && r.media_type !== ai.type) score += 25;
    if (ai.year && year) score += Math.min(Math.abs(year - ai.year), 30);
    return { r, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].r;
}

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
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);

    try {
      // 1. Ask Gemini 2.5
      const rawAnswer = await guessMovieFromDescription(userMessage);
      const ai = parseAIAnswer(rawAnswer);

      if (ai.unknown) {
        setMessages(prev => [...prev, {
          type: 'ai',
          text: 'Не вдалося розпізнати фільм за описом 😔 Спробуйте додати деталей — сюжет, акторів або рік випуску.',
          movie: null
        }]);
        return;
      }

      // 2. Search TMDB (movies + series), respecting year/type from the AI
      const searchRes = await searchMulti(ai.title);
      const bestMatch = pickBestMatch(searchRes.results, ai);

      if (!bestMatch) {
        setMessages(prev => [...prev, {
          type: 'ai',
          text: ai.text || `Схоже, це «${ai.title}»${ai.year ? ` (${ai.year})` : ''}.`,
          subtext: 'Не знайдено у базі TMDB:',
          movie: null
        }]);
        return;
      }

      // 3. Full details + trailer (movie vs series)
      const isTV = bestMatch.media_type === 'tv';
      const fullDetails = isTV
        ? await getTVDetailsWithVideos(bestMatch.id)
        : await getMovieDetailsWithVideos(bestMatch.id);
      const trailerKey = getTrailerKey(fullDetails);

      const movie = {
        id: bestMatch.id,
        title: fullDetails.title || fullDetails.name || bestMatch.title || bestMatch.name,
        overview: fullDetails.overview || bestMatch.overview,
        backdrop_path: bestMatch.backdrop_path || fullDetails.backdrop_path,
        poster_path: bestMatch.poster_path || fullDetails.poster_path,
        release_date: fullDetails.release_date || fullDetails.first_air_date || bestMatch.release_date || bestMatch.first_air_date,
        vote_average: fullDetails.vote_average || bestMatch.vote_average,
        type: isTV ? 'series' : 'movie',
        trailerKey
      };

      setMessages(prev => [...prev, {
        type: 'ai',
        text: ai.text || `Схоже, це «${movie.title}»!`,
        movie
      }]);

    } catch (err) {
      setMessages(prev => [...prev, {
        type: 'ai',
        text: `${err.message || 'Не вдалося підключитися до ШІ'} 😵`,
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

  // Auto-grow textarea (ChatGPT-like)
  const handleInput = (e) => {
    setQuery(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
  };

  const handleClearChat = () => {
    setMessages([]);
    setQuery('');
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0a0a0a]" style={{ paddingTop: 'var(--app-top)' }}>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">

        {/* Welcome / Empty State */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-in">
            <img src="/logo.png" alt="QuickMovie" className="w-16 h-16 rounded-2xl mb-4 shadow-[0_0_40px_rgba(255,255,255,0.12)]" />
            <h3 className="text-xl font-bold text-white mb-2">Кіно-ШІ</h3>
            <p className="text-sm text-white/50 mb-6 max-w-[260px]">Опишіть фільм своїми словами — я впізнаю його і знайду трейлер</p>

            {/* Suggestion chips */}
            <div className="flex flex-col gap-2 w-full max-w-[300px]">
              {[
                'Чувак летить у чорну діру, щоб врятувати доньку',
                'Фільм про сни всередині снів',
                'Серіал де вчитель хімії варить мет',
              ].map((hint, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(hint); inputRef.current?.focus(); }}
                  className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-[0.98] text-left"
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
              <div className="max-w-[80%] bg-white/15 backdrop-blur-sm border border-white/10 rounded-3xl rounded-br-lg px-4 py-2.5">
                <p className="text-[15px] text-white leading-relaxed">{msg.text}</p>
              </div>
            ) : (
              /* AI bubble */
              <div className="max-w-[88%] flex gap-2.5">
                <div className="mt-1"><AIAvatar /></div>
                <div className="flex-1 space-y-3 min-w-0">
                  {/* Text response */}
                  <div className={`bg-white/5 border border-white/10 rounded-3xl rounded-tl-lg px-4 py-3 ${msg.isError ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                    {msg.subtext && <p className="text-[10px] text-white/40 mb-1">{msg.subtext}</p>}
                    <p className="text-[15px] text-white/90 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>

                  {/* Movie card */}
                  {msg.movie && (
                    <div className="bg-[#131313] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                      {msg.movie.backdrop_path && (
                        <div className="relative aspect-video w-full">
                          <img
                            src={`https://image.tmdb.org/t/p/w780${msg.movie.backdrop_path}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-black/30 to-transparent" />
                          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                            <h4 className="text-white font-bold text-sm leading-tight">{msg.movie.title}</h4>
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-white/15 border border-white/15 rounded-md px-1.5 py-0.5 text-white/70">
                              {msg.movie.type === 'series' ? 'Серіал' : 'Фільм'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="p-3 space-y-2.5">
                        {msg.movie.overview && (
                          <p className="text-xs text-white/50 line-clamp-2 leading-relaxed">{msg.movie.overview}</p>
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
              <AIAvatar />
              <div className="bg-white/5 border border-white/10 rounded-3xl rounded-tl-lg px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-white/40 ml-1">Думаю...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar — pinned at bottom, ChatGPT style */}
      <div
        className="shrink-0 px-4 pt-2 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
      >
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="mx-auto mb-2 flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors font-semibold uppercase tracking-wider"
          >
            <RotateCcw size={10} /> Новий чат
          </button>
        )}
        <div className="flex items-end gap-2 bg-[#161616] border border-white/10 rounded-[26px] pl-4 pr-1.5 py-1.5 focus-within:border-white/25 transition-colors">
          <textarea
            ref={inputRef}
            placeholder="Опишіть фільм..."
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 bg-transparent py-2 text-[15px] text-white resize-none focus:outline-none placeholder-white/30"
            style={{ maxHeight: '110px' }}
          ></textarea>
          <button
            onClick={handleAISearch}
            disabled={loading || !query.trim()}
            className="shrink-0 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-all disabled:opacity-25 disabled:scale-100 mb-0.5"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
