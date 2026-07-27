import React, { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { MAPBOX_TOKEN, loadMapbox, reverseGeocode, suggestPlaces } from "../../lib/mapbox";

export function LocationPickerModal({ initialAddress, initialLat, initialLng, onClose, onPick }: any) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [address, setAddress] = useState(initialAddress || "");
  const [query, setQuery] = useState(initialAddress || "");
  const [suggestions, setSuggestions] = useState<Array<{ lat: number; lng: number; place_name: string }>>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: Number(initialLat), lng: Number(initialLng) } : null
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const updateFromLatLng = async (lat: number, lng: number) => {
      setCoords({ lat, lng });
      const placeName = await reverseGeocode(lat, lng);
      if (!cancelled && placeName) {
        setAddress(placeName);
        setQuery(placeName);
      }
    };

    loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || !mapDivRef.current) return;
        try {
          const start = coords || { lat: 22.9734, lng: 78.6569 }; // roughly central India as a default
          const map = new mapboxgl.Map({
            container: mapDivRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [start.lng, start.lat],
            zoom: coords ? 15 : 4,
          });
          const marker = new mapboxgl.Marker({ draggable: true }).setLngLat([start.lng, start.lat]).addTo(map);
          mapRef.current = map;
          markerRef.current = marker;

          marker.on("dragend", () => {
            const pos = marker.getLngLat();
            updateFromLatLng(pos.lat, pos.lng);
          });
          map.on("click", (e: any) => {
            marker.setLngLat(e.lngLat);
            updateFromLatLng(e.lngLat.lat, e.lngLat.lng);
          });

          if (!cancelled) setStatus("ready");
        } catch (e) {
          if (!cancelled) setStatus("error");
        }
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.trim() || query === address) { setSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = await suggestPlaces(query);
      if (!cancelled) setSuggestions(results);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pickSuggestion = (s: { lat: number; lng: number; place_name: string }) => {
    setCoords({ lat: s.lat, lng: s.lng });
    setAddress(s.place_name);
    setQuery(s.place_name);
    setSuggestions([]);
    if (mapRef.current && markerRef.current) {
      mapRef.current.flyTo({ center: [s.lng, s.lat], zoom: 15 });
      markerRef.current.setLngLat([s.lng, s.lat]);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">Pick location on map</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {status === "error" ? (
          <div className="rounded-xl bg-warn-50 border border-warn-200 px-4 py-3 text-sm text-warn-800">
            {!MAPBOX_TOKEN
              ? "No Mapbox access token is configured. Add VITE_MAPBOX_TOKEN to your environment variables (Netlify site settings) to enable the map picker."
              : "Couldn't load the map. Check your Mapbox token."}
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for an address or place..."
                className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => pickSuggestion(s)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
                    >
                      {s.place_name}
                    </button>
                  ))}
                </div>
              )}
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
