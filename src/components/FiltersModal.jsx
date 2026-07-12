import { useState, useMemo, useEffect, useRef } from 'react';
import { SlidersHorizontal, Search, XCircle, X } from 'lucide-react';
import { getGenreList, searchPerson } from '../services/tmdb';

const CURRENT_YEAR = new Date().getFullYear();

const YEAR_PRESETS = [
  { label: '2020s', from: 2020, to: CURRENT_YEAR },
  { label: '2010s', from: 2010, to: 2019 },
  { label: '2000s', from: 2000, to: 2009 },
  { label: '90s', from: 1990, to: 1999 },
  { label: 'Старіші', from: 1950, to: 1989 },
];

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

const toggleInArray = (arr, value) =>
  arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

export default function FiltersModal({ onClose, filters, setFilters }) {
  const [genres, setGenres] = useState([]);
  const [personInput, setPersonInput] = useState(filters.personName || '');
  const [personSuggestions, setPersonSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Local filter state (applied on submit). Multi-select arrays.
  const [local, setLocal] = useState({
    type: filters.type || 'all',
    genreIds: filters.genreIds || [],
    countries: filters.countries || [],
    minRating: filters.minRating || 0,
    personId: filters.personId || null,
    personName: filters.personName || '',
    yearFrom: filters.yearFrom || null,
    yearTo: filters.yearTo || null
  });

  // Multi-select year presets → merged into one min..max range
  const [yearPresets, setYearPresets] = useState(() =>
    YEAR_PRESETS.filter(p => filters.yearFrom === p.from && filters.yearTo === p.to).map(p => p.label)
  );

  const applyPresets = (labels) => {
    setYearPresets(labels);
    if (labels.length === 0) {
      setLocal(prev => ({ ...prev, yearFrom: null, yearTo: null }));
      return;
    }
    const chosen = YEAR_PRESETS.filter(p => labels.includes(p.label));
    setLocal(prev => ({
      ...prev,
      yearFrom: Math.min(...chosen.map(p => p.from)),
      yearTo: Math.max(...chosen.map(p => p.to))
    }));
  };

  // --- Sheet drag state ---
  const sheetRef = useRef(null);
  const headerRef = useRef(null);
  const scrollRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragRef = useRef({ startY: 0, startTime: 0, offset: 0, dragging: false, eligible: false });

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    getGenreList().then(setGenres).catch(console.error);
  }, []);

  // --- Swipe-to-close: works on the WHOLE sheet ---
  // Native listeners with { passive: false } (React's touch events are passive,
  // so preventDefault inside them is ignored — that's why click-handlers are NOT a fix).
  // From the header zone the sheet drags ALWAYS; from the body — when the list is at top.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const d = dragRef.current;
      d.startY = e.touches[0].clientY;
      d.startTime = Date.now();
      d.offset = 0;
      d.dragging = false;
      const inHeader = headerRef.current && headerRef.current.contains(e.target);
      d.eligible = inHeader || !scrollRef.current || scrollRef.current.scrollTop <= 0;
    };

    const onTouchMove = (e) => {
      const d = dragRef.current;
      const diff = e.touches[0].clientY - d.startY;

      // Re-arm mid-gesture: list scrolled back to top and user keeps pulling down
      if (!d.eligible && scrollRef.current && scrollRef.current.scrollTop <= 0 && diff > 0) {
        d.eligible = true;
        d.startY = e.touches[0].clientY;
        return;
      }
      if (!d.eligible) return;

      if (!d.dragging) {
        if (diff > 6) {
          d.dragging = true;
          setIsDragging(true);
        } else if (diff < -6) {
          d.eligible = false; // finger goes up → scrolling, not dismissing
          return;
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault(); // stop inner scroll while dragging the sheet

      const clamped = Math.max(0, diff);
      const resistance = clamped > 100 ? 0.4 : 0.85;
      d.offset = clamped * resistance;
      setDragOffset(d.offset);
    };

    const onTouchEnd = () => {
      const d = dragRef.current;
      if (!d.dragging) return; // simple tap → do nothing (sheet must NOT close on click)
      d.dragging = false;
      setIsDragging(false);

      const elapsed = Date.now() - d.startTime;
      const velocity = d.offset / Math.max(elapsed, 1);

      if (d.offset > 110 || (velocity > 0.5 && d.offset > 40)) {
        setIsClosing(true);
        setTimeout(() => onCloseRef.current(), 300);
      } else {
        d.offset = 0;
        setDragOffset(0); // snap back
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personInput]);

  const handleApply = () => {
    setFilters(local);
    animateClose();
  };

  const handleReset = () => {
    setLocal({ type: 'all', genreIds: [], countries: [], minRating: 0, personId: null, personName: '', yearFrom: null, yearTo: null });
    setYearPresets([]);
    setPersonInput('');
  };

  const animateClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  };

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = CURRENT_YEAR; y >= 1950; y--) years.push(y);
    return years;
  }, []);

  const activeCount = local.genreIds.length + local.countries.length +
    (local.minRating > 0 ? 1 : 0) + (local.personId ? 1 : 0) +
    (local.yearFrom || local.yearTo ? 1 : 0) + (local.type !== 'all' ? 1 : 0);

  const sheetStyle = {
    transform: isClosing
      ? 'translateY(100%)'
      : `translateY(${dragOffset}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={animateClose}
      ></div>
      <div
        ref={sheetRef}
        style={sheetStyle}
        className="sheet-modal relative w-full bg-[#111] border-t border-white/10 rounded-t-3xl flex flex-col max-h-[85vh] animate-in"
      >

        {/* Header = always-draggable zone */}
        <div ref={headerRef} className="shrink-0 pb-2 pt-3" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1.5 bg-white/30 rounded-full mx-auto mb-4"></div>

          <div className="flex items-center justify-between px-6 mb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <SlidersHorizontal size={18} /> Фільтри
            </h2>
            <div className="flex items-center gap-4">
              <button onClick={handleReset} className="text-xs text-white/40 hover:text-white/70 font-semibold uppercase tracking-wider transition-colors">
                Скинути
              </button>
              <button onClick={animateClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 active:scale-90 transition-transform">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-1 px-6" style={{ overscrollBehavior: 'contain' }}>

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

          {/* Year Range — multi-select presets merge into one range */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Рік випуску <span className="text-white/25 normal-case tracking-normal">· можна кілька</span></p>

            <div className="flex flex-wrap gap-2 mb-3">
              <Pill active={yearPresets.length === 0 && !local.yearFrom && !local.yearTo} onClick={() => applyPresets([])}>Всі</Pill>
              {YEAR_PRESETS.map(preset => (
                <Pill
                  key={preset.label}
                  active={yearPresets.includes(preset.label)}
                  onClick={() => applyPresets(toggleInArray(yearPresets, preset.label))}
                >
                  {preset.label}
                </Pill>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <select
                  value={local.yearFrom || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    setYearPresets([]);
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
                    setYearPresets([]);
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

          {/* Country — multi-select */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Країна <span className="text-white/25 normal-case tracking-normal">· можна кілька</span></p>
            <div className="flex flex-wrap gap-2">
              <Pill active={local.countries.length === 0} onClick={() => setLocal(prev => ({ ...prev, countries: [] }))}>Будь-яка</Pill>
              {COUNTRIES.map(c => (
                <Pill key={c.code} active={local.countries.includes(c.code)} onClick={() => setLocal(prev => ({ ...prev, countries: toggleInArray(prev.countries, c.code) }))}>
                  {c.name}
                </Pill>
              ))}
            </div>
          </div>

          {/* Genre — multi-select */}
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Жанр <span className="text-white/25 normal-case tracking-normal">· можна кілька</span></p>
            <div className="flex flex-wrap gap-2 pb-4">
              <Pill active={local.genreIds.length === 0} onClick={() => setLocal(prev => ({ ...prev, genreIds: [] }))}>Всі жанри</Pill>
              {genres.map(g => (
                <Pill key={g.id} active={local.genreIds.includes(g.id)} onClick={() => setLocal(prev => ({ ...prev, genreIds: toggleInArray(prev.genreIds, g.id) }))}>
                  {g.name}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 px-6 pt-3 pb-6">
          <button onClick={handleApply} className="w-full bg-white text-black font-bold py-4 rounded-xl active:scale-95 transition-transform">
            Застосувати{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        </div>
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
