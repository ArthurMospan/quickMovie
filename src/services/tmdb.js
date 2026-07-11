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

// --- Smart Feed (no filters): TikTok-style mix ---
// Blend of: trending this week + fresh well-rated + all-time masterpieces.
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

export const getSmartFeed = async (page = 1) => {
  const freshFrom = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10); // ~2 years back

  const [trending, fresh, topMovies, topTV] = await Promise.allSettled([
    // 1. What the world watches right now (movies + series)
    fetchFromTMDB('/trending/all/week', { language: 'uk-UA', page }),
    // 2. New & actually good
    fetchFromTMDB('/discover/movie', {
      language: 'uk-UA', include_adult: false, page,
      sort_by: 'popularity.desc',
      'primary_release_date.gte': freshFrom,
      'vote_average.gte': 6.5, 'vote_count.gte': 100
    }),
    // 3. All-time movie masterpieces (older stuff only if truly great)
    fetchFromTMDB('/discover/movie', {
      language: 'uk-UA', include_adult: false, page,
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.7, 'vote_count.gte': 4000
    }),
    // 4. All-time top series
    fetchFromTMDB('/discover/tv', {
      language: 'uk-UA', include_adult: false, page,
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.8, 'vote_count.gte': 1500
    })
  ]);

  const take = (settled, n, mediaType) => {
    if (settled.status !== 'fulfilled') return [];
    return (settled.value.results || [])
      .filter(r => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, n)
      .map(r => (mediaType && !r.media_type ? { ...r, media_type: mediaType } : r));
  };

  // Weights per page: trending 8, fresh 6, top movies 4, top series 3
  const mix = [
    ...take(trending, 8),
    ...take(fresh, 6, 'movie'),
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

  return {
    results: lightShuffle(deduped),
    total_pages: 500,
    total_results: 10000
  };
};

// --- Discover with Filters (with fallback logic) ---
// Multi-select: genreIds[] and countries[] are OR-combined via TMDB's "|" syntax.
// When type='all', fetches BOTH movies and TV and merges them for maximum variety.
export const discoverWithFilters = async ({ type = 'movie', genreIds = [], countries = [], minRating, personId, yearFrom, yearTo, page = 1 }) => {

  // If type is 'all', fetch both movies and TV in parallel and merge results
  if (type === 'all') {
    const [movieData, tvData] = await Promise.all([
      discoverWithFilters({ type: 'movie', genreIds, countries, minRating, personId, yearFrom, yearTo, page }),
      discoverWithFilters({ type: 'series', genreIds, countries, minRating, personId, yearFrom, yearTo, page })
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

    if (personId && !opts.skipPerson) {
      if (type !== 'series') {
        params.with_people = personId;
      }
    }

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

  // Try 1: Full filters
  let data = await fetchFromTMDB(endpoint, buildParams());
  if (data.results && data.results.length > 0) return data;

  // Try 2: Drop year constraints
  if (yearFrom || yearTo) {
    console.warn('Filters fallback: removing year range');
    data = await fetchFromTMDB(endpoint, buildParams({ skipYear: true }));
    if (data.results && data.results.length > 0) return data;
  }

  // Try 3: Drop person + year constraints
  if (personId) {
    console.warn('Filters fallback: removing person filter');
    data = await fetchFromTMDB(endpoint, buildParams({ skipYear: true, skipPerson: true }));
    if (data.results && data.results.length > 0) return data;
  }

  return data; // Return whatever we got
};

// --- Movie Details with Videos ---
export const getMovieDetailsWithVideos = async (id) => {
  return fetchFromTMDB(`/movie/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA',
    include_video_language: 'uk,en,null'
  });
};

// --- TV Details with Videos ---
export const getTVDetailsWithVideos = async (id) => {
  return fetchFromTMDB(`/tv/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA',
    include_video_language: 'uk,en,null'
  });
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

// --- Get Media by ID (movie or TV — tries movie first, falls back to TV) ---
export const getMediaById = async (id) => {
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
