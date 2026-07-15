import { useEffect, useRef, useState } from 'react';

interface AddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
  /** Coordenadas del restaurante para priorizar sugerencias cercanas. */
  biasLat?: number | null;
  biasLng?: number | null;
}

/** Campo de dirección con sugerencias en vivo (OpenStreetMap/Nominatim) mientras el usuario escribe. */
export function AddressAutocomplete({ value, onChange, onSelect, placeholder, className, biasLat, biasLng }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 4) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const myId = ++requestIdRef.current;
      setLoading(true);
      const params = new URLSearchParams({ format: 'jsonv2', q: query, addressdetails: '0', limit: '5' });
      if (biasLat != null && biasLng != null) {
        const delta = 0.3;
        params.set('viewbox', `${biasLng - delta},${biasLat + delta},${biasLng + delta},${biasLat - delta}`);
      }
      fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data: any[]) => {
          if (myId !== requestIdRef.current) return;
          setSuggestions(data.map((d) => ({ displayName: d.display_name, lat: Number(d.lat), lng: Number(d.lon) })));
          setOpen(true);
        })
        .catch(() => {
          if (myId === requestIdRef.current) setSuggestions([]);
        })
        .finally(() => {
          if (myId === requestIdRef.current) setLoading(false);
        });
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, biasLat, biasLng]);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-brand-950/10 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {loading && suggestions.length === 0 && <p className="text-xs text-brand-950/40 px-3 py-2">Buscando…</p>}
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                skipNextSearchRef.current = true;
                onChange(s.displayName);
                onSelect(s);
                setSuggestions([]);
                setOpen(false);
              }}
              className="w-full text-left text-xs px-3 py-2 hover:bg-brand-950/[0.05] border-b border-brand-950/5 last:border-0"
            >
              {s.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
