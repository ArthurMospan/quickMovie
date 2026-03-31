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
    language: 'uk-UA'
  });
};

// --- Discover TV ---
export const discoverTV = async (page = 1) => {
  return fetchFromTMDB('/discover/tv', {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    language: 'uk-UA'
  });
};

// --- Discover with Filters ---
export const discoverWithFilters = async ({ type = 'movie', genreId, country, minRating, personId, yearFrom, yearTo, page = 1 }) => {
  const endpoint = type === 'series' ? '/discover/tv' : '/discover/movie';
  const params = {
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
    language: 'uk-UA',
  };

  if (genreId) params.with_genres = genreId;
  if (country) params.with_origin_country = country;
  if (minRating && minRating > 0) params['vote_average.gte'] = minRating;
  if (personId) {
    if (type !== 'series') {
      params.with_people = personId;
    }
  }

  // Year range
  if (yearFrom) {
    const dateKey = type === 'series' ? 'first_air_date.gte' : 'primary_release_date.gte';
    params[dateKey] = `${yearFrom}-01-01`;
  }
  if (yearTo) {
    const dateKey = type === 'series' ? 'first_air_date.lte' : 'primary_release_date.lte';
    params[dateKey] = `${yearTo}-12-31`;
  }

  return fetchFromTMDB(endpoint, params);
};

// --- Movie Details with Videos ---
export const getMovieDetailsWithVideos = async (id) => {
  return fetchFromTMDB(`/movie/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA'
  });
};

// --- TV Details with Videos ---
export const getTVDetailsWithVideos = async (id) => {
  return fetchFromTMDB(`/tv/${id}`, {
    append_to_response: 'videos,credits',
    language: 'uk-UA'
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

// --- Extract Trailer Key ---
export const getTrailerKey = (details) => {
  if (!details?.videos?.results) return null;
  const videos = details.videos.results;
  // Prefer Ukrainian trailer, then English, then any
  const trailer = 
    videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'uk') ||
    videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'en') ||
    videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
    videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');
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
