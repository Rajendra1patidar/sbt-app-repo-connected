import React, { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, loadGoogleMaps } from "../../lib/googleMaps";

export function LocationPickerModal({ initialAddress, initialLat, initialLng, onClose, onPick }: any) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [address, setAddress] = useState(initialAddress || "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: Number(initialLat), lng: Number(initialLng) } : null
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const updateFromLatLng = (lat: number, lng: number) => {
      setCoords({ lat, lng });
      const g = (window as any).google;
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, geoStatus: string) => {
        if (!cancelled && geoStatus === "OK" && results?.[0]) setAddress(results[0].formatted_address);
      });
    };

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        try {
          const g = (window as any).google;
          const start = coords || { lat: 22.9734, lng: 78.6569 }; // roughly central India as a default
          const map = new g.maps.Map(mapDivRef.current, { center: start, zoom: coords ? 16 : 5 });
          const marker = new g.maps.Marker({ position: start, map, draggable: true });
          mapRef.current = map;
          markerRef.current = marker;

          marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            updateFromLatLng(pos.lat(), pos.lng());
          });
          map.addListener("click", (e: any) => {
            marker.setPosition(e.latLng);
            updateFromLatLng(e.latLng.lat(), e.latLng.lng());
          });

          if (searchInputRef.current) {
            const autocomplete = new g.maps.places.Autocomplete(searchInputRef.current, { fields: ["geometry", "formatted_address", "name"] });
            autocomplete.bindTo("bounds", map);
            autocomplete.addListener("place_changed", () => {
              const place = autocomplete.getPlace();
              if (!place.geometry?.location) return;
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              map.setCenter({ lat, lng });
              map.setZoom(16);
              marker.setPosition({ lat, lng });
              setCoords({ lat, lng });
              setAddress(place.formatted_address || place.name || "");
            });
          }
          if (!cancelled) setStatus("ready");
        } catch (e) {
          if (!cancelled) setStatus("error");
        }
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">Pick location on map</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {status === "error" ? (
          <div className="rounded-xl bg-warn-50 border border-warn-200 px-4 py-3 text-sm text-warn-800">
            {!GOOGLE_MAPS_API_KEY
              ? "No Google Maps API key is configured. Add VITE_GOOGLE_MAPS_API_KEY to your environment variables (Netlify site settings) to enable the map picker."
              : "Couldn't load Google Maps. Check your API key and enabled APIs (Maps JavaScript API, Places API, Geocoding API)."}
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                ref={searchInputRef}
                placeholder="Search for an address or place..."
                className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="relative w-full rounded-xl bg-paper" style={{ height: 320 }}>
              <div ref={mapDivRef} className="absolute inset-0 rounded-xl overflow-hidden" />
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/40 gap-2 pointer-events-none">
                  <Loader2 size={16} className="animate-spin" /> Loading map…
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-ink/40">Tap the map or drag the pin to fine-tune the exact spot.</p>
          </>
        )}

        {address && (
          <div className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-sm text-ink/80">{address}</div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!coords}
            onClick={() => coords && onPick({ address, lat: coords.lat, lng: coords.lng })}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- DocumentModal ---- */

/* ---- Searchable dropdown (used for customer / item pickers) ---- */
