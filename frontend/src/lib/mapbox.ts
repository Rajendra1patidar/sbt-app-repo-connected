export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || "";

// Shree Balaji Traders' customers are concentrated in Rajgarh and Shajapur
// districts (Madhya Pradesh) — Sarangpur, where the business is based, sits
// right on the border between the two. All map search/lookup below is scoped
// to this region so a small-town name that also exists elsewhere in India
// (a common collision) doesn't get picked by mistake, and every map view
// opens already centered on home turf instead of all of India.
// Center: Sarangpur, on the Rajgarh/Shajapur border.
export const SERVICE_REGION_CENTER: [number, number] = [76.483, 23.594];
// [west, south, east, north] — a box covering both districts with a small
// margin, used to restrict/bias geocoding results and cap how far the map
// picker can be panned.
export const SERVICE_REGION_BBOX: [number, number, number, number] = [75.6, 23.05, 77.3, 24.4];
export const SERVICE_REGION_DEFAULT_ZOOM = 9;

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
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=IN&bbox=${SERVICE_REGION_BBOX.join(",")}&proximity=${SERVICE_REGION_CENTER.join(",")}`;
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
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&country=IN&bbox=${SERVICE_REGION_BBOX.join(",")}&proximity=${SERVICE_REGION_CENTER.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f: any) => ({ lat: f.center[1], lng: f.center[0], place_name: f.place_name }));
}
