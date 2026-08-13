import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { type GeocodeResult, reverseGeocode } from "../data/geocode";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";

// ponytail: single hardcoded fallback city (Christchurch CBD) — only city
// shipped today; revisit if a second city's analyses ship.
const FALLBACK_CENTER: [number, number] = [172.6362, -43.5321];

// ponytail: satellite has no vector style, so it's a plain raster style
// object pointed at Esri's free World Imagery tiles (no API key needed).
const BASEMAPS = {
  bright: "https://tiles.openfreemap.org/styles/bright",
  positron: "https://tiles.openfreemap.org/styles/positron",
  satellite: {
    version: 8 as const,
    sources: {
      esri: {
        type: "raster" as const,
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri",
      },
    },
    layers: [{ id: "esri", type: "raster" as const, source: "esri" }],
  },
};
type BasemapKey = keyof typeof BASEMAPS;

interface PinDropMapProps {
  open: boolean;
  onClose: () => void;
  onResolve: (result: GeocodeResult) => void;
  initialPoint: GeocodeResult | null;
}

export function PinDropMap({
  open,
  onClose,
  onResolve,
  initialPoint,
}: PinDropMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [addressText, setAddressText] = useState(initialPoint?.label ?? "");
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapKey>("bright");

  // PinDropMap stays mounted (just hidden) between opens, so the address
  // field needs to resync to whatever point the field being edited holds
  // each time the modal reopens — otherwise it's stuck showing whatever
  // initialPoint was in effect the first time this component ever mounted.
  useEffect(() => {
    if (open) {
      setAddressText(initialPoint?.label ?? "");
      setLocateError(null);
    }
  }, [open, initialPoint]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialPoint only seeds the map's starting center; re-running this effect on every keystroke elsewhere would tear the map down.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const center: [number, number] = initialPoint
      ? [initialPoint.lng, initialPoint.lat]
      : FALLBACK_CENTER;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAPS[basemap],
      center,
      zoom: 16,
    });
    mapRef.current = map;

    // ponytail: no debounce on moveend (already a discrete drag-end event,
    // not a keystroke stream) — just guard against a stale response landing
    // after a newer move.
    let requestId = 0;
    const updateAddress = async () => {
      const id = ++requestId;
      const { lat, lng } = map.getCenter();
      const label = await reverseGeocode(lat, lng);
      if (id === requestId && label) setAddressText(label);
    };
    map.on("moveend", updateAddress);
    map.once("load", updateAddress);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    mapRef.current?.setStyle(BASEMAPS[basemap]);
  }, [basemap]);

  if (!open) return null;

  function locateMe() {
    if (!navigator.geolocation) {
      setLocateError("Location isn't available in this browser.");
      return;
    }
    setLocateError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
        });
      },
      () => {
        setLocating(false);
        setLocateError(
          "Couldn't get your location — check permissions and try again.",
        );
      },
    );
  }

  async function useThisLocation() {
    const map = mapRef.current;
    if (!map || confirming) return;
    setConfirming(true);
    const { lat, lng } = map.getCenter();
    const label =
      (await reverseGeocode(lat, lng)) ??
      (addressText.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setConfirming(false);
    onResolve({ lat, lng, label });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Drop a pin"
      maxWidthClassName="max-w-[420px] sm:max-w-[640px] lg:max-w-[840px]"
    >
      <div className="relative h-[220px] overflow-hidden rounded-lg sm:h-[400px] lg:h-[520px]">
        <div ref={containerRef} className="absolute inset-0" />
        <button
          type="button"
          className="sd-focus absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-kotare-grey bg-surface-card px-2 py-1 text-[10.5px] font-medium text-ink shadow-sm disabled:opacity-70"
          onClick={locateMe}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="h-3 w-3 animate-spin text-kotare-blue" />
          ) : (
            <LocateFixed className="h-3 w-3 text-kotare-blue" />
          )}
          {locating ? "Locating…" : "Locate me"}
        </button>
        {locateError && (
          <p className="absolute left-2 top-9 z-10 max-w-[75%] rounded-md bg-surface-card px-2 py-1 text-[10px] leading-snug text-kotare-brown shadow-sm">
            {locateError}
          </p>
        )}
        <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-md border border-kotare-grey bg-surface-card shadow-sm">
          {(Object.keys(BASEMAPS) as BasemapKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`sd-focus px-2 py-1 text-[10.5px] font-medium capitalize ${
                basemap === key
                  ? "bg-kotare-blue text-white"
                  : "text-ink hover:bg-kotare-grey/10"
              }`}
              onClick={() => setBasemap(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <MapPin
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-9 w-9 -translate-x-1/2 -translate-y-[90%] text-kotare-navy"
          fill="currentColor"
          stroke="white"
          strokeWidth={1.5}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input
          aria-label="Pin address"
          className="min-w-0 flex-1 cursor-default bg-kotare-grey/10"
          value={addressText}
          readOnly
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
        />
        <Button
          className="shrink-0"
          onClick={useThisLocation}
          disabled={confirming}
        >
          Use this location
        </Button>
      </div>
    </Modal>
  );
}
