import React, { useEffect, useRef, useState } from "react";
import { Card } from "../common/UIPrimitives";
import { MAPBOX_TOKEN, loadMapbox, SERVICE_REGION_CENTER, SERVICE_REGION_DEFAULT_ZOOM } from "../../lib/mapbox";

/* ---- Godowns map ---- */

export function GodownsMapCard({ godowns }: any) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapError, setMapError] = useState("");
  const apiKey = MAPBOX_TOKEN || undefined;

  // Godowns already carry lat/lng directly (set via the map picker on the
  // godown form) — no geocoding needed here, unlike EstimatesMapCard which
  // has to resolve a free-text destination first.
  const pinned = (godowns || []).filter((g: any) => Number.isFinite(g.lat) && Number.isFinite(g.lng));
  const pinnedKey = pinned.map((g: any) => `${g.id}:${g.lat},${g.lng}`).join("|");

  useEffect(() => {
    if (!apiKey || pinned.length === 0 || !mapRef.current) return;
    let cancelled = false;

    loadMapbox().then((mapboxgl) => {
      if (cancelled || !mapRef.current) return;
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: SERVICE_REGION_CENTER,
        zoom: SERVICE_REGION_DEFAULT_ZOOM,
      });
      mapInstanceRef.current = map;

      map.once("load", () => map.resize());
      requestAnimationFrame(() => map.resize());
      setTimeout(() => map.resize(), 250);

      map.on("error", (e: any) => {
        if (cancelled) return;
        setMapError(e?.error?.message || "Unknown map error");
      });

      const bounds = new mapboxgl.LngLatBounds();
      pinned.forEach((g: any) => {
        const popupHtml = `<div style="font-size:13px;"><b>${g.name}</b>${g.isDefault ? " (default)" : ""}${g.location ? `<br/>${g.location}` : ""}</div>`;
        const popup = new mapboxgl.Popup({ offset: 24 }).setHTML(popupHtml);
        new mapboxgl.Marker({ color: g.isDefault ? "#2563eb" : "#64748b" }).setLngLat([g.lng, g.lat]).setPopup(popup).addTo(map);
        bounds.extend([g.lng, g.lat]);
      });
      map.fitBounds(bounds, { padding: 40, maxZoom: 12 });
    }).catch(() => setMapError("Couldn't load the map. Check your Mapbox token."));

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove?.();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, pinnedKey]);

  if (!apiKey) return null; // silent — GodownsView already works fine without a map

  return (
    <Card>
      <h3 className="mb-1 font-display text-base font-bold text-ink">Godown locations</h3>
      {pinned.length === 0 ? (
        <p className="text-sm text-ink/40">Set a location using the map picker on a godown to see it plotted here.</p>
      ) : mapError ? (
        <p className="text-sm text-bad-500">{mapError}</p>
      ) : (
        <div ref={mapRef} style={{ width: "100%", height: 220, borderRadius: 12 }} className="mt-2 bg-paper" />
      )}
    </Card>
  );
}
