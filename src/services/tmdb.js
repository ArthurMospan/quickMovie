const getTmdbToken = () => {
  return localStorage.getItem('TMDB_API_KEY') || import.meta.env.VITE_TMDB_API_TOKEN;
};

const BASE_URL = 'https://api.themoviedb.org/3';

const fetchFromTMDB = async (endpoint, params = {}) => {
  const token = getTmdbToken();
  if (!token) throw new Error("TMDB API Token missing");

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      url.searchParams.append(key, params[key]);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`TMDB error: ${response.status}`);
  }
  return response.json();
};

// --- Genre List (cached) ---
let genreCache = null;
export const getGenreList = async () => {
  if (genreCache) return genreCache;
  const [movieGenres, tvGenres] = await Promise.all([
    fetchFromTMDB('/genre/movie/list', { language: 'uk-UA' }),
    fetchFromTMDB('/genre/tv/list', { language: 'uk-UA' })
  ]);
  // Merge and dedupe
  const allGenres = [...movieGenres.genres, ...tvGenres.genres];
  const seen = new Set();
  genreCache = allGenres.filter(g => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
  return genreCache;
};

// --- Discover Movies ---
export const discoverMovies = async (page = 1) => {
  return fetchFromTMDB('/discover/movie', {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    include_video: false,
    language: 'uk-UA',
    'vote_count.gte': 30
  });
};

// --- Discover TV ---
export const discoverTV = async (page = 1) => {
  return fetchFromTMDB('/discover/tv', {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    language: 'uk-UA',
    'vote_count.gte': 30
  });
};

// --- Quality gate ---
// TMDB is flooded with regional titles whose ratings are inflated to 9–10
// by a small fanbase. A real 9+ has thousands of votes; a fake one doesn't.
const INFLATED_RATING_LANGS = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'pa', 'mr', 'zh', 'cn']);
export const passesQualityGate = (r, { allowRegional = false } = {}) => {
  const va = r.vote_average || 0;
  const vc = r.vote_count || 0;
  if (va >= 8.8 && vc < 2500) return false; // "10.0" with 40 votes = fake
  if (!allowRegional && INFLATED_RATING_LANGS.has(r.original_language) && vc < 1000) return false;
  return true;
};

// --- Recommendations cache (seeded by titles the user saved) ---
// Saved keys: bare numeric id = movie (legacy incl.), 'tv_<id>' = series.
const recsCache = new Map();
const getRecsFor = async (key) => {
  if (recsCache.has(key)) return recsCache.get(key);
  const isTvKey = typeof key === 'string' && key.startsWith('tv_');
  const id = isTvKey ? key.slice(3) : key;
  let results = [];
  if (!isTvKey) {
    try {
      const r = await fetchFromTMDB(`/movie/${id}/recommendations`, { language: 'uk-UA' });
      results = (r.results || []).map(x => ({ ...x, media_type: x.media_type || 'movie' }));
    } catch (e) { /* not a movie — try tv below */ }
  }
  if (results.length === 0) {
    try {
      const r = await fetchFromTMDB(`/tv/${id}/recommendations`, { language: 'uk-UA' });
      results = (r.results || []).map(x => ({ ...x, media_type: x.media_type || 'tv' }));
    } catch (e) { /* no recs at all */ }
  }
  recsCache.set(key, results);
  return results;
};

// --- Smart Feed (no filters): TikTok-style mix ---
// Blend of: trending this week + fresh well-rated + all-time masterpieces
// + recommendations seeded by the user's saved titles (Instagram-reels style).
// Old titles only make it in if they're top-tier (high rating + many votes).
const lightShuffle = (arr, window = 4) => {
  // Shuffle within a sliding window: keeps overall ranking, adds variety
  const a = [...arr];
  for (let i = 0; i < a.length; i++) {
    const j = i + Math.floor(Math.random() * Math.min(window, a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const getSmartFeed = async (page = 1, seedIds = []) => {
  const freshFrom = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10); // ~2 years back

  // Shuffle which page each source serves: without this, page 1 was almost
  // identical on every app start (same trending week, same all-time top),
  // so the seen-memory exhausted it within a couple of sessions.
  const spice = () => 1 + Math.floor(Math.random() * 5);

  // Up to 3 random seeds from the user's saved list → their recommendations
  // get blended into every feed page ("more like what you save").
  const seeds = [...seedIds].sort(() => Math.random() - 0.5).slice(0, 3);

  const [trending, fresh, topMovies, topTV, ...recs] = await Promise.allSettled([
    // 1. What the world watches right now (movies + series)
    fetchFromTMDB('/trending/all/week', { language: 'uk-UA', page }),
    // 2. New & actually good
    fetchFromTMDB('/discover/movie', {
      language: 'uk-UA', include_adult: false, page: page - 1 + spice(),
      sort_by: 'popularity.desc',
      'primary_release_date.gte': freshFrom,
      'vote_average.gte': 6.6, 'vote_count.gte': 200
    }),
    // 3. All-time movie masterpieces (older stuff only if truly great)
    fetchFromTMDB('/discover/movie', {
      language: 'uk-UA', include_adult: false, page: page - 1 + spice(),
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.7, 'vote_count.gte': 4000
    }),
    // 4. All-time top series
    fetchFromTMDB('/discover/tv', {
      language: 'uk-UA', include_adult: false, page: page - 1 + spice(),
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.8, 'vote_count.gte': 1500
    }),
    // 5+. Similar to what the user saved
    ...seeds.map(id => getRecsFor(id))
  ]);

  const take = (settled, n, mediaType) => {
    if (settled.status !== 'fulfilled') return [];
    return (settled.value.results || [])
      .filter(r => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, n)
      .map(r => (mediaType && !r.media_type ? { ...r, media_type: mediaType } : r));
  };

  // Recommendation results: rotate the slice with the page so they don't repeat
  const recItems = recs.flatMap(settled => {
    if (settled.status !== 'fulfilled') return [];
    const list = settled.value || [];
    if (list.length === 0) return [];
    const start = ((page - 1) * 3) % list.length;
    return list.slice(start, start + 3);
  });

  // Weights per page: trending 7, recs up to 9, fresh 5, top movies 4, top series 3
  const mix = [
    ...take(trending, 7),
    ...recItems,
    ...take(fresh, 5, 'movie'),
    ...take(topMovies, 4, 'movie'),
    ...take(topTV, 3, 'tv')
  ];

  // Dedupe by media_type+id
  const seen = new Set();
  const deduped = mix.filter(r => {
    const key = `${r.media_type}_${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Quality gate: kill fake 9–10s and no-name regional titles
  const cleaned = deduped.filter(r => (r.vote_count || 0) >= 30 && passesQualityGate(r));

  return {
    results: lightShuffle(cleaned),
    total_pages: 500,
    total_results: 10000
  };
};

// --- Person filmography (exact) ---
// TMDB /discover/tv does NOT support with_people at all, so discover-based
// person filtering silently returned unrelated series. Instead we take the
// person's real combined credits and filter/sort/paginate them client-side.
const personCreditsCache = new Map();
export const getPersonMedia = async ({ personId, type = 'all', genreIds = [], minRating = 0, yearFrom, yearTo, page = 1 }) => {
  let credits = personCreditsCache.get(personId);
  if (!credits) {
    credits = await fetchFromTMDB(`/person/${personId}/combined_credits`, { language: 'uk-UA' });
    personCreditsCache.set(personId, credits);
  }

  const EXCLUDE_TV_GENRES = new Set([10767, 10763, 10764]); // talk-show, news, reality
  const pool = [
    ...(credits.cast || []),
    ...(credits.crew || []).filter(c => c.job === 'Director')
  ];

  const seen = new Set();
  const items = pool.filter(m => {
    const key = `${m.media_type}_${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (m.media_type !== 'movie' && m.media_type !== 'tv') return false;
    // Guest appearances on talk shows / cameos as "Self" are not their films
    if (m.media_type === 'tv' && (m.genre_ids || []).some(g => EXCLUDE_TV_GENRES.has(g))) return false;
    if (m.character && /\bself\b/i.test(m.character)) return false;
    if (type === 'movie' && m.media_type !== 'movie') return false;
    if (type === 'series' && m.media_type !== 'tv') return false;
    if (genreIds.length > 0 && !(m.genre_ids || []).some(g => genreIds.includes(g))) return false;
    if (minRating > 0 && (m.vote_average || 0) < minRating) return false;
    const y = parseInt((m.release_date || m.first_air_date || '').slice(0, 4), 10);
    if (yearFrom && (!y || y < yearFrom)) return false;
    if (yearTo && (!y || y > yearTo)) return false;
    return true;
  });

  // Most-known first
  items.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

  const per = 20;
  const start = (page - 1) * per;
  return {
    results: items.slice(start, start + per),
    total_pages: Math.max(1, Math.ceil(items.length / per)),
    total_results: items.length
  };
};

// --- Discover with Filters (with fallback logic) ---
// Multi-select: genreIds[] and countries[] are OR-combined via TMDB's "|" syntax.
// When type='all', fetches BOTH movies and TV and merges them for maximum variety.
export const discoverWithFilters = async ({ type = 'movie', genreIds = [], countries = [], minRating, personId, yearFrom, yearTo, page = 1 }) => {

  // Person selected → use their REAL filmography (discover can't do this for TV,
  // and with type='all' it used to mix in completely unrelated series).
  if (personId) {
    return getPersonMedia({ personId, type, genreIds, minRating, yearFrom, yearTo, page });
  }

  // If type is 'all', fetch both movies and TV in parallel and merge results
  if (type === 'all') {
    const [movieData, tvData] = await Promise.all([
      discoverWithFilters({ type: 'movie', genreIds, countries, minRating, yearFrom, yearTo, page }),
      discoverWithFilters({ type: 'series', genreIds, countries, minRating, yearFrom, yearTo, page })
    ]);

    // Interleave results for variety: movie, tv, movie, tv...
    const merged = [];
    const movieResults = movieData.results || [];
    const tvResults = tvData.results || [];
    const maxLen = Math.max(movieResults.length, tvResults.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (i < movieResults.length) merged.push(movieResults[i]);
      if (i < tvResults.length) merged.push(tvResults[i]);
    }

    return {
      results: merged,
      total_pages: Math.max(movieData.total_pages || 1, tvData.total_pages || 1),
      total_results: (movieData.total_results || 0) + (tvData.total_results || 0)
    };
  }

  const endpoint = type === 'series' ? '/discover/tv' : '/discover/movie';

  const buildParams = (opts = {}) => {
    const params = {
      sort_by: 'popularity.desc',
      page: Math.min(page, 500), // TMDB max is 500
      include_adult: false,
      language: 'uk-UA',
      'vote_count.gte': 30 // Require at least 30 votes to filter out fake 10.0s
    };

    if (genreIds && genreIds.length > 0) params.with_genres = genreIds.join('|'); // OR
    if (countries && countries.length > 0) params.with_origin_country = countries.join('|'); // OR
    if (minRating && minRating > 0) params['vote_average.gte'] = minRating;

    if (!opts.skipYear) {
      if (yearFrom) {
        const dateKey = type === 'series' ? 'first_air_date.gte' : 'primary_release_date.gte';
        params[dateKey] = `${yearFrom}-01-01`;
      }
      if (yearTo) {
        const dateKey = type === 'series' ? 'first_air_date.lte' : 'primary_release_date.lte';
        params[dateKey] = `${yearTo}-12-31`;
      }
    }

    return params;
  };

  // Quality gate — but respect an explicit country choice (user picked India
  // on purpose → don't hide Indian titles, only fake ratings)
  const clean = (data) => ({
    ...data,
    results: (data.results || []).filter(r => passesQualityGate(r, { allowRegional: countries.length > 0 }))
  });

  // Try 1: Full filters
  let data = clean(await fetchFromTMDB(endpoint, buildParams()));
  if (data.results.length > 0) return data;

  // Try 2: Drop year constraints
  if (yearFrom || yearTo) {
    console.warn('Filters fallback: removing year range');
    data = clean(await fetchFromTMDB(endpoint, buildParams({ skipYear: true })));
    if (data.results.length > 0) return data;
  }

  return data; // Return whatever we got
};

// --- Details (in-memory cache: the same title often reappears across pages) ---
const detailsCache = new Map();
const cacheDetails = (key, d) => {
  detailsCache.set(key, d);
  if (detailsCache.size > 300) detailsCache.delete(detailsCache.keys().next().value);
  return d;
};

// --- Movie Details with Videos ---
export const getMovieDetailsWithVideos = async (id) => {
  const k = `m_${id}`;
  if (detailsCache.has(k)) return detailsCache.get(k);
  return cacheDetails(k, await fetchFromTMDB(`/movie/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA',
    include_video_language: 'uk,en,null'
  }));
};

// --- TV Details with Videos ---
export const getTVDetailsWithVideos = async (id) => {
  const k = `s_${id}`;
  if (detailsCache.has(k)) return detailsCache.get(k);
  return cacheDetails(k, await fetchFromTMDB(`/tv/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA',
    include_video_language: 'uk,en,null'
  }));
};

// --- Search Movie ---
export const searchMovie = async (query) => {
  return fetchFromTMDB('/search/movie', {
    query,
    include_adult: false,
    language: 'uk-UA'
  });
};

// --- Search Multi (movies + TV) ---
export const searchMulti = async (query) => {
  return fetchFromTMDB('/search/multi', {
    query,
    include_adult: false,
    language: 'uk-UA'
  });
};

// --- Search Person (for autocomplete) ---
export const searchPerson = async (query) => {
  return fetchFromTMDB('/search/person', {
    query,
    language: 'uk-UA'
  });
};

// --- Get Movie by ID (for wishlist) ---
export const getMovieById = async (id) => {
  return fetchFromTMDB(`/movie/${id}`, {
    language: 'uk-UA'
  });
};

// --- Get Media by ID ---
// TMDB movie and TV ids are SEPARATE id spaces (movie/1396 ≠ tv/1396), so
// saved series use a 'tv_<id>' key. Bare numeric ids (legacy + movies) keep
// the old behaviour: try movie first, fall back to TV.
export const getMediaById = async (key) => {
  const isTvKey = typeof key === 'string' && key.startsWith('tv_');
  const id = isTvKey ? key.slice(3) : key;

  if (isTvKey) {
    try {
      const tv = await fetchFromTMDB(`/tv/${id}`, { language: 'uk-UA' });
      if (tv && tv.id) return { ...tv, title: tv.name, release_date: tv.first_air_date, media_type: 'tv' };
    } catch (e) { /* not found */ }
    return null; // known-type key must NOT fall back to a random movie
  }

  try {
    const movie = await fetchFromTMDB(`/movie/${id}`, { language: 'uk-UA' });
    if (movie && movie.id) return { ...movie, media_type: 'movie' };
  } catch (e) {
    // Movie not found, try TV
  }
  try {
    const tv = await fetchFromTMDB(`/tv/${id}`, { language: 'uk-UA' });
    if (tv && tv.id) return { ...tv, title: tv.name, release_date: tv.first_air_date, media_type: 'tv' };
  } catch (e) {
    // TV not found either
  }
  return null;
};

// --- Batched wishlist fetch with a persistent cache ---
// Big lists fired all requests at once → TMDB 429 → titles silently vanished
// from the wishlist. Now: localStorage cache (7 days) + batches of 8 + one
// retry per failed item. onBatch(partial) lets the UI render progressively.
const MEDIA_CACHE_KEY = 'qm_media_cache';
const MEDIA_TTL_MS = 7 * 864e5;
const readMediaCache = () => {
  try { return JSON.parse(localStorage.getItem(MEDIA_CACHE_KEY)) || {}; } catch (e) { return {}; }
};
const writeMediaCache = (cache) => {
  try {
    let entries = Object.entries(cache);
    if (entries.length > 220) entries = entries.sort((a, b) => b[1].t - a[1].t).slice(0, 180);
    localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) { /* full */ }
};
// Keep only the fields the wishlist renders — localStorage is small
const slimMedia = (v) => ({
  id: v.id, title: v.title, name: v.name,
  original_title: v.original_title, original_name: v.original_name,
  poster_path: v.poster_path, release_date: v.release_date, media_type: v.media_type
});

export const getMediaByIds = async (keys, onBatch) => {
  const cache = readMediaCache();
  const now = Date.now();
  const result = {};
  const missing = [];
  for (const k of keys) {
    const hit = cache[k];
    if (hit && now - hit.t < MEDIA_TTL_MS) result[k] = hit.d;
    else missing.push(k);
  }
  if (missing.length === 0) return result;

  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const settled = await Promise.allSettled(batch.map(k => getMediaById(k)));
    for (let j = 0; j < batch.length; j++) {
      let v = settled[j].status === 'fulfilled' ? settled[j].value : null;
      if (!v) {
        // Single retry after a pause — covers 429 bursts on large lists
        await new Promise(r => setTimeout(r, 1100));
        try { v = await getMediaById(batch[j]); } catch (e) { v = null; }
      }
      if (v) {
        const s = slimMedia(v);
        result[batch[j]] = s;
        cache[batch[j]] = { t: now, d: s };
      }
    }
    if (onBatch) onBatch({ ...result });
  }
  writeMediaCache(cache);
  return result;
};

// --- Extract Trailer Key ---
// Accepts any YouTube video: Trailer > Teaser > Clip > Featurette > any
export const getTrailerKey = (details) => {
  if (!details?.videos?.results) return null;
  const videos = details.videos.results.filter(v => v.site === 'YouTube');
  if (videos.length === 0) return null;

  // Priority: UK Trailer > EN Trailer > Any Trailer > UK Teaser > EN Teaser > Any Teaser > Any Clip > Any YouTube video
  const trailer =
    videos.find(v => v.type === 'Trailer' && v.iso_639_1 === 'uk') ||
    videos.find(v => v.type === 'Trailer' && v.iso_639_1 === 'en') ||
    videos.find(v => v.type === 'Trailer') ||
    videos.find(v => v.type === 'Teaser' && v.iso_639_1 === 'uk') ||
    videos.find(v => v.type === 'Teaser' && v.iso_639_1 === 'en') ||
    videos.find(v => v.type === 'Teaser') ||
    videos.find(v => v.type === 'Clip') ||
    videos.find(v => v.type === 'Featurette') ||
    videos[0]; // Fallback to any YouTube video at all

  return trailer ? trailer.key : null;
};

// --- Extract Director & Cast ---
export const getCreditsInfo = (details) => {
  if (!details?.credits) return { director: 'Невідомо', actors: [] };
  const director = details.credits.crew?.find(c => c.job === 'Director');
  const actors = details.credits.cast?.slice(0, 4).map(a => a.name) || [];
  return {
    director: director?.name || 'Невідомо',
    actors
  };
};
