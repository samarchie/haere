import { MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type GeocodeResult, fetchSuggestions } from "../data/geocode";
import { PinDropMap } from "./PinDropMap";
import { Input } from "./ui/input";

interface AddressAutocompleteProps {
  id: string;
  label: string;
  value: string;
  point: GeocodeResult | null;
  onChange: (value: string) => void;
  onResolve: (result: GeocodeResult) => void;
  onSearchSettled: (found: boolean) => void;
}

export function AddressAutocomplete({
  id,
  label,
  value,
  point,
  onChange,
  onResolve,
  onSearchSettled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pinDropOpen, setPinDropOpen] = useState(false);
  const seq = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onSearchSettled is a per-render callback prop; keying the debounce on it too would re-schedule the search on every parent re-render instead of only when the address text itself changes.
  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      const current = ++seq.current;
      fetchSuggestions(value).then((results) => {
        if (current !== seq.current) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        onSearchSettled(results.length > 0);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [value]);

  function selectSuggestion(result: GeocodeResult) {
    setOpen(false);
    onResolve(result);
  }

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="mb-1 block text-[10px] font-medium text-ink-soft"
      >
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id={id}
          aria-label={label}
          className="pl-8 pr-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label="Drop pin on map"
          className="sd-focus absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-kotare-navy text-white"
          onClick={() => setPinDropOpen(true)}
        >
          <MapPin className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1.5 w-full max-h-[240px] overflow-y-auto rounded-md border border-kotare-grey bg-surface-card shadow-sm">
          {suggestions.map((s) => (
            <button
              key={`${s.lat},${s.lng}`}
              type="button"
              className="sd-focus block w-full border-b border-kotare-grey/50 px-3 py-2 text-left text-[12px] last:border-b-0 hover:bg-kotare-blue/[0.06]"
              onClick={() => selectSuggestion(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <PinDropMap
        open={pinDropOpen}
        onClose={() => setPinDropOpen(false)}
        onResolve={(result) => {
          setPinDropOpen(false);
          onResolve(result);
        }}
        initialPoint={point}
      />
    </div>
  );
}
