import React, { useEffect, useRef, useState } from "react";
import { Card } from "../common/UIPrimitives";
import { fmtMoney } from "../../lib/format";
import { MAPBOX_TOKEN, loadMapbox, geocode } from "../../lib/mapbox";

/* ---- Reports ---- */

export function EstimatesMapCard({ invoices, currency }: any) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapError, setMapError] = useState("");
  const apiKey = MAPBOX_TOKEN || undefined;

  const byDestination: Record<string, { total: number; count: number }> = {};
  invoices.forEach((inv: any) => {
    const dest = (inv.destination || "").trim();
    if (!dest) return;
    if (!byDestination[dest]) byDestination[dest] = { total: 0, count: 0 };
    byDestination[dest].total += Number(inv.total || 0);
    byDestination[dest].count += 1;
  });
  const destinations = Object.keys(byDestination);
  const destinationsKey = destinations.join("|");

  useEffect(() => {
    if (!apiKey || destinations.length === 0 || !mapRef.current) return;
    let cancelled = false;

    loadMapbox().then((mapboxgl) => {
      if (cancelled || !mapRef.current) return;
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [78.9, 22.5],
        zoom: 3.5,
      });
      mapInstanceRef.current = map;

      const bounds = new mapboxgl.LngLatBounds();
      let hasBounds = false;

      const placeMarker = (dest: string, lat: number, lng: number) => {
        const popupHtml = `<div style="font-size:13px;"><b>${dest}</b><br/>${byDestination[dest].count} estimate${byDestination[dest].count !== 1 ? "s" : ""}<br/><b>${fmtMoney(byDestination[dest].total, currency)}</b></div>`;
        const popup = new mapboxgl.Popup({ offset: 24 }).setHTML(popupHtml);
        new mapboxgl.Marker().setLngLat([lng, lat]).setPopup(popup).addTo(map);
        bounds.extend([lng, lat]);
        hasBounds = true;
        map.fitBounds(bounds, { padding: 40, maxZoom: 10 });
      };

      destinations.forEach(async (dest) => {
        const cacheKey = `sbt_geocode:${dest}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { lat, lng } = JSON.parse(cached);
          if (!cancelled) placeMarker(dest, lat, lng);
        } else {
          try {
            const result = await geocode(dest);
            if (cancelled || !result) return;
            localStorage.setItem(cacheKey, JSON.stringify({ lat: result.lat, lng: result.lng }));
            placeMarker(dest, result.lat, result.lng);
          } catch {
            // skip destinations that fail to geocode
          }
        }
      });

      if (!hasBounds) {
        // keep default center/zoom
      }
    }).catch(() => setMapError("Couldn't load the map. Check your Mapbox token."));

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove?.();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, destinationsKey]);

  if (!apiKey) {
    return (
      <Card>
        <h3 className="mb-1 font-display text-base font-bold text-ink">Estimates by place</h3>
        <p className="text-xs text-ink/40">Add a Mapbox access token as <code className="rounded bg-paper px-1">VITE_MAPBOX_TOKEN</code> in your frontend's environment to enable this map.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 font-display text-base font-bold text-ink">Estimates by place</h3>
      {destinations.length === 0 ? (
        <p className="text-sm text-ink/40">No estimates in this range have a destination set yet.</p>
      ) : mapError ? (
        <p className="text-sm text-bad-500">{mapError}</p>
      ) : (
        <div ref={mapRef} style={{ width: "100%", height: 260, borderRadius: 12 }} className="mt-2 bg-paper" />
      )}
    </Card>
  );
}
