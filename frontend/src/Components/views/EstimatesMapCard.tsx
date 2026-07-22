import React, { useEffect, useRef, useState } from "react";
import { Card } from "../common/UIPrimitives";
import { fmtMoney } from "../../lib/format";
import { GOOGLE_MAPS_API_KEY, loadGoogleMaps } from "../../lib/googleMaps";

/* ---- Reports ---- */

export function EstimatesMapCard({ invoices, currency }: any) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState("");
  const apiKey = GOOGLE_MAPS_API_KEY || undefined;

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
    loadGoogleMaps().then(() => {
      const google = (window as any).google;
      if (cancelled || !mapRef.current) return;
      const map = new google.maps.Map(mapRef.current, { zoom: 5, center: { lat: 22.5, lng: 78.9 } });
      const geocoder = new google.maps.Geocoder();
      const bounds = new google.maps.LatLngBounds();

      const placeMarker = (dest: string, lat: number, lng: number) => {
        const pos = { lat, lng };
        const marker = new google.maps.Marker({ position: pos, map, title: dest });
        const info = new google.maps.InfoWindow({
          content: `<div style="font-size:13px;"><b>${dest}</b><br/>${byDestination[dest].count} estimate${byDestination[dest].count !== 1 ? "s" : ""}<br/><b>${fmtMoney(byDestination[dest].total, currency)}</b></div>`,
        });
        marker.addListener("click", () => info.open(map, marker));
        bounds.extend(pos);
        if (!bounds.isEmpty()) map.fitBounds(bounds);
      };

      destinations.forEach((dest) => {
        const cacheKey = `sbt_geocode:${dest}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { lat, lng } = JSON.parse(cached);
          placeMarker(dest, lat, lng);
        } else {
          geocoder.geocode({ address: dest }, (results: any, geoStatus: string) => {
            if (cancelled) return;
            if (geoStatus === "OK" && results[0]) {
              const loc = results[0].geometry.location;
              const lat = loc.lat(); const lng = loc.lng();
              localStorage.setItem(cacheKey, JSON.stringify({ lat, lng }));
              placeMarker(dest, lat, lng);
            }
          });
        }
      });
    }).catch(() => setMapError("Couldn't load Google Maps. Check your API key."));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, destinationsKey]);

  if (!apiKey) {
    return (
      <Card>
        <h3 className="mb-1 font-display text-base font-bold text-ink">Estimates by place</h3>
        <p className="text-xs text-ink/40">Add a Google Maps API key as <code className="rounded bg-paper px-1">VITE_GOOGLE_MAPS_API_KEY</code> in your frontend's environment to enable this map.</p>
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
