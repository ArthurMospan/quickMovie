import { useState, useMemo, useEffect } from 'react';
import { SlidersHorizontal, Search, XCircle } from 'lucide-react';
import { getGenreList, searchPerson } from '../services/tmdb';

const CURRENT_YEAR = new Date().getFullYear();

const YEAR_PRESETS = [
  { label: 'Всі', from: null, to: null },
  { label: '2020s', from: 2020, to: CURRENT_YEAR },
  { label: '2010s', from: 2010, to: 2019 },
  { label: '2000s', from: 2000, to: 2009 },
  { label: '90s', from: 1990, to: 1999 },
];

export default function FiltersModal({ onClose, filters, setFilters }) {
  const [genres, setGenres] = useState([]);
  const [personInput, setPersonInput] = useState(filters.personName || '');
  const [personSuggestions, setPersonSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Local filter state (applied on submit)
  const [local, setLocal] = useState({ ...filters });

  useEffect(() => {
    getGenreList().then(setGenres).catch(console.error);
  }, []);

  // Debounced person search
  useEffect(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!personInput || personInput.length < 2) {
      setPersonSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await searchPerson(personInput);
        setPersonSuggestions(res.results?.slice(0, 5) || []);
      } catch (e) {
        console.error(e);
      }
    }, 400);
    setSearchTimeout(timeout);
    return () => clearTimeout(timeout);
  }, [personInput]);

  const handleApply = () => {
    setFilters(local);
    onClose();
  };

  const handleReset = () => {
    const reset = { type: 'all', genreId: null, country: '', minRating: 0, personId: null, personName: '', yearFrom: null, yearTo: null };
    setLocal(reset);
    setPersonInput('');
  };

  // Check if current year range matches a preset
  const activePreset = YEAR_PRESETS.find(p => p.from === local.yearFrom && p.to === local.yearTo);

  // Generate year options for selects
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR; y >= 1950; y--) years.push(y);
    return years;
  }, []);

  const COUNTRIES = [
    { code: 'US', name: 'США' },
    { code: 'GB', name: 'Британія' },
    { code: 'KR', name: 'Корея' },
    { code: 'JP', name: 'Японія' },
    { code: 'FR', name: 'Франція' },
    { code: 'DE', name: 'Німеччина' },
    { code: 'IN', name: 'Індія' },
    { code: 'UA', name: 'Україна' },
    { code: 'AU', name: 'Австралія' },
    { code: 'ES', name: 'Іспанія' },
    { code: 'IT', name: 'Італія' },
    { code: 'TR', name: 'Туреччина' },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full bg-[#111] border-t border-white/10 rounded-t-3xl p-6 pb-8 flex flex-col max-h-[85vh] animate-in">
        {/* Handle bar */}
        <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-5 shrink-0"></div>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <SlidersHorizontal size={18} /> Фільтри
          </h2>
          <button onClick={handleReset} className="text-xs text-white/40 hover:text-white/70 font-semibold uppercase tracking-wider transition-colors">
            Скинути
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-1">
          
          {/* Rating */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Рейтинг IMDb</p>
            <div className="flex flex-wrap gap-2">
              {[0, 6, 7, 8, 9].map(r => (
                <Pill key={r} active={local.minRating === r} onClick={() => setLocal(prev => ({ ...prev, minRating: r }))}>
                  {r === 0 ? "Будь-який" : `${r}.0+`}
                </Pill>
              ))}
            </div>
          </div>

          {/* Year Range */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Рік випуску</p>
            
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2 mb-3">
              {YEAR_PRESETS.map(preset => (
                <Pill 
                  key={preset.label} 
                  active={activePreset?.label === preset.label}
                  onClick={() => setLocal(prev => ({ ...prev, yearFrom: preset.from, yearTo: preset.to }))}
                >
                  {preset.label}
                </Pill>
              ))}
            </div>

            {/* Custom Range Selects */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <select
                  value={local.yearFrom || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    setLocal(prev => ({ ...prev, yearFrom: val }));
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#111]">З року...</option>
                  {yearOptions.map(y => (
                    <option key={y} value={y} className="bg-[#111]">{y}</option>
                  ))}
                </select>
              </div>
              <span className="text-white/30 text-sm font-medium">—</span>
              <div className="flex-1">
                <select
                  value={local.yearTo || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    setLocal(prev => ({ ...prev, yearTo: val }));
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#111]">По рік...</option>
                  {yearOptions.map(y => (
                    <option key={y} value={y} className="bg-[#111]">{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Формат</p>
            <div className="flex gap-2">
              <Pill active={local.type === 'all'} onClick={() => setLocal(prev => ({ ...prev, type: 'all' }))}>Всі</Pill>
              <Pill active={local.type === 'movie'} onClick={() => setLocal(prev => ({ ...prev, type: 'movie' }))}>Фільми</Pill>
              <Pill active={local.type === 'series'} onClick={() => setLocal(prev => ({ ...prev, type: 'series' }))}>Серіали</Pill>
            </div>
          </div>

          {/* Person Autocomplete */}
          <div className="relative z-50">
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Актор або Режисер</p>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3.5 text-white/40" />
              <input 
                type="text" 
                placeholder="Наприклад: Нолан, Зендея..." 
                value={personInput}
                onChange={(e) => { setPersonInput(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
              />
              {personInput && (
                <button onClick={() => { setPersonInput(''); setLocal(prev => ({ ...prev, personId: null, personName: '' })); }} className="absolute right-3 top-3.5">
                  <XCircle size={16} className="text-white/40 hover:text-white/60" />
                </button>
              )}
            </div>
            {/* Suggestions */}
            {showSuggestions && personSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                {personSuggestions.map(person => (
                  <li 
                    key={person.id} 
                    onClick={() => {
                      setPersonInput(person.name);
                      setLocal(prev => ({ ...prev, personId: person.id, personName: person.name }));
                      setShowSuggestions(false);
                    }}
                    className="px-4 py-3 text-sm text-white/80 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 flex items-center gap-3"
                  >
                    {person.profile_path ? (
                      <img src={`https://image.tmdb.org/t/p/w45${person.profile_path}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/30 text-xs">?</div>
                    )}
                    <div>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-[10px] text-white/40">{person.known_for_department}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Country */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Країна</p>
            <div className="flex flex-wrap gap-2">
              <Pill active={!local.country} onClick={() => setLocal(prev => ({ ...prev, country: '' }))}>Будь-яка</Pill>
              {COUNTRIES.map(c => (
                <Pill key={c.code} active={local.country === c.code} onClick={() => setLocal(prev => ({ ...prev, country: c.code }))}>
                  {c.name}
                </Pill>
              ))}
            </div>
          </div>

          {/* Genre */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Жанр</p>
            <div className="flex flex-wrap gap-2 pb-4">
              <Pill active={!local.genreId} onClick={() => setLocal(prev => ({ ...prev, genreId: null }))}>Всі жанри</Pill>
              {genres.map(g => (
                <Pill key={g.id} active={local.genreId === g.id} onClick={() => setLocal(prev => ({ ...prev, genreId: g.id }))}>
                  {g.name}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleApply} className="mt-4 w-full bg-white text-black font-bold py-4 rounded-xl active:scale-95 transition-transform shrink-0">
          Застосувати
        </button>
      </div>
    </div>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border ${active ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
      {children}
    </button>
  );
}
