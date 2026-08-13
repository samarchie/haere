import { MapPin, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type GeocodeResult, fetchSuggestions } from "../data/geocode";
import { PinDropMap } from "./PinDropMap";
import { Input } from "./ui/input";

export type SearchSettledOutcome = "found" | "empty" | "unavailable";

interface AddressAutocompleteProps {
  id: string;
  label: string;
  value: string;
  point: GeocodeResult | null;
  onChange: (value: string) => void;
  onResolve: (result: GeocodeResult) => void;
  onSearchSettled: (outcome: SearchSettledOutcome) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function AddressAutocomplete({
  id,
  label,
  value,
  point,
  onChange,
  onResolve,
  onSearchSettled,
  onKeyDown,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pinDropOpen, setPinDropOpen] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `${id}-suggestions`;

  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function scheduleSearch(query: string) {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      const current = ++seq.current;
      fetchSuggestions(query)
        .then((results) => {
          if (current !== seq.current) return;
          setSuggestions(results);
          setOpen(results.length > 0);
          onSearchSettled(results.length > 0 ? "found" : "empty");
        })
        .catch(() => {
          if (current !== seq.current) return;
          setSuggestions([]);
          setOpen(false);
          onSearchSettled("unavailable");
        });
    }, 400);
  }

  function handleChange(next: string) {
    onChange(next);
    scheduleSearch(next);
  }

  function cancelPendingSearch() {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    seq.current++;
  }

  function selectSuggestion(result: GeocodeResult) {
    cancelPendingSearch();
    setOpen(false);
    onResolve(result);
  }

  return (
    <div className="relative" ref={rootRef}>
      <label
        htmlFor={id}
        className="mb-1 block text-[12px] font-medium text-ink-soft"
      >
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          id={id}
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          className="pl-8 pr-9"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              cancelPendingSearch();
              setOpen(false);
            }
            onKeyDown?.(e);
          }}
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
        <div
          id={listboxId}
          className="absolute left-0 top-full z-10 mt-1.5 w-full max-h-[240px] overflow-y-auto rounded-md border border-kotare-grey bg-surface-card shadow-sm"
        >
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
          cancelPendingSearch();
          setPinDropOpen(false);
          onResolve(result);
        }}
        initialPoint={point}
      />
    </div>
  );
}
