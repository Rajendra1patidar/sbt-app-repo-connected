export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || "";

let mapboxLoadPromise: Promise<any> | null = null;

/**
 * Loads the mapbox-gl library (already installed via npm) and sets the
 * access token. Returns the mapboxgl module.
 */
export function loadMapbox(): Promise<any> {
  if (!MAPBOX_TOKEN) return Promise.reject(new Error("no-api-key"));
  if (mapboxLoadPromise) return mapboxLoadPromise;
  mapboxLoadPromise = import("mapbox-gl").then((mod) => {
    const mapboxgl = (mod as any).default || mod;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    return mapboxgl;
  });
  return mapboxLoadPromise;
}

/** Forward geocode: free-text address/place -> { lat, lng, place_name } */
export async function geocode(query: string): Promise<{ lat: number; lng: number; place_name: string } | null> {
  if (!MAPBOX_TOKEN || !query.trim()) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  const [lng, lat] = feature.center;
  return { lat, lng, place_name: feature.place_name };
}

/** Reverse geocode: lat/lng -> formatted place name */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!MAPBOX_TOKEN) return "";
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const data = await res.json();
  return data.features?.[0]?.place_name || "";
}

/** Autocomplete suggestions while typing */
export async function suggestPlaces(query: string): Promise<Array<{ lat: number; lng: number; place_name: string }>> {
  if (!MAPBOX_TOKEN || !query.trim()) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f: any) => ({ lat: f.center[1], lng: f.center[0], place_name: f.place_name }));
}
