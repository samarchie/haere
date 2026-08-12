import { LocateFixed, MapPin } from "lucide-react";
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
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialPoint only seeds the map's starting center; re-running this effect on every keystroke elsewhere would tear the map down.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const center: [number, number] = initialPoint
      ? [initialPoint.lng, initialPoint.lat]
      : FALLBACK_CENTER;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom: 14,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function locateMe() {
    navigator.geolocation?.getCurrentPosition((position) => {
      mapRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
      });
    });
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
    <Modal open={open} onClose={onClose} title="Drop a pin">
      <Input
        aria-label="Pin address"
        className="mb-2"
        value={addressText}
        onChange={(e) => setAddressText(e.target.value)}
      />
      <div className="relative h-[220px] overflow-hidden rounded-lg">
        <div ref={containerRef} className="absolute inset-0" />
        <button
          type="button"
          className="sd-focus absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-kotare-grey bg-surface-card px-2 py-1 text-[10.5px] font-medium text-ink shadow-sm"
          onClick={locateMe}
        >
          <LocateFixed className="h-3 w-3 text-kotare-blue" />
          Locate me
        </button>
        <MapPin className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-[90%] text-kotare-blue" />
      </div>
      <Button
        className="mt-3 w-full"
        onClick={useThisLocation}
        disabled={confirming}
      >
        Use this location
      </Button>
    </Modal>
  );
}
