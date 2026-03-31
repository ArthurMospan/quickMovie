import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { guessMovieFromDescription, extractEnglishTitle } from '../services/gemini';
import { searchMovie, getMovieDetailsWithVideos, getTrailerKey } from '../services/tmdb';

export default function AISearchTab({ onWatchTrailer }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // null | { text, movie? }
  const [error, setError] = useState('');

  const handleAISearch = async () => {
    if (loading || !query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      // 1. Ask Gemini to guess the movie
      console.log('Gemini Request Started at:', new Date().toISOString());
      const geminiAnswer = await guessMovieFromDescription(query);
      
      if (geminiAnswer.includes('Не вдалося розпізнати')) {
        setResult({ text: geminiAnswer });
        setLoading(false);
        return;
      }

      // 2. Extract English title for TMDB search
      const searchTitle = extractEnglishTitle(geminiAnswer);
      
      // 3. Search TMDB
      const searchRes = await searchMovie(searchTitle);
      
      if (!searchRes.results || searchRes.results.length === 0) {
        setResult({ text: geminiAnswer });
        setLoading(false);
        return;
      }
      
      const bestMatch = searchRes.results[0];
      
      // 4. Get trailer
      const fullDetails = await getMovieDetailsWithVideos(bestMatch.id);
      const trailerKey = getTrailerKey(fullDetails);

      setResult({
        text: geminiAnswer,
        movie: {
          ...bestMatch,
          overview: fullDetails.overview || bestMatch.overview,
          trailerKey
        }
      });
      
    } catch (err) {
      setError(err.message || 'Помилка підключення до ШІ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-black pt-24 pb-10 px-6 flex flex-col items-center scrollbar-hide">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md animate-in">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-white/10 rounded-2xl border border-white/10">
            <Sparkles className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Кіно-ШІ</h3>
            <p className="text-xs text-white/60">Знайде фільм за сюжетом</p>
          </div>
        </div>

        {/* Input */}
        <textarea 
          placeholder="Наприклад: чувак летить у чорну діру і там книжкова полиця..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white resize-none h-28 focus:outline-none focus:border-white/30 mb-4 placeholder-white/30 backdrop-blur-md transition-colors"
        ></textarea>

        {/* Search Button */}
        <button 
          onClick={handleAISearch}
          disabled={loading || !query.trim()}
          className="w-full bg-white/10 border border-white/10 text-white font-bold py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2 backdrop-blur-md hover:bg-white/20"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Шукаю в базі...</span>
            </>
          ) : (
            "Знайти фільм"
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center font-medium animate-in">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 animate-in">
            {/* AI Answer */}
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 text-center backdrop-blur-md mb-4">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold">Здається, це:</p>
              <p className="text-lg font-bold text-white">{result.text}</p>
            </div>

            {/* Movie Card (if found on TMDB) */}
            {result.movie && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {result.movie.backdrop_path && (
                  <div className="relative aspect-video w-full">
                    <img 
                      src={`https://image.tmdb.org/t/p/w780${result.movie.backdrop_path}`} 
                      alt="" 
                      className="w-full h-full object-cover opacity-70" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <h4 className="text-white font-bold text-sm">{result.movie.title}</h4>
                      <p className="text-white/60 text-xs line-clamp-2 mt-0.5">{result.movie.overview}</p>
                    </div>
                  </div>
                )}
                
                <div className="p-4 flex items-center justify-between">
                  <span className="text-xs text-white/50 font-medium">
                    {result.movie.release_date?.split('-')[0] || '—'}
                  </span>
                  {result.movie.trailerKey && onWatchTrailer && (
                    <button 
                      onClick={() => onWatchTrailer(result.movie)}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                    >
                      ▶ Дивитись трейлер
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
