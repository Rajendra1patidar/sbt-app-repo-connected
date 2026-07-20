import React, { useState, useRef, useEffect } from "react";
import {
  Menu, X, Home, Users, ShoppingBag, FileText, Truck, Receipt,
  ArrowDownToLine, Wallet, BarChart3, Globe2, Settings as SettingsIcon,
  Bell, LifeBuoy, Plus, Trash2, Phone, ChevronDown, Sparkles, RotateCcw,
  Send, Check, CheckCircle2, AlertCircle, ArrowRight, MessageSquare,
  Search, MapPin, PackageCheck, ClipboardList, ChevronUp, AlertTriangle,
  ShoppingCart, Loader2, Pencil, Printer, HardHat, Award, ChevronLeft, Eye
} from "lucide-react";
import { api } from "../lib/api";

/* ---- helpers ---- */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Per-line advance-booking progress: how much of a booked qty has been collected/returned so far. */
function bookingLineProgress(doc: any) {
  const deliveredByItem: Record<string, number> = {};
  for (const d of doc.deliveries || []) deliveredByItem[d.itemId] = (deliveredByItem[d.itemId] || 0) + d.qty;
  const returnedByItem: Record<string, number> = {};
  for (const r of doc.returns || []) returnedByItem[r.itemId] = (returnedByItem[r.itemId] || 0) + r.qty;

  return (doc.lines || []).map((l: any) => {
    const booked = Number(l.qty || 0);
    const delivered = deliveredByItem[l.itemId] || 0;
    const returned = returnedByItem[l.itemId] || 0;
    const remaining = Math.max(booked - delivered - returned, 0);
    return { itemId: l.itemId, rate: l.rate, booked, delivered, returned, remaining };
  });
}

/** True once every booked line on this estimate has been fully collected (or returned). */
function isFullyCollected(doc: any) {
  const rows = bookingLineProgress(doc);
  return rows.length > 0 && rows.every((r: any) => r.remaining <= 0);
}

const WHATSAPP_GREEN = "#25D366";
const LOW_STOCK_DEFAULT = 5;
const ITEM_CATEGORIES = ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Others"];
const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || "";

let googleMapsLoadPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("no-api-key"));
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (googleMapsLoadPromise) return googleMapsLoadPromise;
  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

interface InvoiceLine {
  itemId: string;
  qty: number;
  rate: number;
}

function waLink(phone: string, message: string) {
  const clean = (phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
function smsLink(phone: string, message: string) {
  const clean = (phone || "").replace(/[^\d+]/g, "");
  return `sms:${clean}?body=${encodeURIComponent(message)}`;
}
function fmtMoney(n: number | string, currency: string) {
  const v = Number(n) || 0;
  return `${currency}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<string, string> = {
  Accepted: "bg-advance-50 text-advance-700",
  Due: "bg-warn-50 text-warn-700",
  "Partially Paid": "bg-advance-50 text-advance-700",
  Paid: "bg-good-50 text-good-700",
  Overdue: "bg-bad-50 text-bad-700",
  Pending: "bg-warn-50 text-warn-700",
  Delivered: "bg-good-50 text-good-700",
  Received: "bg-good-50 text-good-700",
};

const CATEGORY_COLORS = ["bg-brand-400","bg-brand-300","bg-warn-500","bg-advance-500","bg-good-500","bg-bad-500"];

/* ---- nav ---- */

const NAV = [
  { id: "dashboard",  label: "Home",                icon: Home },
  { id: "customers",  label: "Customers",            icon: Users },
  { id: "items",      label: "Items",                icon: ShoppingBag },
  { id: "orders",     label: "Orders",               icon: ShoppingCart },
  { id: "estimates",  label: "Estimates",            icon: Receipt },
  { id: "challans",   label: "Delivery Challans",    icon: Truck },
  { id: "payments",   label: "Payments Received",    icon: ArrowDownToLine },
  { id: "expenses",   label: "Expenses",             icon: Wallet },
  { id: "todo",       label: "Inventory",            icon: ClipboardList },
  { id: "labour",     label: "Labour Tracking",      icon: HardHat },
  { id: "contractors", label: "Contractor Scorecard", icon: Award },
  { id: "reports",       label: "Reports",              icon: BarChart3 },
  { id: "sharereport",   label: "Share Report",         icon: Send },
  { id: "billing",       label: "Advanced Billing",     icon: Globe2 },
  { id: "settings",   label: "Settings",             icon: SettingsIcon },
];

/* ---- atoms ---- */

function PillButton({ children, onClick, className = "", disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-600 active:scale-[0.97] transition-all duration-150 ${className}`}>
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, className = "" }: any) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-paper hover:border-brand-200 active:scale-[0.97] transition-all duration-150 ${className}`}>
      {children}
    </button>
  );
}
function WhatsAppButton({ phone, message, label = "WhatsApp" }: any) {
  const enabled = !!phone;
  return (
    <a href={enabled ? waLink(phone, message) : undefined} target="_blank" rel="noreferrer"
      onClick={(e) => !enabled && e.preventDefault()}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${enabled ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
      style={{ backgroundColor: WHATSAPP_GREEN }}>
      <Phone size={13} /> {label}
    </a>
  );
}
function SmsButton({ phone, message, label = "SMS" }: any) {
  const enabled = !!phone;
  return (
    <a href={enabled ? smsLink(phone, message) : undefined}
      onClick={(e) => !enabled && e.preventDefault()}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${enabled ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
      style={{ backgroundColor: "#4f46e5" }}>
      <MessageSquare size={13} /> {label}
    </a>
  );
}
function Badge({ status }: any) {
  return <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold tracking-tight ${STATUS_STYLES[status] || "bg-ink/5 text-ink/60"}`}>{status}</span>;
}
function EmptyState({ text, cta, onCta }: any) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-ink/50 text-sm max-w-xs">{text}</p>
      {cta && <PillButton onClick={onCta}><Plus size={16} /> {cta}</PillButton>}
    </div>
  );
}
function Card({ children, className = "", onClick }: any) {
  return (
    <div onClick={onClick}
      className={`rounded-card bg-white p-5 shadow-card border border-line/70 transition-all duration-150 ${onClick ? "cursor-pointer hover:border-brand-200 active:scale-[0.995]" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ---- FieldModal ---- */

function FieldModal({ title, fields, initial, onClose, onSave, danger }: any) {
  const [values, setValues] = useState<any>(() => initial || {});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const set = (k: string, v: any) => setValues((s: any) => ({ ...s, [k]: v }));
  const canSave = fields.every((f: any) => !f.required || (values[f.key] !== undefined && values[f.key] !== ""));
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          {fields.map((f: any) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-ink/50">{f.label}{f.required && <span className="text-bad-500"> *</span>}</label>
              {f.type === "select" ? (
                <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="" disabled>Choose...</option>
                  {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  rows={3} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              ) : f.type === "location" ? (
                <div className="flex gap-2">
                  <input type="text" value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  <button type="button" onClick={() => setPickerFor(f.key)}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold text-ink/70 hover:bg-paper">
                    <MapPin size={14} /> Map
                  </button>
                </div>
              ) : (
                <input type={f.type || "text"} value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(values)}
            className={`flex-1 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40 ${danger ? "bg-bad-600" : "bg-brand-600"}`}>Save</button>
        </div>
      </div>

      {pickerFor && (
        <LocationPickerModal
          initialAddress={values[pickerFor]}
          initialLat={values[`${pickerFor}Lat`]}
          initialLng={values[`${pickerFor}Lng`]}
          onClose={() => setPickerFor(null)}
          onPick={({ address, lat, lng }: any) => {
            set(pickerFor, address);
            set(`${pickerFor}Lat`, lat);
            set(`${pickerFor}Lng`, lng);
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

/* ---- LocationPickerModal (Google Maps + Places) ---- */
function LocationPickerModal({ initialAddress, initialLat, initialLng, onClose, onPick }: any) {
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
function SearchableSelect({ options, value, onChange, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o: any) => o.value === value);
  const filtered = query
    ? options.filter((o: any) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div
      className="relative"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQuery(""); } }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "truncate text-ink" : "truncate text-ink/40"}>
          {selected ? selected.label : (placeholder || "Select...")}
        </span>
        <ChevronDown size={15} className="ml-2 shrink-0 text-ink/40" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-white p-2">
            <Search size={14} className="shrink-0 text-ink/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm outline-none"
            />
          </div>
          {filtered.length === 0
            ? <p className="px-3 py-2 text-xs text-ink/40">No matches</p>
            : filtered.map((o: any) => (
              <button
                type="button"
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-paper ${o.value === value ? "bg-brand-50 font-semibold text-brand-700" : "text-ink/80"}`}
              >
                {o.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

/* ---- Due / Paid confirmation popup shown right before an estimate is saved ---- */
function StatusChoicePopup({ total, currency, onChoose, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg font-bold text-ink">Is this estimate paid?</h3>
        <p className="mt-1 text-sm text-ink/50">Total amount: <span className="font-semibold text-ink/80">{fmtMoney(total, currency)}</span></p>
        <div className="mt-5 space-y-2">
          <button onClick={() => onChoose("Paid", false)} className="w-full rounded-full bg-good-500 py-3 text-sm font-bold text-white active:scale-[0.98]">Paid — customer has paid</button>
          <button onClick={() => onChoose("Due", false)} className="w-full rounded-full bg-warn-500 py-3 text-sm font-bold text-white active:scale-[0.98]">Due — payment pending</button>
          <button onClick={() => onChoose("Paid", true)} className="w-full rounded-full bg-brand-600 py-3 text-sm font-bold text-white active:scale-[0.98]">Advance Booking — paid now, collected in batches</button>
          <button onClick={onCancel} className="w-full rounded-full border border-line py-3 text-sm font-semibold text-ink/50">Back to editing</button>
        </div>
      </div>
    </div>
  );
}

function DocumentModal({ type, customers, items, estimates, editingDoc, onClose, onSave }: any) {
  const isEditing = !!editingDoc;
  const [customerId, setCustomerId] = useState(editingDoc?.customerId || customers[0]?.id || "");
  const [date, setDate] = useState(editingDoc?.date ? String(editingDoc.date).slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editingDoc?.dueDate ? String(editingDoc.dueDate).slice(0, 10) : today());
  const [lines, setLines] = useState<InvoiceLine[]>(editingDoc?.lines?.length ? editingDoc.lines.map((ln: InvoiceLine) => ({ ...ln })) : [{ itemId: items[0]?.id || "", qty: 1, rate: items[0]?.price || 0 }]);
  const [notes, setNotes] = useState(editingDoc?.notes || "");
  const [rateEditIndex, setRateEditIndex] = useState<number | null>(null);
  const [freightCost, setFreightCost] = useState(editingDoc?.freightCost ? String(editingDoc.freightCost) : "");
  const [labourCost, setLabourCost] = useState(editingDoc?.labourCost ? String(editingDoc.labourCost) : "");
  const [includePreviousDue, setIncludePreviousDue] = useState(!isEditing);
  const [contractorName, setContractorName] = useState(editingDoc?.contractorName || "");
  const [destination, setDestination] = useState(editingDoc?.destination || "");
  // tracks whether the destination field holds a value the user deliberately set/edited,
  // so switching customers only auto-fills an empty/untouched destination and never overwrites it
  const [destinationTouched, setDestinationTouched] = useState(!!editingDoc?.destination);
  const [pendingSave, setPendingSave] = useState<any>(null);

  useEffect(() => {
    if (type !== "estimate" || destinationTouched) return;
    const customer = customers.find((c: any) => c.id === customerId);
    if (customer?.location) setDestination(customer.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const knownContractors = Array.from(new Set((estimates || []).map((e: any) => e.contractorName).filter(Boolean))) as string[];
  const knownDestinations = Array.from(new Set((estimates || []).map((e: any) => e.destination).filter(Boolean))) as string[];

  const addLine = () => setLines((l) => [...l, { itemId: items[0]?.id || "", qty: 1, rate: items[0]?.price || 0 }]);
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln));
  const setLineItem = (i: number, itemId: string) => {
    const it = items.find((it: any) => it.id === itemId);
    updateLine(i, { itemId, rate: it?.price || 0 }); // fresh rate every time the item on this line changes
  };
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsSubtotal = lines.reduce((sum, ln) => sum + Number(ln.qty || 0) * Number(ln.rate || 0), 0);

  // when editing, exclude the estimate being edited itself from its own "previous due" calculation
  const previousDueEstimates = type === "estimate" && !isEditing ? (estimates || []).filter((e: any) => e.customerId === customerId && e.status !== "Paid") : [];
  const previousDueAmount = previousDueEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);
  const previousDue = includePreviousDue ? previousDueAmount : 0;

  const total = itemsSubtotal + Number(freightCost || 0) + Number(labourCost || 0) + previousDue;

  const titleMap: any = {
    estimate: isEditing ? "Edit Estimate" : "New Estimate",
    challan: isEditing ? "Edit Delivery Challan" : "New Delivery Challan",
  };
  const canSave = customerId && lines.length > 0 && lines.every((l) => l.itemId);

  const buildPayload = () => ({
    customerId, date, dueDate, lines, notes, total,
    freightCost: Number(freightCost || 0), labourCost: Number(labourCost || 0), previousDue,
    rolledEstimateIds: includePreviousDue ? previousDueEstimates.map((e: any) => e.id) : [],
    contractorName, destination,
    ...(isEditing ? { id: editingDoc.id } : {}),
  });

  const handleSaveClick = () => {
    if (!canSave) return;
    // new estimates ask Due/Paid before actually saving; edits keep the existing status as-is
    if (type === "estimate" && !isEditing) { setPendingSave(buildPayload()); return; }
    onSave(buildPayload());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">{titleMap[type]}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        {customers.length === 0 ? <p className="text-sm text-ink/50">Add a customer first.</p>
          : items.length === 0 ? <p className="text-sm text-ink/50">Add an item first.</p>
          : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Customer *</label>
              <SearchableSelect
                options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">{type === "challan" ? "Delivery date" : "Date"}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
              </div>
              {type !== "challan" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-ink/50">Items *</label>
              <div className="space-y-3">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isOverridden = type === "estimate" && it && Number(ln.rate) !== Number(it.price);
                  const lineSubtotal = Number(ln.qty || 0) * Number(ln.rate || 0);
                  return (
                    <div key={i} className="rounded-xl border border-line bg-paper/60 p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            options={items.map((it: any) => ({ value: it.id, label: `${it.name} (stock: ${it.stock ?? 0})` }))}
                            value={ln.itemId}
                            onChange={(v: string) => setLineItem(i, v)}
                            placeholder="Select item"
                          />
                        </div>
                        <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-16 rounded-xl border border-line px-2 py-2 text-sm" />
                        {type === "estimate" && (
                          <button type="button" onClick={() => setRateEditIndex(i)}
                            className={`relative flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-2 text-sm font-semibold ${isOverridden ? "border-warn-200 bg-warn-50 text-warn-700" : "border-brand-100 bg-brand-50 text-brand-700"}`}>
                            {fmtMoney(Number(ln.rate || 0), "")}
                            <Pencil size={11} className="opacity-70" />
                            {isOverridden && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-warn-500" />}
                          </button>
                        )}
                        {it && Number(ln.qty) > (it.stock ?? 0) && <span title="Exceeds stock"><AlertTriangle size={14} className="text-warn-500 shrink-0" /></span>}
                        {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-bad-500 hover:bg-bad-50"><Trash2 size={15} /></button>}
                      </div>
                      <p className="mt-1.5 px-1 text-xs font-semibold text-ink/50">Subtotal: {fmtMoney(lineSubtotal, "")}</p>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3.5 text-sm font-bold text-brand-600 transition hover:bg-brand-100 hover:border-brand-400 active:scale-[0.98]"
              >
                <Plus size={19} /> Add Item
              </button>
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Contractor name</label>
                  <input list="contractor-names" value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                  <datalist id="contractor-names">{knownContractors.map((n) => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Destination</label>
                  <input list="destination-names" value={destination} onChange={(e) => { setDestination(e.target.value); setDestinationTouched(true); }} placeholder="Place / area" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                  <datalist id="destination-names">{knownDestinations.map((n) => <option key={n} value={n} />)}</datalist>
                  <p className="mt-1 text-[11px] text-ink/40">Auto-filled from the customer's saved location — edit if this delivery goes elsewhere.</p>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Freight cost</label>
                  <input type="number" min="0" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/50">Labour cost</label>
                  <input type="number" min="0" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
                </div>
              </div>
            )}
            {type === "estimate" && previousDueAmount > 0 && (
              <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-warn-800">Previous due — {fmtMoney(previousDueAmount, "")}</p>
                    <p className="mt-0.5 text-xs text-warn-700">From {previousDueEstimates.length} earlier unpaid estimate{previousDueEstimates.length !== 1 ? "s" : ""}: {previousDueEstimates.map((e: any) => e.number).join(", ")}</p>
                  </div>
                  <button type="button" onClick={() => setIncludePreviousDue((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${includePreviousDue ? "bg-warn-500" : "bg-paper"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${includePreviousDue ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                {includePreviousDue && <p className="mt-2 text-[11px] text-warn-700">Included in this estimate's total. Those {previousDueEstimates.length} earlier estimate{previousDueEstimates.length !== 1 ? "s" : ""} will be marked Paid once this one is saved.</p>}
              </div>
            )}
            <div className="space-y-1 rounded-xl bg-paper px-4 py-3">
              {type === "estimate" && (
                <div className="flex items-center justify-between text-xs font-semibold text-ink/50"><span>Items subtotal</span><span>{itemsSubtotal.toFixed(2)}</span></div>
              )}
              {type === "estimate" && (Number(freightCost || 0) > 0 || Number(labourCost || 0) > 0 || previousDue > 0) && (
                <>
                  {Number(freightCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Freight</span><span>{Number(freightCost).toFixed(2)}</span></div>}
                  {Number(labourCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Labour</span><span>{Number(labourCost).toFixed(2)}</span></div>}
                  {previousDue > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Previous due</span><span>{previousDue.toFixed(2)}</span></div>}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink/50">Total</span>
                <span className="font-display text-lg font-bold text-ink">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">{isEditing ? "Save changes" : `Save ${type}`}</button>
        </div>
      </div>
      {rateEditIndex !== null && (() => {
        const ln = lines[rateEditIndex];
        const it = itemById(ln.itemId);
        return (
          <RateEditPopup
            itemName={it?.name || "Item"}
            listPrice={it?.price || 0}
            rate={ln.rate}
            onCancel={() => setRateEditIndex(null)}
            onReset={() => { updateLine(rateEditIndex, { rate: it?.price || 0 }); setRateEditIndex(null); }}
            onSave={(newRate: number) => { updateLine(rateEditIndex, { rate: newRate }); setRateEditIndex(null); }}
          />
        );
      })()}
      {pendingSave && (
        <StatusChoicePopup
          total={pendingSave.total}
          currency=""
          onChoose={(status: string, isAdvanceBooking: boolean) => { onSave({ ...pendingSave, status, isAdvanceBooking }); setPendingSave(null); }}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </div>
  );
}

function ViewEstimateModal({ doc, customers, items, currency, onClose }: any) {
  if (!doc) return null;
  const customer = customers.find((c: any) => c.id === doc.customerId);
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsSubtotal = (doc.lines || []).reduce((s: number, ln: any) => s + Number(ln.qty || 0) * Number(ln.rate || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{doc.number}</h3>
            <p className="text-xs text-ink/40">{fmtDate(doc.date)}{doc.dueDate ? ` · Due ${fmtDate(doc.dueDate)}` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{customer?.name || "Unknown customer"}</p>
              {customer?.location && <p className="text-xs text-ink/40">{customer.location}</p>}
            </div>
            <Badge status={doc.status} />
          </div>

          {(doc.contractorName || doc.destination) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {doc.contractorName && <div><p className="text-xs font-semibold text-ink/40">Contractor</p><p className="text-ink/80">{doc.contractorName}</p></div>}
              {doc.destination && <div><p className="text-xs font-semibold text-ink/40">Destination</p><p className="text-ink/80">{doc.destination}</p></div>}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-ink/50">Items</p>
            <div className="space-y-2">
              {(doc.lines || []).map((ln: any, i: number) => {
                const it = itemById(ln.itemId);
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-ink">{it?.name || ln.name || "Item"}</p>
                      <p className="text-xs text-ink/40">{ln.qty} × {fmtMoney(ln.rate, currency)}</p>
                    </div>
                    <p className="font-semibold text-ink">{fmtMoney(Number(ln.qty || 0) * Number(ln.rate || 0), currency)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {doc.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold text-ink/50">Notes</p>
              <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink/70">{doc.notes}</p>
            </div>
          )}

          <div className="space-y-1 rounded-xl bg-paper px-4 py-3">
            <div className="flex items-center justify-between text-xs font-semibold text-ink/50"><span>Items subtotal</span><span>{fmtMoney(itemsSubtotal, currency)}</span></div>
            {Number(doc.freightCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Freight</span><span>{fmtMoney(doc.freightCost, currency)}</span></div>}
            {Number(doc.labourCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Labour</span><span>{fmtMoney(doc.labourCost, currency)}</span></div>}
            {Number(doc.previousDue || 0) > 0 && <div className="flex items-center justify-between text-xs text-ink/50"><span>Previous due</span><span>{fmtMoney(doc.previousDue, currency)}</span></div>}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-ink/50">Total</span>
              <span className="font-display text-lg font-bold text-ink">{fmtMoney(doc.total, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-good-600"><span>Paid</span><span>{fmtMoney(doc.amountPaid, currency)}</span></div>
            {Number(doc.total || 0) - Number(doc.amountPaid || 0) > 0 && (
              <div className="flex items-center justify-between text-xs font-semibold text-bad-600"><span>Balance due</span><span>{fmtMoney(Number(doc.total || 0) - Number(doc.amountPaid || 0), currency)}</span></div>
            )}
          </div>

          {(doc.returns || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">Returns</p>
              <div className="space-y-1.5">
                {doc.returns.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-bad-50 px-3 py-2 text-xs text-bad-700">
                    <span>{r.name} × {r.qty} ({fmtDate(r.date)})</span>
                    <span className="font-semibold">-{fmtMoney(r.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(doc.deliveries || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">Collections (advance booking)</p>
              <div className="space-y-1.5">
                {doc.deliveries.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span>{d.name} × {d.qty}</span>
                    <span className="text-brand-500">{fmtDate(d.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(doc.history || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/50">History</p>
              <div className="space-y-2 border-l-2 border-line pl-3">
                {[...doc.history].reverse().map((h: any, i: number) => (
                  <div key={i} className="text-xs">
                    <p className="font-semibold text-ink/80">{h.action}</p>
                    <p className="text-ink/40">{fmtDate(h.date)}{h.note ? ` · ${h.note}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <button onClick={onClose} className="w-full rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Close</button>
        </div>
      </div>
    </div>
  );
}

function RateEditPopup({ itemName, listPrice, rate, onCancel, onReset, onSave }: any) {
  const [value, setValue] = useState(String(rate));
  const numeric = Number(value);
  const canSave = value !== "" && !isNaN(numeric) && numeric >= 0;
  const isOverridden = Number(rate) !== Number(listPrice);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/40 p-4">
      <div className="w-full sm:max-w-xs rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="font-display text-base font-bold text-ink">Edit rate</h3>
        <p className="mb-4 mt-0.5 text-xs text-ink/50">{itemName} — this estimate only</p>

        <label className="mb-1.5 block text-xs font-semibold text-ink/50">Rate per unit</label>
        <div className="flex items-center rounded-xl border-[1.5px] border-brand-600 px-3 py-2.5">
          <span className="mr-1 text-ink/50">₹</span>
          <input
            type="number" min="0" autoFocus value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-none p-0 font-display text-base font-bold text-ink outline-none"
          />
        </div>
        <p className="mb-4 mt-1.5 text-xs text-ink/40">Item's list price: ₹{Number(listPrice).toFixed(2)}</p>

        <p className="mb-4 text-[11px] leading-relaxed text-ink/40">
          This only changes the rate on this estimate. Your saved item price in the Items list won't be affected.
        </p>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-paper py-2.5 text-sm font-bold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(numeric)} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">Save rate</button>
        </div>
        {isOverridden && (
          <button onClick={onReset} className="mt-3 text-left text-xs font-semibold text-brand-600 underline">
            ↺ Reset to list price (₹{Number(listPrice).toFixed(2)})
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- ChallanModal ---- */

const MAX_ENTRY_ROWS = 10;
function ChallanModal({ onClose, onSave }: any) {
  const [route, setRoute] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [byWhom, setByWhom] = useState("");
  const [transporter, setTransporter] = useState("");
  const [expenses, setExpenses] = useState([{ label: "", amount: "" }]);
  const [incomes, setIncomes] = useState([{ label: "", amount: "" }]);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [feeVerified, setFeeVerified] = useState(false);

  const addRow = (setter: any, list: any[]) => {
    if (list.length < MAX_ENTRY_ROWS) setter((r: any[]) => [...r, { label: "", amount: "" }]);
  };
  const updateRow = (setter: any, list: any[], idx: number, field: string, val: string) => {
    setter(list.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRow = (setter: any, list: any[], idx: number) => {
    if (list.length > 1) setter(list.filter((_, i) => i !== idx));
  };

  const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalIncomes = incomes.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const canSave = route.trim().length > 0;

  const inputCls = "w-full rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300";
  const labelCls = "mb-1 block text-xs font-semibold text-ink/50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[93vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">New Delivery Challan</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {/* Row 1: Route | From Date | To Date */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Route *</label>
            <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Mumbai → Pune" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>From date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* By Whom | Transporter */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>By Whom</label>
            <input value={byWhom} onChange={(e) => setByWhom(e.target.value)} placeholder="Driver / person name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Transporter</label>
            <input value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="Transport company / vehicle" className={inputCls} />
          </div>
        </div>

        {/* Expense Types */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Expense Types</label>
            {expenses.length < MAX_ENTRY_ROWS && (
              <button onClick={() => addRow(setExpenses, expenses)} className="text-xs font-semibold text-brand-600">+ Add ({expenses.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {expenses.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setExpenses, expenses, i, "label", e.target.value)} placeholder="Expense label (e.g. Fuel)" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setExpenses, expenses, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-line px-3 py-2 text-sm" />
                {expenses.length > 1 && <button onClick={() => removeRow(setExpenses, expenses, i)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalExpenses > 0 && <p className="mt-1 text-right text-xs text-ink/40">Total: <span className="font-semibold text-bad-600">₹{totalExpenses.toFixed(2)}</span></p>}
        </div>

        {/* Income Types */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Income Types</label>
            {incomes.length < MAX_ENTRY_ROWS && (
              <button onClick={() => addRow(setIncomes, incomes)} className="text-xs font-semibold text-brand-600">+ Add ({incomes.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {incomes.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setIncomes, incomes, i, "label", e.target.value)} placeholder="Income label (e.g. Freight)" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setIncomes, incomes, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-line px-3 py-2 text-sm" />
                {incomes.length > 1 && <button onClick={() => removeRow(setIncomes, incomes, i)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalIncomes > 0 && <p className="mt-1 text-right text-xs text-ink/40">Total: <span className="font-semibold text-good-600">₹{totalIncomes.toFixed(2)}</span></p>}
        </div>

        {/* Delivery Fee */}
        <div className={`rounded-2xl border p-4 space-y-3 ${!feeVerified && deliveryFee ? "border-warn-400 bg-warn-50" : "border-line bg-paper"}`}>
          <div>
            <label className={labelCls}>Delivery Fee</label>
            <input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="0.00" className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white ${!feeVerified && deliveryFee ? "border-warn-400" : "border-line"}`} />
          </div>
          <button
            type="button"
            onClick={() => setFeeVerified((v) => !v)}
            className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 transition select-none"
          >
            <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${feeVerified ? "border-good-500 bg-good-500" : "border-line bg-white"}`}>
              {feeVerified && <Check size={11} className="text-white" />}
            </span>
            <span className={`text-sm font-medium ${feeVerified ? "text-good-700" : "text-ink/70"}`}>Verify delivery fee</span>
            {!feeVerified && deliveryFee && <span className="ml-auto text-xs font-semibold text-warn-600 flex items-center gap-1"><AlertTriangle size={12} /> Not verified</span>}
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ route, fromDate, toDate, byWhom, transporter, expenses, incomes, deliveryFee: Number(deliveryFee) || 0, feeVerified, total: totalIncomes - totalExpenses + (Number(deliveryFee) || 0) })}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">Save Challan</button>
        </div>
      </div>
    </div>
  );
}

/* ---- OrderModal ---- */

function OrderModal({ items, onClose, onSave, prefill }: any) {
  const [itemId, setItemId] = useState(prefill?.itemId || items[0]?.id || "");
  const [qty, setQty] = useState(String(prefill?.qty || "1"));
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const canSave = itemId && Number(qty) > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">New Order</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        {items.length === 0 ? <p className="text-sm text-ink/50">Add items first.</p> : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Item *</label>
              <SearchableSelect
                options={items.map((it: any) => ({ value: it.id, label: `${it.name} (current stock: ${it.stock ?? 0})` }))}
                value={itemId}
                onChange={setItemId}
                placeholder="Select item"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Qty to order *</label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Notes / Supplier</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Supplier name" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ itemId, qty: Number(qty), date, notes })}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">Place Order</button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ doc, items, currency, onClose, onSave }: any) {
  const alreadyReturned: Record<string, number> = {};
  for (const r of doc.returns || []) alreadyReturned[r.itemId] = (alreadyReturned[r.itemId] || 0) + r.qty;

  const returnableLines = (doc.lines || [])
    .map((l: any) => ({
      itemId: l.itemId,
      rate: l.rate,
      qty: l.qty,
      returned: alreadyReturned[l.itemId] || 0,
      name: items.find((it: any) => it.id === l.itemId)?.name || "Item",
    }))
    .filter((l: any) => l.qty - l.returned > 0);

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const setQty = (itemId: string, v: string) => setQtyMap((m) => ({ ...m, [itemId]: v }));

  const lines = returnableLines
    .map((l: any) => ({ ...l, returnQty: Math.min(Number(qtyMap[l.itemId] || 0), l.qty - l.returned) }))
    .filter((l: any) => l.returnQty > 0);
  const refundTotal = lines.reduce((s: number, l: any) => s + l.returnQty * l.rate, 0);
  const canSave = lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-ink">Return items</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink/50">{doc.number} — enter how many of each item are being returned.</p>

        {returnableLines.length === 0 ? (
          <p className="text-sm text-ink/50">Every item on this estimate has already been returned.</p>
        ) : (
          <div className="space-y-3">
            {returnableLines.map((l: any) => (
              <div key={l.itemId} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{l.name}</p>
                  <p className="text-xs text-ink/40">
                    {l.qty - l.returned} available to return · {fmtMoney(l.rate, currency)} each
                    {l.returned > 0 ? ` · ${l.returned} already returned` : ""}
                  </p>
                </div>
                <input
                  type="number" min="0" max={l.qty - l.returned} placeholder="0"
                  value={qtyMap[l.itemId] || ""} onChange={(e) => setQty(l.itemId, e.target.value)}
                  className="w-16 rounded-xl border border-line px-2 py-2 text-sm text-center"
                />
              </div>
            ))}
          </div>
        )}

        {refundTotal > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-bad-50 px-3 py-2.5">
            <span className="text-sm font-semibold text-bad-600">Refund due</span>
            <span className="font-display text-base font-bold text-bad-700">{fmtMoney(refundTotal, currency)}</span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.returnQty })))}
            className="flex-1 rounded-full bg-bad-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Refund {refundTotal > 0 ? fmtMoney(refundTotal, currency) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- InvoiceShareModal ---- */

function DeliveryModal({ doc, items, onClose, onSave }: any) {
  const rows = bookingLineProgress(doc)
    .filter((r: any) => r.remaining > 0)
    .map((r: any) => ({ ...r, name: items.find((it: any) => it.id === r.itemId)?.name || "Item" }));

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const setQty = (itemId: string, v: string) => setQtyMap((m) => ({ ...m, [itemId]: v }));

  const lines = rows
    .map((r: any) => ({ ...r, collectQty: Math.min(Number(qtyMap[r.itemId] || 0), r.remaining) }))
    .filter((r: any) => r.collectQty > 0);
  const canSave = lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-ink">Record collection</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink/50">{doc.number} — enter how many of each booked item the customer is taking right now. Can't exceed what's still remaining.</p>

        {rows.length === 0 ? (
          <p className="text-sm text-ink/50">Everything booked on this estimate has already been collected.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.itemId} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink/40">
                    {r.remaining} of {r.booked} remaining
                    {r.delivered > 0 ? ` · ${r.delivered} collected so far` : ""}
                  </p>
                </div>
                <input
                  type="number" min="0" max={r.remaining} placeholder="0"
                  value={qtyMap[r.itemId] || ""} onChange={(e) => setQty(r.itemId, e.target.value)}
                  className="w-16 rounded-xl border border-line px-2 py-2 text-sm text-center"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.collectQty })))}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Record collection
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- InvoiceShareModal ---- */

function InvoiceShareModal({ invoice, customer, items, settings, payment, onClose }: any) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isOverdue = invoice.status === "Due" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const statusColor = invoice.status === "Paid" ? "#10b981" : invoice.status === "Partially Paid" ? "#0284c7" : invoice.status === "Accepted" ? "#2563eb" : isOverdue ? "#e11d48" : "#d97706";

  // Short status text matching the printed slip ("Due" / "Paid" / "Overdue" ...), title-cased
  const compactStatusLabel = invoice.isAdvanceBooking
    ? "Advance Booked"
    : invoice.status === "Paid" ? "Paid"
    : invoice.status === "Partially Paid" ? "Partially Paid"
    : invoice.status === "Accepted" ? "Accepted"
    : isOverdue ? "Overdue" : "Due";

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Compact dashed-box receipt layout — mirrors the printed A4 estimate slip
    const CARD_W = 640;
    const PAD = 22;

    const lines = invoice.lines || [];
    const itemFont = lines.length <= 4 ? 26 : lines.length <= 8 ? 23 : 20;
    const rowH = itemFont + 22;

    const extras = ([
      ["Freight", Number(invoice.freightCost || 0)],
      ["Labour", Number(invoice.labourCost || 0)],
      ["Previous due", Number(invoice.previousDue || 0)],
    ] as [string, number][]).filter(([, v]) => v > 0);

    const HEADER_H = 96;   // name/date + location + divider
    const TOTAL_H = 78;
    const NOTES_H = invoice.notes ? 34 : 0;
    const STAT_H = 40;
    const H = HEADER_H + (lines.length + extras.length) * rowH + TOTAL_H + NOTES_H + STAT_H + PAD * 2;

    canvas.width = CARD_W; canvas.height = H;

    // white card with dashed border, like the print template
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CARD_W, H);
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    ctx.strokeRect(1, 1, CARD_W - 2, H - 2); ctx.setLineDash([]);

    let y = PAD + 26;

    // header: customer name (left) + date (right), bold
    ctx.textAlign = "left"; ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a";
    ctx.fillText(customer?.name || "Customer", PAD, y);
    ctx.textAlign = "right"; ctx.fillText(fmtDate(invoice.date), CARD_W - PAD, y);
    ctx.textAlign = "left";

    // location
    y += 26; ctx.font = "20px Arial"; ctx.fillStyle = "#64748b";
    ctx.fillText(customer?.location || "", PAD, y);

    // divider
    y += 18; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(CARD_W - PAD, y); ctx.stroke();

    // line items — "name × qty" left, amount right, dotted underline
    const drawRow = (label: string, amount: number) => {
      y += rowH;
      ctx.fillStyle = "#0f172a"; ctx.font = `${itemFont}px Arial`; ctx.textAlign = "left";
      ctx.fillText(label, PAD, y);
      ctx.textAlign = "right"; ctx.fillText(fmtMoney(amount, settings.currency), CARD_W - PAD, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(PAD, y + 10); ctx.lineTo(CARD_W - PAD, y + 10); ctx.stroke();
      ctx.setLineDash([]);
    };
    lines.forEach((ln: any) => {
      const it = items.find((i: any) => i.id === ln.itemId);
      const name = it?.name || "Item"; const qty = Number(ln.qty || 0); const price = ln.rate ?? it?.price ?? 0;
      drawRow(`${name} × ${qty}`, qty * price);
    });
    extras.forEach(([label, val]) => drawRow(label, val));

    // total — bold, border-top
    y += 20; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(CARD_W - PAD, y); ctx.stroke();
    y += 36; ctx.font = "bold 28px Arial"; ctx.fillStyle = "#0f172a"; ctx.textAlign = "left";
    ctx.fillText("Total", PAD, y);
    ctx.textAlign = "right"; ctx.fillText(fmtMoney(invoice.total, settings.currency), CARD_W - PAD, y);
    ctx.textAlign = "left";

    // notes — small italic
    if (invoice.notes) {
      y += 30; ctx.font = "italic 18px Arial"; ctx.fillStyle = "#475569";
      ctx.fillText(invoice.notes, PAD, y);
    }

    // status — right-aligned, colored to match status (Due/Paid/Overdue/etc.)
    y += 34; ctx.font = "bold 18px Arial"; ctx.fillStyle = statusColor; ctx.textAlign = "right";
    ctx.fillText(compactStatusLabel, CARD_W - PAD, y); ctx.textAlign = "left";

    setImgUrl(canvas.toDataURL("image/png"));
  }, [invoice, customer, items, settings, payment, isOverdue, statusColor, compactStatusLabel]);

  const remainingDue = Number(invoice.total || 0) - Number(invoice.amountPaid || 0);
  const message = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, thank you! Your payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) has been received.`
    : invoice.status === "Partially Paid"
    ? `Hi ${customer?.name || ""}, thanks for your payment on estimate ${invoice.number}. ${fmtMoney(remainingDue, settings.currency)} is still due.`
    : `Hi ${customer?.name || ""}, your estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} is due on ${fmtDate(invoice.dueDate)}.`;
  const smsMsg = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) received. Thank you! - ${settings.orgName}`
    : invoice.status === "Partially Paid"
    ? `Hi ${customer?.name || ""}, payment received on estimate ${invoice.number}. ${fmtMoney(remainingDue, settings.currency)} still due. - ${settings.orgName}`
    : `Hi ${customer?.name || ""}, estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} due ${fmtDate(invoice.dueDate)}. - ${settings.orgName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Share estimate</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          {imgUrl ? <img src={imgUrl} alt={`Estimate ${invoice.number}`} className="block h-auto w-full" />
            : <div className="flex h-40 items-center justify-center text-sm text-ink/40">Generating preview…</div>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink/40">Press and hold the image to save it, then share from your gallery — or use the buttons below.</p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <a href={imgUrl || undefined} download={`${invoice.number}.png`} onClick={(e) => { if (!imgUrl) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink/80 transition active:scale-[0.98] ${!imgUrl ? "opacity-40" : ""}`}>
            <ArrowDownToLine size={15} /> Download image
          </a>
          <a href={customer?.phone ? waLink(customer.phone, message) : undefined} target="_blank" rel="noreferrer"
            onClick={(e) => { if (!customer?.phone) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition ${customer?.phone ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
            style={{ backgroundColor: WHATSAPP_GREEN }}>
            <Send size={15} /> Send via WhatsApp
          </a>
          <a href={customer?.phone ? smsLink(customer.phone, smsMsg) : undefined}
            onClick={(e) => { if (!customer?.phone) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition ${customer?.phone ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
            style={{ backgroundColor: "#4f46e5" }}>
            <MessageSquare size={15} /> Send via SMS
          </a>
        </div>
        {!customer?.phone && <p className="mt-2 text-center text-xs text-bad-500">Add a phone number to enable sharing.</p>}
      </div>
    </div>
  );
}

/* ---- Sidebar + Topbar ---- */

function Sidebar({ open, onClose, active, onNav, settings, onSignOut }: any) {
  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] md:hidden animate-fade-in" />}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 transform bg-white border-r border-line transition-transform duration-300 ease-out md:translate-x-0 md:static md:z-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto px-5 py-6">
          <div className="flex items-center justify-between md:hidden mb-2">
            <span className="text-sm font-semibold text-ink/40">Menu</span>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
          </div>
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-3 relative w-16 h-16 select-none">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
                <defs>
                  <linearGradient id="sbtGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1e3a8a"/>
                    <stop offset="100%" stopColor="#2563eb"/>
                  </linearGradient>
                  <linearGradient id="sbtShine" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="white" stopOpacity="0.18"/>
                    <stop offset="100%" stopColor="white" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {/* Background rounded square */}
                <rect width="64" height="64" rx="16" fill="url(#sbtGrad)"/>
                {/* Gold accent bar */}
                <rect x="6" y="44" width="52" height="3" rx="1.5" fill="#f59e0b" opacity="0.9"/>
                {/* Shine overlay */}
                <rect width="64" height="64" rx="16" fill="url(#sbtShine)"/>
                {/* SBT text */}
                <text x="32" y="36" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="20" letterSpacing="1" fill="white">SBT</text>
              </svg>
            </div>
            <button className="flex items-center gap-1 font-display text-lg font-semibold text-ink">{settings.orgName} <ChevronDown size={16} className="text-ink/30" /></button>
            <p className="text-sm text-ink/40">{settings.email}</p>
          </div>
          <div className="-mx-5 mb-2 border-t border-line" />
          <nav className="flex-1 space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon; const isActive = active === n.id;
              return (
                <button key={n.id} onClick={() => { onNav(n.id); onClose(); }}
                  className={`flex w-full items-center gap-3 rounded-pill px-3 py-3 text-sm font-semibold transition-all duration-150 ${isActive ? "bg-brand-500 text-white shadow-sm" : "text-ink/70 hover:bg-paper"}`}>
                  <Icon size={19} /> {n.label}
                </button>
              );
            })}
          </nav>
          <div className="-mx-5 mt-2 border-t border-line pt-3">
            <button onClick={onSignOut} className="flex w-full items-center gap-3 rounded-pill px-3 py-3 text-sm font-semibold text-ink/50 hover:bg-paper">
              <X size={19} /> Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, settings, view, onOpenSearch }: any) {
  const titleMap: any = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
  titleMap.customerDetail = "Customer";
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between bg-paper/90 backdrop-blur px-5 py-4 border-b border-line/60">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="rounded-full p-2 hover:bg-white md:hidden"><Menu size={22} /></button>
        <span className="font-display text-lg font-semibold text-ink">{view === "dashboard" ? settings.orgName : titleMap[view]}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenSearch} className="rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors"><Search size={18} className="text-ink/50" /></button>
        <button className="rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors hidden sm:inline-flex"><LifeBuoy size={18} className="text-ink/50" /></button>
        <button className="relative rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors"><Bell size={18} className="text-ink/50" /></button>
      </div>
    </div>
  );
}

/* ---- Bottom nav (mobile) + radial quick-add FAB ---- */

const BOTTOM_NAV_IDS = ["dashboard", "estimates", "customers"];

function BottomNav({ active, onNav, onMore, onQuickAction }: any) {
  const [fabOpen, setFabOpen] = useState(false);
  const items = NAV.filter((n) => BOTTOM_NAV_IDS.includes(n.id));
  const quickActions = [
    { key: "expense", label: "New expense", icon: Wallet },
    { key: "customer", label: "New customer", icon: Users },
    { key: "estimate", label: "New estimate", icon: Receipt },
  ];
  return (
    <>
      {fabOpen && (
        <div onClick={() => setFabOpen(false)} className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] md:hidden animate-fade-in" />
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        {fabOpen && (
          <div className="absolute bottom-24 right-4 flex flex-col items-end gap-2">
            {quickActions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button key={a.key} onClick={() => { onQuickAction(a.key); setFabOpen(false); }}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="animate-pop-in flex items-center gap-2 rounded-pill bg-white border border-line pl-4 pr-3 py-2.5 shadow-card text-sm font-semibold text-ink/80">
                  {a.label} <Icon size={16} className="text-brand-500" />
                </button>
              );
            })}
          </div>
        )}
        <nav className="relative flex items-center justify-around bg-white border-t border-line pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] px-2">
          {items.slice(0, 2).map((n) => {
            const Icon = n.icon; const isActive = active === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)} className="flex flex-col items-center gap-1 px-3 py-1">
                <Icon size={20} className={isActive ? "text-brand-500" : "text-ink/35"} />
                <span className={`text-[10px] font-semibold ${isActive ? "text-brand-500" : "text-ink/35"}`}>{n.label}</span>
              </button>
            );
          })}
          <button onClick={() => setFabOpen((o) => !o)}
            className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-card transition-transform duration-200 active:scale-95 ${fabOpen ? "rotate-45" : ""}`}>
            <Plus size={24} />
          </button>
          {items.slice(2).map((n) => {
            const Icon = n.icon; const isActive = active === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)} className="flex flex-col items-center gap-1 px-3 py-1">
                <Icon size={20} className={isActive ? "text-brand-500" : "text-ink/35"} />
                <span className={`text-[10px] font-semibold ${isActive ? "text-brand-500" : "text-ink/35"}`}>{n.label}</span>
              </button>
            );
          })}
          <button onClick={onMore} className="flex flex-col items-center gap-1 px-3 py-1">
            <Menu size={20} className="text-ink/35" />
            <span className="text-[10px] font-semibold text-ink/35">More</span>
          </button>
        </nav>
      </div>
    </>
  );
}

/* ---- Global Search ---- */

function GlobalSearchOverlay({ customers, items, estimates, currency, onSelectCustomer, onSelectItem, onSelectEstimate, onClose }: any) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const matchedCustomers = query ? customers.filter((c: any) =>
    c.name.toLowerCase().includes(query) || (c.location || "").toLowerCase().includes(query) || (c.phone || "").includes(query)
  ).slice(0, 6) : [];

  const matchedItems = query ? items.filter((it: any) => it.name.toLowerCase().includes(query)).slice(0, 6) : [];

  const matchedEstimates = query ? estimates.filter((e: any) => {
    const cust = customers.find((c: any) => c.id === e.customerId);
    return (e.number || "").toLowerCase().includes(query)
      || (cust?.name || "").toLowerCase().includes(query)
      || (cust?.location || "").toLowerCase().includes(query)
      || (e.notes || "").toLowerCase().includes(query);
  }).slice(0, 6) : [];

  const noResults = query && matchedCustomers.length === 0 && matchedItems.length === 0 && matchedEstimates.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-ink/40">
      <div className="mx-auto max-w-lg bg-white h-full sm:h-auto sm:mt-16 sm:rounded-3xl sm:shadow-xl overflow-y-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-white p-4">
          <Search size={18} className="text-ink/40 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, items, estimates..."
            className="flex-1 text-sm focus:outline-none"
          />
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-5">
          {!query && <p className="text-sm text-ink/40 text-center py-6">Start typing to search across customers, items and estimates.</p>}

          {matchedCustomers.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Customers</p>
              <div className="space-y-1.5">
                {matchedCustomers.map((c: any) => (
                  <button key={c.id} onClick={() => onSelectCustomer(c.id)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      {c.location && <p className="text-xs text-ink/40">{c.location}</p>}
                    </div>
                    <ArrowRight size={14} className="text-ink/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedItems.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Items</p>
              <div className="space-y-1.5">
                {matchedItems.map((it: any) => (
                  <button key={it.id} onClick={() => onSelectItem(it.id)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                    <div>
                      <p className="text-sm font-semibold text-ink">{it.name}</p>
                      <p className="text-xs text-ink/40">Stock: {it.stock ?? 0}</p>
                    </div>
                    <ArrowRight size={14} className="text-ink/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedEstimates.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-ink/40">Estimates</p>
              <div className="space-y-1.5">
                {matchedEstimates.map((e: any) => {
                  const cust = customers.find((c: any) => c.id === e.customerId);
                  return (
                    <button key={e.id} onClick={() => onSelectEstimate(e)} className="w-full flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-left">
                      <div>
                        <p className="text-sm font-semibold text-ink">{e.number} · {cust?.name || "Unknown"}</p>
                        <p className="text-xs text-ink/40">{fmtMoney(e.total, currency)}</p>
                      </div>
                      <Badge status={e.status} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {noResults && <p className="text-sm text-ink/40 text-center py-6">No matches for "{q}".</p>}
        </div>
      </div>
    </div>
  );
}

/* ---- Dashboard ---- */

function Dashboard({ data, settings, openModal, go }: any) {
  const { customers, estimates, expenses, items, payments } = data;
  const [tab, setTab] = useState("estimates");
  const outstanding = estimates.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const overdueEstimates = estimates.filter((i: any) => i.status !== "Paid" && i.dueDate && new Date(i.dueDate) < new Date());
  const overdueAmount = overdueEstimates.reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const byCategory: any = {};
  expenses.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
  const catEntries = Object.entries(byCategory) as [string, number][];
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0);
  const lowStockItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));

  const quickActions = [
    { label: "New Estimate", icon: Receipt, bg: "bg-brand-50", fg: "text-brand-500", action: () => openModal("estimate") },
    { label: "New Customer", icon: Users, bg: "bg-good-50", fg: "text-good-500", action: () => openModal("customer") },
    { label: "New Expense", icon: Wallet, bg: "bg-bad-50", fg: "text-bad-500", action: () => openModal("expense") },
    { label: "New Order", icon: ShoppingCart, bg: "bg-warn-50", fg: "text-warn-500", action: () => openModal("order") },
  ];
  const [segment, setSegment] = useState<"receivable" | "collected">("receivable");
  const collectedThisMonth = estimates.reduce((s: number, e: any) => s + Number(e.amountPaid || 0), 0);

  const refundPayments = (payments || []).filter((p: any) => Number(p.amount) < 0);
  const returnsForList = refundPayments.map((p: any) => ({
    id: p.id, number: `Refund — ${p.invoiceNumber || "—"}`, date: p.date, total: Math.abs(Number(p.amount)),
  }));
  const recentMap: any = { estimates, expenses, returns: returnsForList };
  const recent = recentMap[tab].slice(0, 5);

  // ---- Monthly sales (last 6 months, from estimate dates) ----
  const monthKey = (d?: string) => (d || "").slice(0, 7); // "YYYY-MM"
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, idx) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: dt.toLocaleDateString("en-IN", { month: "short" }) };
  });
  const salesByMonth = months.map((m) => ({
    ...m,
    total: estimates.filter((e: any) => monthKey(e.date) === m.key).reduce((s: number, e: any) => s + Number(e.total || 0), 0),
  }));
  const maxSale = Math.max(1, ...salesByMonth.map((m) => m.total));
  const hasSales = salesByMonth.some((m) => m.total > 0);

  // ---- Today / this-month sales vs refunds ----
  const todayKey = today();
  const thisMonthKey = monthKey(now.toISOString());
  const todaySales = estimates.filter((e: any) => e.date === todayKey).reduce((s: number, e: any) => s + Number(e.total || 0), 0);
  const monthSales = salesByMonth[salesByMonth.length - 1]?.total || 0;
  const refundsToday = refundPayments.filter((p: any) => p.date === todayKey).reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
  const refundsMonth = refundPayments.filter((p: any) => monthKey(p.date) === thisMonthKey).reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);

  return (
    <div className="space-y-5 px-5 pb-28">
      <div className="pt-1">
        <h1 className="font-display text-2xl font-semibold text-ink">Welcome, {settings.ownerName}</h1>
        <p className="text-sm text-ink/40">Here's where the business stands today</p>
      </div>

      <div className="flex rounded-2xl bg-white border border-line p-1">
        <button onClick={() => setSegment("receivable")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-150 ${segment === "receivable" ? "bg-paper text-ink shadow-sm" : "text-ink/40"}`}>Receivable</button>
        <button onClick={() => setSegment("collected")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-150 ${segment === "collected" ? "bg-paper text-ink shadow-sm" : "text-ink/40"}`}>Collected</button>
      </div>

      <div className="relative overflow-hidden rounded-card bg-brand-700 p-6 text-white">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/40" />
        <div className="relative">
          <p className="text-xs font-semibold text-white/70">{segment === "receivable" ? "Total receivable" : "Collected this month"}</p>
          <p className="mt-1 font-display text-3xl font-semibold">{fmtMoney(segment === "receivable" ? outstanding : collectedThisMonth, settings.currency)}</p>
          <p className={`mt-1 text-xs font-semibold ${segment === "receivable" && overdueEstimates.length > 0 ? "text-bad-200" : "text-good-200"}`}>
            {segment === "receivable"
              ? overdueEstimates.length > 0 ? `${overdueEstimates.length} overdue estimate${overdueEstimates.length !== 1 ? "s" : ""}` : "Nothing overdue"
              : "Across all estimates"}
          </p>
          <div className="mt-4 flex gap-6">
            <div>
              <p className="text-[11px] text-white/60">Today</p>
              <p className="font-mono text-sm font-semibold">{fmtMoney(todaySales, settings.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/60">This month</p>
              <p className="font-mono text-sm font-semibold">{fmtMoney(monthSales, settings.currency)}</p>
            </div>
          </div>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-card bg-warn-50 border border-warn-500/20 px-4 py-3">
          <AlertTriangle size={16} className="text-warn-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warn-700">Low stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""}</p>
            <div className="mt-2 space-y-1.5">
              {lowStockItems.map((it: any) => {
                const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
                const suggestedQty = Math.max(1, threshold * 2 - (it.stock ?? 0));
                return (
                  <div key={it.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <p className="text-xs font-semibold text-warn-700">{it.name} ({it.stock ?? 0} left)</p>
                    <button
                      onClick={() => openModal("order", { itemId: it.id, qty: suggestedQty })}
                      className="rounded-pill bg-warn-500 px-3 py-1 text-[11px] font-semibold text-white"
                    >
                      Reorder
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {quickActions.map((q) => (
          <button key={q.label} onClick={q.action} className="flex flex-col items-center gap-2">
            <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${q.bg} ${q.fg} transition-transform duration-150 active:scale-90`}><q.icon size={20} /></span>
            <span className="text-[11px] font-medium text-ink/60 leading-tight">{q.label}</span>
          </button>
        ))}
      </div>

      {overdueEstimates.length > 0 && (
        <Card className="border-bad-500/20 bg-bad-50/60">
          <div className="flex items-center gap-2 text-bad-700">
            <AlertCircle size={16} /> <h3 className="font-display text-base font-semibold">Overdue</h3>
          </div>
          <p className="mt-1 text-sm text-bad-500">{overdueEstimates.length} estimate{overdueEstimates.length !== 1 ? "s" : ""} past due date.</p>
          <p className="mt-3 font-display text-2xl font-semibold text-bad-700">{fmtMoney(overdueAmount, settings.currency)}</p>
          <PillButton className="mt-4 !bg-bad-500 hover:!bg-bad-700" onClick={() => go("estimates")}>View overdue estimates</PillButton>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2 text-ink/70">
          <ArrowDownToLine size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Sales &amp; refunds</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-ink/40">Today</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(todaySales, settings.currency)}</p>
            {refundsToday > 0 && <p className="text-xs font-semibold text-bad-500">−{fmtMoney(refundsToday, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-good-500">Net {fmtMoney(todaySales - refundsToday, settings.currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink/40">This month</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{fmtMoney(monthSales, settings.currency)}</p>
            {refundsMonth > 0 && <p className="text-xs font-semibold text-bad-500">−{fmtMoney(refundsMonth, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-good-500">Net {fmtMoney(monthSales - refundsMonth, settings.currency)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2 text-ink/70">
          <BarChart3 size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Sales, last 6 months</h3>
        </div>
        {!hasSales ? (
          <p className="text-sm text-ink/40">No estimates yet in the last 6 months.</p>
        ) : (
          <div className="flex items-end justify-between gap-2" style={{ height: 150 }}>
            {salesByMonth.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold leading-tight text-ink/50">{m.total > 0 ? fmtMoney(m.total, settings.currency) : ""}</span>
                <div className="w-full rounded-t-lg bg-brand-500 transition-all duration-500 ease-out" style={{ height: `${Math.max(3, (m.total / maxSale) * 100)}px` }} />
                <span className="text-xs font-medium text-ink/40">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-ink/70">
          <RotateCcw size={16} className="text-brand-500" /> <h3 className="font-display text-base font-semibold">Recent transactions</h3>
        </div>
        <div className="mb-4 flex gap-2">
          {["estimates", "expenses", "returns"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-pill px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-150 ${tab === t ? "bg-brand-500 text-white" : "bg-paper text-ink/60"}`}>{t}</button>
          ))}
        </div>
        {recent.length === 0 ? (
          <EmptyState text={`No ${tab} yet.`} cta={`Create ${tab === "estimates" ? "Estimate" : tab === "expenses" ? "Expense" : "Estimate"}`}
            onCta={() => openModal(tab === "expenses" ? "expense" : "estimate")} />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((r: any, i: number) => (
              <li key={r.id} style={{ animationDelay: `${i * 25}ms` }} className="animate-row-in flex items-center justify-between py-3 text-sm">
                <div><p className="font-semibold text-ink">{r.number || r.category}</p><p className="text-xs text-ink/40">{fmtDate(r.date)}</p></div>
                <div className="text-right"><p className="font-mono font-semibold text-ink">{fmtMoney(r.total ?? r.amount, settings.currency)}</p>{r.status && <Badge status={r.status} />}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {catEntries.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Top expenses</h3>
            <span className="text-xs font-semibold text-ink/40">This fiscal year</span>
          </div>
          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-pill">
            {catEntries.map(([cat, v], i) => <div key={cat} className={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} style={{ width: `${(v / catTotal) * 100}%` }} />)}
          </div>
          <ul className="space-y-2">
            {catEntries.map(([cat, v], i) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink/60"><span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />{cat}</span>
                <span className="font-mono font-semibold text-ink">{fmtMoney(v, settings.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ---- Customers ---- */

function CustomersView({ customers, openModal, removeCustomer, estimates, onSelectCustomer }: any) {
  const balanceFor = (customerId: string) =>
    (estimates || [])
      .filter((e: any) => String(e.customerId) === String(customerId))
      .reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("customer")}><Plus size={16} /> New Customer</PillButton>
      </div>
      {customers.length === 0
        ? <Card><EmptyState text="Add your first customer." cta="New Customer" onCta={() => openModal("customer")} /></Card>
        : customers.map((c: any, idx: number) => {
          const balance = balanceFor(c.id);
          const initials = (c.name || "?").trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <Card key={c.id} style={{ animationDelay: `${Math.min(idx, 8) * 25}ms` }} className="animate-row-in flex items-center gap-3 justify-between cursor-pointer" onClick={() => onSelectCustomer(c.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${balance > 0 ? "bg-bad-50 text-bad-500" : "bg-good-50 text-good-500"}`}>{initials}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{c.name}</p>
                  <p className="text-xs text-ink/40 truncate">{c.email || "No email"}{c.phone ? ` · ${c.phone}` : ""}</p>
                  {c.location && (
                    <a
                      href={c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`}
                      target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 flex items-center gap-1 text-xs text-ink/40 hover:text-brand-500 hover:underline"
                    >
                      <MapPin size={11} /> {c.location}
                    </a>
                  )}
                  {balance > 0 && <p className="mt-1 text-xs font-semibold text-bad-500">Due {fmtMoney(balance, "₹")}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <WhatsAppButton phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
                <SmsButton phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
                <button onClick={() => removeCustomer(c.id)} className="rounded-full p-2 text-bad-500/70 hover:bg-bad-50"><Trash2 size={16} /></button>
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}

/* ---- Customer Ledger / Detail ---- */

function CustomerDetailView({ customer, estimates, payments, items, currency, openModal, onBack }: any) {
  if (!customer) {
    return (
      <div className="px-5 pb-28 pt-1">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50"><ChevronLeft size={16} /> Back</button>
        <Card className="mt-3"><EmptyState text="Customer not found." /></Card>
      </div>
    );
  }

  const custEstimates = (estimates || [])
    .filter((e: any) => String(e.customerId) === String(customer.id))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
  const custPayments = (payments || [])
    .filter((p: any) => String(p.customerId) === String(customer.id))
    .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));

  const balance = custEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);
  const overdueEstimates = custEstimates.filter((e: any) => e.status !== "Paid" && e.dueDate && new Date(e.dueDate) < new Date());

  return (
    <div className="space-y-4 px-5 pb-28 pt-1">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50"><ChevronLeft size={16} /> Back</button>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-ink">{customer.name}</p>
            <p className="text-xs text-ink/40">{customer.email || "No email"}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            {customer.location && (
              <a
                href={customer.lat && customer.lng ? `https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.location)}`}
                target="_blank" rel="noreferrer"
                className="mt-1 flex items-center gap-1 text-xs text-ink/40 hover:text-brand-500 hover:underline"
              >
                <MapPin size={11} /> {customer.location}
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <WhatsAppButton phone={customer.phone} message={`Hi ${customer.name}, reaching out from ${customer.name}'s account.`} />
            <SmsButton phone={customer.phone} message={`Hi ${customer.name}, reaching out from ${customer.name}'s account.`} />
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-ink/40">Balance due</p>
        <p className={`mt-1 text-2xl font-bold ${balance > 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(balance, currency)}</p>
        {overdueEstimates.length > 0 && (
          <p className="mt-1 text-xs font-semibold text-warn-600">{overdueEstimates.length} overdue estimate{overdueEstimates.length !== 1 ? "s" : ""}</p>
        )}
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/80">Estimates ({custEstimates.length})</h3>
        {custEstimates.length === 0 ? (
          <Card><EmptyState text="No estimates yet." /></Card>
        ) : (
          <div className="space-y-2">
            {custEstimates.map((e: any) => {
              const overdue = e.status !== "Paid" && e.dueDate && new Date(e.dueDate) < new Date();
              return (
                <Card key={e.id} onClick={() => openModal("viewEstimate", { doc: e })} className="flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform">
                  <div>
                    <p className="font-semibold text-ink">{e.number}</p>
                    <p className="text-xs text-ink/40">{fmtDate(e.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-ink">{fmtMoney(e.total, currency)}</p>
                    <Badge status={overdue ? "Overdue" : e.status} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink/80">Payments ({custPayments.length})</h3>
        {custPayments.length === 0 ? (
          <Card><EmptyState text="No payments yet." /></Card>
        ) : (
          <div className="space-y-2">
            {custPayments.map((p: any) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">{p.invoiceNumber || "—"}</p>
                  <p className="text-xs text-ink/40">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}</p>
                </div>
                <p className={`font-bold ${Number(p.amount) < 0 ? "text-bad-600" : "text-good-600"}`}>{fmtMoney(p.amount, currency)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Items (with stock display) ---- */

function ItemsView({ items, openModal, removeItem, currency }: any) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = items.filter((it: any) => {
    const matchesSearch = !search.trim() || it.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = category === "All" || (it.category || "Others") === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("item")}><Plus size={16} /> New Item</PillButton>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {["All", ...ITEM_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
        ))}
      </div>
      {items.length === 0
        ? <Card><EmptyState text="Add items you sell." cta="New Item" onCta={() => openModal("item")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No items match your search/filter.</p></Card>
        : filtered.map((it: any) => {
          const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
          const isLow = (it.stock ?? 0) <= threshold;
          return (
            <Card key={it.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{it.name}</p>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/50">{it.category || "Others"}</span>
                  {isLow && <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs font-semibold text-warn-700 flex items-center gap-1"><AlertTriangle size={10} /> Low stock</span>}
                </div>
                <p className="text-xs text-ink/40">{it.unit || "unit"} · Stock: <span className={`font-semibold ${isLow ? "text-warn-600" : "text-ink/80"}`}>{it.stock ?? 0}</span> (alert at ≤{threshold})</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-ink/40">Sell: <span className="font-bold text-ink">{fmtMoney(it.sellingPrice ?? it.price, currency)}</span></p>
                  {it.purchasePrice > 0 && <p className="text-xs text-ink/40">Buy: <span className="font-semibold text-ink/70">{fmtMoney(it.purchasePrice, currency)}</span></p>}
                </div>
                <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Pencil size={16} /></button>
                <button onClick={() => removeItem(it.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}

/* ---- Orders ---- */

function OrdersView({ orders, items, openModal, markOrderReceived, removeOrder }: any) {
  const [category, setCategory] = useState("All");
  const itemName = (id: string) => items.find((it: any) => it.id === id)?.name || "Unknown item";
  const itemCategory = (id: string) => items.find((it: any) => it.id === id)?.category || "Others";
  const categoryFiltered = category === "All" ? orders : orders.filter((o: any) => itemCategory(o.itemId) === category);
  const pending = categoryFiltered.filter((o: any) => o.status === "Pending");
  const received = categoryFiltered.filter((o: any) => o.status === "Received");

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("order")}><Plus size={16} /> New Order</PillButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {["All", ...ITEM_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
        ))}
      </div>

      {orders.length === 0
        ? <Card><EmptyState text="Place orders to restock your inventory. Marking an order as Received will automatically update the item's stock." cta="New Order" onCta={() => openModal("order")} /></Card>
        : pending.length === 0 && received.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No orders match this category.</p></Card>
        : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Pending ({pending.length})</p>
                {pending.map((o: any) => (
                  <Card key={o.id} className="mb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-ink">{itemName(o.itemId)}</p>
                        <p className="text-xs text-ink/40">Qty: {o.qty} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                      </div>
                      <Badge status="Pending" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => markOrderReceived(o.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-good-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.98]">
                        <PackageCheck size={13} /> Mark Received
                      </button>
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {received.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-ink/40">Received ({received.length})</p>
                {received.map((o: any) => (
                  <Card key={o.id} className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink">{itemName(o.itemId)}</p>
                      <p className="text-xs text-ink/40">Qty: {o.qty} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status="Received" />
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )
      }
    </div>
  );
}

/* ---- DocumentList ---- */

function DocumentList({ type, docs, customers, items, currency, openModal, removeDoc, updateStatus, recordPayment, onShareInvoice, onPrint, onView, onReturn, onDeliver }: any) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | due | paid | returned
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  const customerPhone = (id: string) => customers.find((c: any) => c.id === id)?.phone;
  const labelMap: any = { estimate: "Estimate", challan: "Challan" };
  const emptyMap: any = {
    estimate: "Create estimates to send price quotes and invoices to customers.",
    challan: "Create delivery challans to track goods sent.",
  };
  const monthKey = (d?: string) => (d || "").slice(0, 7) || "unknown";
  const monthLabel = (key: string) => {
    if (key === "unknown") return "No date";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };
  const toggleMonth = (k: string) => setCollapsedMonths((s) => ({ ...s, [k]: !s[k] }));

  // docs already arrive newest-first from the API (and stay that way as new ones are prepended locally)
  let visibleDocs = docs;
  if (type === "estimate") {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      visibleDocs = visibleDocs.filter((d: any) => {
        const cust = customers.find((c: any) => c.id === d.customerId);
        const name = (cust?.name || "").toLowerCase();
        const location = (cust?.location || "").toLowerCase();
        const notes = (d.notes || "").toLowerCase();
        return name.includes(q) || location.includes(q) || notes.includes(q);
      });
    }
    if (statusFilter === "due") visibleDocs = visibleDocs.filter((d: any) => d.status !== "Paid");
    else if (statusFilter === "paid") visibleDocs = visibleDocs.filter((d: any) => d.status === "Paid");
    else if (statusFilter === "returned") visibleDocs = visibleDocs.filter((d: any) => (d.returns || []).length > 0);
  }

  const monthGroups: { key: string; docs: any[] }[] = [];
  if (type === "estimate") {
    const map: Record<string, any[]> = {};
    visibleDocs.forEach((d: any) => {
      const k = monthKey(d.date);
      if (!map[k]) { map[k] = []; monthGroups.push({ key: k, docs: map[k] }); }
      map[k].push(d);
    });
  }

  const renderCard = (d: any) => {
    const isOverdue = type === "estimate" && d.status === "Due" && d.dueDate && new Date(d.dueDate) < new Date();
    const displayStatus = isOverdue ? "Overdue" : d.status;
    const msg = `Hi ${customerName(d.customerId)}, here is your ${labelMap[type].toLowerCase()} ${d.number} for ${fmtMoney(d.total, currency)}.`;
    if (type === "challan") {
      const totalExp = (d.expenses || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      const totalInc = (d.incomes || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      return (
        <Card key={d.id}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-ink">{d.number} · {d.route || "–"}</p>
              <p className="text-xs text-ink/40">{fmtDate(d.fromDate)} → {fmtDate(d.toDate)}</p>
            </div>
            <Badge status={d.status} />
          </div>
          {(d.byWhom || d.transporter) && (
            <div className="mt-2 flex gap-3 text-xs text-ink/50">
              {d.byWhom && <span><span className="font-semibold text-ink/40">By:</span> {d.byWhom}</span>}
              {d.transporter && <span><span className="font-semibold text-ink/40">Via:</span> {d.transporter}</span>}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {totalExp > 0 && <div className="rounded-xl bg-bad-50 px-2 py-1.5"><p className="text-xs text-bad-400">Expenses</p><p className="text-sm font-bold text-bad-600">{fmtMoney(totalExp, currency)}</p></div>}
            {totalInc > 0 && <div className="rounded-xl bg-good-50 px-2 py-1.5"><p className="text-xs text-good-500">Income</p><p className="text-sm font-bold text-good-700">{fmtMoney(totalInc, currency)}</p></div>}
            {d.deliveryFee > 0 && (
              <div className={`rounded-xl px-2 py-1.5 ${d.feeVerified ? "bg-brand-50" : "bg-warn-50 border border-warn-300"}`}>
                <p className={`text-xs flex items-center justify-center gap-1 ${d.feeVerified ? "text-brand-400" : "text-warn-500"}`}>
                  {!d.feeVerified && <AlertTriangle size={10} />}Delivery fee
                </p>
                <p className={`text-sm font-bold ${d.feeVerified ? "text-brand-700" : "text-warn-700"}`}>{fmtMoney(d.deliveryFee, currency)}</p>
                {!d.feeVerified && <p className="text-xs text-warn-500 font-semibold">Unverified</p>}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/70">
              {["Pending","Delivered"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={15} /></button>
          </div>
        </Card>
      );
    }

    return (
      <Card key={d.id}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-ink">{d.number}</p>
            <p className="text-xs text-ink/40">{customerName(d.customerId)} · {fmtDate(d.date)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge status={displayStatus} />
            {type === "estimate" && d.isAdvanceBooking && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Advance Booking</span>
            )}
          </div>
        </div>
        <p className="mt-3 font-display text-lg font-bold text-ink">{fmtMoney(d.total, currency)}</p>
        {type === "estimate" && d.status !== "Due" && Number(d.amountPaid || 0) > 0 && (
          <p className="mt-0.5 text-xs text-ink/50">
            Paid {fmtMoney(d.amountPaid, currency)}
            {d.status !== "Paid" && <span className="text-warn-600 font-semibold"> · {fmtMoney(Number(d.total || 0) - Number(d.amountPaid || 0), currency)} due</span>}
          </p>
        )}
        {type === "estimate" && d.notes && <p className="mt-1 text-xs text-ink/40 line-clamp-2">📝 {d.notes}</p>}
        {type === "estimate" && d.isAdvanceBooking && (() => {
          const rows = bookingLineProgress(d);
          const pending = rows.filter((r: any) => r.remaining > 0);
          if (rows.length === 0) return null;
          const itemName = (id: string) => items?.find?.((it: any) => it.id === id)?.name;
          return (
            <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2">
              <p className="text-xs font-semibold text-brand-700 mb-1">{pending.length > 0 ? "Advance booking — collection pending" : "Advance booking — fully collected"}</p>
              {pending.length > 0 && (
                <div className="space-y-0.5">
                  {pending.map((r: any) => (
                    <p key={r.itemId} className="text-xs text-brand-600">
                      {itemName(r.itemId) || "Item"}: {r.remaining} of {r.booked} remaining{r.delivered > 0 ? ` (${r.delivered} collected)` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {type !== "challan" && (
            <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/70">
              {["Accepted","Due","Partially Paid","Paid"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {type === "estimate" && <GhostButton onClick={() => onView(d)}><Eye size={13} /> View</GhostButton>}
          {type === "estimate" && d.status !== "Paid" && <GhostButton onClick={() => recordPayment(d)}><CheckCircle2 size={13} /> Record payment</GhostButton>}
          {type === "estimate" && d.isAdvanceBooking && (d.lines || []).length > 0 && !isFullyCollected(d) && <GhostButton onClick={() => onDeliver(d)}><Truck size={13} /> Record collection</GhostButton>}
          {type === "estimate" && (d.lines || []).length > 0 && <GhostButton onClick={() => onReturn(d)}><RotateCcw size={13} /> Return items</GhostButton>}
          {type === "estimate" && <GhostButton onClick={() => onPrint(d)}><Printer size={13} /> Print</GhostButton>}
          {type === "estimate"
            ? <button onClick={() => onShareInvoice(d)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98]" style={{ backgroundColor: WHATSAPP_GREEN }}><Phone size={13} /> Share estimate</button>
            : <WhatsAppButton phone={customerPhone(d.customerId)} message={msg} label="Send" />
          }
          <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={15} /></button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{docs.length} {labelMap[type].toLowerCase()}{docs.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal(type)}><Plus size={16} /> New {labelMap[type]}</PillButton>
      </div>
      {type === "estimate" && (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, location or notes..."
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[["all", "All"], ["due", "Due"], ["paid", "Paid"], ["returned", "Returned items"]].map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusFilter === key ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{label}</button>
            ))}
          </div>
        </>
      )}
      {docs.length === 0
        ? <Card><EmptyState text={emptyMap[type]} cta={`New ${labelMap[type]}`} onCta={() => openModal(type)} /></Card>
        : type === "estimate"
        ? (visibleDocs.length === 0
          ? <Card><p className="text-center text-sm text-ink/40">No estimates match your search/filter.</p></Card>
          : monthGroups.map((g, idx) => {
            const isCollapsed = collapsedMonths[g.key] !== undefined ? collapsedMonths[g.key] : idx !== 0;
            return (
              <div key={g.key}>
                <button onClick={() => toggleMonth(g.key)} className="flex w-full items-center justify-between rounded-xl bg-paper px-4 py-2.5">
                  <span className="text-sm font-bold text-ink/80">{monthLabel(g.key)}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
                    {g.docs.length} estimate{g.docs.length !== 1 ? "s" : ""}
                    {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  </span>
                </button>
                {!isCollapsed && <div className="mt-2 space-y-3">{g.docs.map(renderCard)}</div>}
              </div>
            );
          }))
        : visibleDocs.map(renderCard)
      }
    </div>
  );
}

/* ---- Payments ---- */

function PaymentsView({ payments, customers, currency, openModal, removePayment }: any) {
  const [tab, setTab] = useState<"received" | "refunds">("received");
  const [search, setSearch] = useState("");
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";

  const received = payments.filter((p: any) => Number(p.amount) >= 0);
  const refunds = payments.filter((p: any) => Number(p.amount) < 0);
  const list = tab === "received" ? received : refunds;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? list.filter((p: any) => customerName(p.customerId).toLowerCase().includes(q) || (p.invoiceNumber || "").toLowerCase().includes(q))
    : list;

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{payments.length} total</p>
        <PillButton onClick={() => openModal("payment")}><Plus size={16} /> Record Payment</PillButton>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("received")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "received" ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>Payments Received ({received.length})</button>
        <button onClick={() => setTab("refunds")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "refunds" ? "bg-bad-500 text-white" : "bg-paper text-ink/70"}`}>Refunds ({refunds.length})</button>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer or estimate number..."
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
        />
      </div>
      {list.length === 0
        ? <Card><EmptyState text={tab === "received" ? "Record payments you receive." : "Refunds from returned items will show up here."} cta={tab === "received" ? "Record Payment" : undefined} onCta={() => openModal("payment")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No matches for "{search}".</p></Card>
        : filtered.map((p: any) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">{customerName(p.customerId)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink/40">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}</span>
                {p.invoiceNumber
                  ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">{p.invoiceNumber}</span>
                  : <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/40">No estimate linked</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-bold ${Number(p.amount) < 0 ? "text-bad-600" : "text-good-600"}`}>{Number(p.amount) < 0 ? "−" : "+"}{fmtMoney(Math.abs(p.amount), currency)}</span>
              <button onClick={() => removePayment(p.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

/* ---- Expenses ---- */

function ExpensesView({ expenses, currency, openModal, removeExpense }: any) {
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("expense")}><Plus size={16} /> Record Expense</PillButton>
      </div>
      {expenses.length === 0
        ? <Card><EmptyState text="Record your expenses." cta="Record Expense" onCta={() => openModal("expense")} /></Card>
        : expenses.map((e: any) => (
          <Card key={e.id} className="flex items-center justify-between">
            <div><p className="font-semibold text-ink">{e.category}</p><p className="text-xs text-ink/40">{e.vendor || "No vendor"} · {fmtDate(e.date)}</p></div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-bad-600">-{fmtMoney(e.amount, currency)}</span>
              <button onClick={() => removeExpense(e.id)} className="rounded-full p-2 text-bad-400 hover:bg-bad-50"><Trash2 size={16} /></button>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

/* ---- To-Do Tracking (inventory focus, replaces Time Tracking) ---- */

function ContractorScorecardView({ estimates, items, currency }: any) {
  const [openContractor, setOpenContractor] = useState<string | null>(null);

  const byContractor: Record<string, { total: number; count: number; itemMap: Record<string, { name: string; qty: number; amount: number }> }> = {};
  (estimates || []).forEach((est: any) => {
    const name = (est.contractorName || "").trim();
    if (!name) return;
    if (!byContractor[name]) byContractor[name] = { total: 0, count: 0, itemMap: {} };
    byContractor[name].total += Number(est.total || 0);
    byContractor[name].count += 1;
    (est.lines || []).forEach((ln: any) => {
      const it = items.find((i: any) => i.id === ln.itemId);
      const itemName = it?.name || "Unknown item";
      const qty = Number(ln.qty || 0);
      const amount = qty * Number(ln.rate ?? it?.price ?? 0);
      if (!byContractor[name].itemMap[itemName]) byContractor[name].itemMap[itemName] = { name: itemName, qty: 0, amount: 0 };
      byContractor[name].itemMap[itemName].qty += qty;
      byContractor[name].itemMap[itemName].amount += amount;
    });
  });

  const contractors = Object.keys(byContractor).sort((a, b) => byContractor[b].total - byContractor[a].total);

  return (
    <div className="space-y-3 px-5 pb-28">
      {contractors.length === 0 ? (
        <Card><p className="text-sm text-ink/40">No estimates have a contractor name set yet. Add one when creating an estimate to see them here.</p></Card>
      ) : contractors.map((name) => {
        const c = byContractor[name];
        const itemRows = Object.values(c.itemMap).sort((a, b) => b.amount - a.amount);
        const isOpen = openContractor === name;
        return (
          <Card key={name}>
            <button className="flex w-full items-center justify-between text-left" onClick={() => setOpenContractor(isOpen ? null : name)}>
              <div>
                <p className="text-sm font-bold text-ink">{name}</p>
                <p className="mt-0.5 text-xs text-ink/40">{c.count} estimate{c.count !== 1 ? "s" : ""} · {fmtMoney(c.total, currency)}</p>
              </div>
              {isOpen ? <ChevronUp size={18} className="text-ink/40" /> : <ChevronDown size={18} className="text-ink/40" />}
            </button>
            {isOpen && (
              <div className="mt-3 border-t border-line pt-3">
                {itemRows.map((r) => (
                  <div key={r.name} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-ink/70">{r.name}</span>
                    <span className="text-ink/50">{r.qty} units</span>
                    <span className="font-semibold text-ink">{fmtMoney(r.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const LABOUR_RATES = { cement: 4, saria: 20, balu: 5 };

function LabourTrackingView({ sessions, knownWorkers, onSave, onRemove, currency }: any) {
  const todayStr = today();
  const [workerCount, setWorkerCount] = useState(1);
  const [names, setNames] = useState<string[]>([""]);
  const [cementQty, setCementQty] = useState("");
  const [sariaQty, setSariaQty] = useState("");
  const [baluQty, setBaluQty] = useState("");
  const [otherIncluded, setOtherIncluded] = useState(false);
  const [otherAmount, setOtherAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(todayStr);

  const setWorkerCountSafe = (n: number) => {
    const clamped = Math.max(1, Math.min(20, n));
    setWorkerCount(clamped);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push("");
      return next.slice(0, clamped);
    });
  };

  const cementAmt = Number(cementQty || 0) * LABOUR_RATES.cement;
  const sariaAmt = Number(sariaQty || 0) * LABOUR_RATES.saria;
  const baluAmt = Number(baluQty || 0) * LABOUR_RATES.balu;
  const otherAmt = otherIncluded ? Number(otherAmount || 0) : 0;
  const sessionTotal = cementAmt + sariaAmt + baluAmt + otherAmt;

  const canSave = names.some((n) => n.trim()) && sessionTotal > 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        date: todayStr, time: new Date().toISOString(),
        workers: names.map((n) => n.trim()).filter(Boolean),
        cementQty: Number(cementQty || 0), sariaQty: Number(sariaQty || 0), baluQty: Number(baluQty || 0),
        otherIncluded, otherAmount: otherIncluded ? Number(otherAmount || 0) : 0,
        total: sessionTotal,
      });
      setNames((prev) => prev.map(() => "")); setCementQty(""); setSariaQty(""); setBaluQty(""); setOtherIncluded(false); setOtherAmount("");
    } finally { setSaving(false); }
  };

  const todaySessions = sessions.filter((s: any) => s.date === todayStr).sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const todayTotal = todaySessions.reduce((s: number, x: any) => s + Number(x.total || 0), 0);

  const rangeSessions = sessions.filter((s: any) => s.date >= fromDate && s.date <= toDate);
  const byDay: Record<string, number> = {};
  rangeSessions.forEach((s: any) => { byDay[s.date] = (byDay[s.date] || 0) + Number(s.total || 0); });
  const dayRows = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">Log a work session</h3>

        <label className="mb-1 block text-xs font-semibold text-ink/50">Number of workers</label>
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => setWorkerCountSafe(workerCount - 1)} className="h-8 w-8 rounded-lg border border-line bg-paper font-display text-lg font-bold text-ink/70">−</button>
          <span className="w-6 text-center font-display text-base font-bold text-ink">{workerCount}</span>
          <button onClick={() => setWorkerCountSafe(workerCount + 1)} className="h-8 w-8 rounded-lg border border-line bg-paper font-display text-lg font-bold text-ink/70">+</button>
        </div>

        <datalist id="labour-worker-names">
          {(knownWorkers || []).map((n: string) => <option key={n} value={n} />)}
        </datalist>
        <div className="mb-4 space-y-2">
          {names.map((n, i) => (
            <input key={i} list="labour-worker-names" value={n} onChange={(e) => setNames((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))}
              placeholder={`Worker ${i + 1} name`} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold text-ink/50">Materials moved (shared by the group)</label>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Cement</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.cement}/unit</span>
          <input type="number" min="0" value={cementQty} onChange={(e) => setCementQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(cementAmt, currency)}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Saria</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.saria}/unit</span>
          <input type="number" min="0" value={sariaQty} onChange={(e) => setSariaQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(sariaAmt, currency)}</span>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-ink/80">Balu</span>
          <span className="w-16 text-xs text-ink/40">₹{LABOUR_RATES.balu}/unit</span>
          <input type="number" min="0" value={baluQty} onChange={(e) => setBaluQty(e.target.value)} className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(baluAmt, currency)}</span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink/50">Include "Other" work?</span>
          <button type="button" onClick={() => setOtherIncluded((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${otherIncluded ? "bg-warn-500" : "bg-paper"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${otherIncluded ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {otherIncluded && (
          <div className="mb-3 flex items-center gap-2">
            <span className="w-16 text-sm font-semibold text-ink/80">Other</span>
            <span className="w-16 text-xs text-ink/40">your rate</span>
            <input type="number" min="0" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="₹" className="w-20 rounded-xl border border-line px-2 py-2 text-center text-sm" />
            <span className="ml-auto text-sm font-bold text-brand-600">{fmtMoney(otherAmt, currency)}</span>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-brand-700">This session</span>
          <span className="font-display text-lg font-bold text-brand-700">{fmtMoney(sessionTotal, currency)}</span>
        </div>
        <button disabled={!canSave || saving} onClick={save} className="mt-3 w-full rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Saving…" : "+ Save session"}
        </button>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">Today's sessions</h3>
          <span className="text-xs font-semibold text-ink/40">{todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""}</span>
        </div>
        {todaySessions.length === 0 ? (
          <p className="text-sm text-ink/40">No sessions logged yet today.</p>
        ) : (
          <div>
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between border-b border-line py-2.5 last:border-none">
                <div className="flex gap-3">
                  <span className="w-16 shrink-0 text-xs font-bold text-ink/40">{new Date(s.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{(s.workers || []).join(", ") || "—"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.cementQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Cement {fmtMoney(s.cementQty * LABOUR_RATES.cement, currency)}</span>}
                      {s.sariaQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Saria {fmtMoney(s.sariaQty * LABOUR_RATES.saria, currency)}</span>}
                      {s.baluQty > 0 && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Balu {fmtMoney(s.baluQty * LABOUR_RATES.balu, currency)}</span>}
                      {s.otherIncluded && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink/50">Other {fmtMoney(s.otherAmount, currency)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">{fmtMoney(s.total, currency)}</span>
                  <button onClick={() => onRemove(s.id)} className="rounded-full p-1 text-bad-400 hover:bg-bad-50"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-xl bg-good-50 px-4 py-3">
              <span className="text-sm font-semibold text-good-700">Today's total ({todaySessions.length})</span>
              <span className="font-display text-base font-bold text-good-700">{fmtMoney(todayTotal, currency)}</span>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">History</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-ink/50">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          <label className="text-xs font-semibold text-ink/50">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
        </div>
        {dayRows.length === 0 ? <p className="text-sm text-ink/40">No sessions in this range.</p> : (
          <div>
            {dayRows.map((d) => (
              <div key={d} className="flex items-center justify-between border-b border-line py-2 last:border-none">
                <span className="text-sm text-ink/70">{fmtDate(d)}</span>
                <span className="text-sm font-bold text-ink">{fmtMoney(byDay[d], currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ToDoTrackingView({ items, settings, openModal }: any) {
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [category, setCategory] = useState("All");

  const lowItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const categoryFiltered = category === "All" ? items : items.filter((it: any) => (it.category || "Others") === category);
  const allItems = [...categoryFiltered].sort((a: any, b: any) => (a.stock ?? 0) - (b.stock ?? 0));

  const stockColor = (it: any) => {
    const s = it.stock ?? 0;
    const t = it.lowStock ?? LOW_STOCK_DEFAULT;
    if (s === 0) return "text-bad-600";
    if (s <= t) return "text-warn-600";
    return "text-good-600";
  };

  const printInventory = () => {
    const rowsHtml = allItems.map((it: any) =>
      `<tr><td>${it.name}</td><td>${it.unit || "unit"}</td><td style="text-align:right;">${it.stock ?? 0}</td><td style="text-align:right;">${it.lowStock ?? LOW_STOCK_DEFAULT}</td></tr>`
    ).join("");
    const w = window.open("", "_blank", "width=560,height=760");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Inventory</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 0.2mm solid #e2e8f0; font-size: 11px; }
      th { color: #64748b; font-weight: 600; }
    </style></head><body>
      <h1>${settings?.orgName || "Business"} — Inventory</h1>
      <table><thead><tr><th>Item</th><th>Unit</th><th style="text-align:right;">In stock</th><th style="text-align:right;">Alert ≤</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  return (
    <div className="space-y-4 px-5 pb-28">

      {/* Low inventory alerts */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warn-500" />
          <h3 className="font-display text-base font-bold text-ink">Low Inventory Alerts</h3>
          {lowItems.length > 0 && (
            <span className="ml-auto rounded-full bg-warn-100 px-2.5 py-0.5 text-xs font-bold text-warn-700">{lowItems.length}</span>
          )}
        </div>
        {lowItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-good-50 px-4 py-3">
            <CheckCircle2 size={18} className="text-good-500" />
            <p className="text-sm font-semibold text-good-700">All items are well-stocked!</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lowItems.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between rounded-xl bg-warn-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{it.name}</p>
                  <p className="text-xs text-ink/50">{it.unit || "unit"} · Alert threshold: {it.lowStock ?? LOW_STOCK_DEFAULT}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`font-display text-xl font-bold ${(it.stock ?? 0) === 0 ? "text-bad-600" : "text-warn-600"}`}>{it.stock ?? 0}</p>
                    <p className="text-xs text-ink/40">in stock</p>
                  </div>
                  <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-white"><Pencil size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Full inventory — collapsible */}
      <Card>
        <button
          onClick={() => setInventoryOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={17} className="text-ink/50" />
            <h3 className="font-display text-base font-bold text-ink">Full Inventory Stock</h3>
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink/50">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span onClick={(e) => { e.stopPropagation(); printInventory(); }} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink/80"><Printer size={12} /> Print</span>
            {inventoryOpen ? <ChevronUp size={18} className="text-ink/40" /> : <ChevronDown size={18} className="text-ink/40" />}
          </div>
        </button>

        {inventoryOpen && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {["All", ...ITEM_CATEGORIES].map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === c ? "bg-brand-500 text-white" : "bg-paper text-ink/70"}`}>{c}</button>
              ))}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-ink/40">No items added yet. Go to Items to add your first product.</p>
            ) : allItems.length === 0 ? (
              <p className="text-sm text-ink/40">No items match this category.</p>
            ) : (
              <ul className="space-y-2">
                {allItems.map((it: any) => (
                  <li key={it.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-ink">{it.name}</p>
                      <p className="text-xs text-ink/40">{it.unit || "unit"} · {it.category || "Others"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={`font-display text-base font-bold ${stockColor(it)}`}>{it.stock ?? 0}</p>
                        <p className="text-xs text-ink/40">/ alert ≤{it.lowStock ?? LOW_STOCK_DEFAULT}</p>
                      </div>
                      <button onClick={() => openModal("item", { editingItem: it })} className="rounded-full p-2 text-ink/40 hover:bg-paper"><Pencil size={15} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---- Reports ---- */

function EstimatesMapCard({ invoices, currency }: any) {
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

function ReportsView({ data, currency, settings }: any) {
  const { invoices, payments, expenses, customers, labourSessions, items } = data;
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + i.total, 0);
  const totalReceived = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const outstanding = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.amountPaid || 0)), 0);
  const rangeLabour = (labourSessions || []).filter((s: any) => s.date >= fromDate && s.date <= toDate);
  const rangeLabourTotal = rangeLabour.reduce((s: number, x: any) => s + Number(x.total || 0), 0);
  const statusCounts: Record<string, number> = {};
  invoices.forEach((i: any) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });

  // Real gross margin: revenue minus cost-of-goods-sold, using each item's purchasePrice —
  // distinct from "netProfit" below, which is just cash collected minus overhead expenses
  // and says nothing about what the goods actually cost to buy.
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemStats = new Map<string, { name: string; qtySold: number; revenue: number; cost: number }>();
  const bumpItem = (itemId: string, name: string, qty: number, revenue: number, cost: number) => {
    const key = itemId || "unknown";
    const cur = itemStats.get(key) || { name: name || "Unknown item", qtySold: 0, revenue: 0, cost: 0 };
    cur.qtySold += qty; cur.revenue += revenue; cur.cost += cost;
    if (name) cur.name = name;
    itemStats.set(key, cur);
  };
  for (const inv of invoices) {
    for (const ln of inv.lines || []) {
      const it = itemById(ln.itemId);
      const qty = Number(ln.qty || 0), rate = Number(ln.rate || 0), pp = Number(it?.purchasePrice || 0);
      bumpItem(ln.itemId, it?.name, qty, qty * rate, qty * pp);
    }
    for (const ret of inv.returns || []) {
      const it = itemById(ret.itemId);
      const qty = Number(ret.qty || 0), revBack = Number(ret.amount || qty * Number(ret.rate || 0)), pp = Number(it?.purchasePrice || 0);
      bumpItem(ret.itemId, ret.name || it?.name, -qty, -revBack, -qty * pp);
    }
  }
  const itemProfitability = Array.from(itemStats.entries())
    .map(([itemId, s]) => ({ itemId, ...s, margin: s.revenue - s.cost }))
    .sort((a, b) => b.margin - a.margin);
  const costOfGoodsSold = itemProfitability.reduce((s, i) => s + i.cost, 0);
  const itemRevenue = itemProfitability.reduce((s, i) => s + i.revenue, 0);
  const grossProfit = itemRevenue - costOfGoodsSold;
  const grossMarginPercent = itemRevenue ? (grossProfit / itemRevenue) * 100 : 0;

  const stats = [
    { label: "Total Invoiced", value: totalInvoiced, color: "text-brand-600" },
    { label: "Total Received", value: totalReceived, color: "text-good-600" },
    { label: "Outstanding", value: outstanding, color: "text-warn-600" },
    { label: "Total Expenses", value: totalExpenses, color: "text-bad-600" },
  ];
  const trimmedName = nameQuery.trim().toLowerCase();
  const nameMatchedCustomers = trimmedName ? customers.filter((c: any) => c.name.toLowerCase().includes(trimmedName)) : [];
  const nameMatchedInvoices = trimmedName ? invoices.filter((inv: any) => nameMatchedCustomers.some((c: any) => c.id === inv.customerId)) : [];
  const trimmedLoc = locationQuery.trim().toLowerCase();
  const locationMatchedCustomers = trimmedLoc ? customers.filter((c: any) => c.location && c.location.toLowerCase().includes(trimmedLoc)) : [];

  const printRangeReport = () => {
    const inRange = (d: string) => d && d >= fromDate && d <= toDate;
    const rangeEstimates = invoices.filter((i: any) => inRange(i.date));
    const rangePayments = payments.filter((p: any) => inRange(p.date));
    const rangeExpenses = expenses.filter((e: any) => inRange(e.date));
    const rInvoiced = rangeEstimates.reduce((s: number, i: any) => s + i.total, 0);
    const rReceived = rangePayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    const rExpenses = rangeExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const rowsHtml = rangeEstimates.map((inv: any) => {
      const c = customers.find((cu: any) => cu.id === inv.customerId);
      return `<tr><td>${inv.number}</td><td>${fmtDate(inv.date)}</td><td>${c?.name || ""}</td><td>${inv.status}</td><td style="text-align:right;">${fmtMoney(inv.total, currency)}</td></tr>`;
    }).join("");

    const w = window.open("", "_blank", "width=560,height=760");
    if (!w) { return; }
    w.document.write(`<!doctype html><html><head><title>Report ${fromDate} to ${toDate}</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .sub { color: #64748b; font-size: 11px; margin-bottom: 10px; }
      .stats { display: flex; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
      .stat { border: 0.3mm solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
      .stat b { display: block; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 0.2mm solid #e2e8f0; font-size: 11px; }
      th { color: #64748b; font-weight: 600; }
    </style></head><body>
      <h1>${settings?.orgName || "Business"} — Report</h1>
      <div class="sub">${fmtDate(fromDate)} to ${fmtDate(toDate)}</div>
      <div class="stats">
        <div class="stat">Invoiced<b>${fmtMoney(rInvoiced, currency)}</b></div>
        <div class="stat">Received<b>${fmtMoney(rReceived, currency)}</b></div>
        <div class="stat">Expenses<b>${fmtMoney(rExpenses, currency)}</b></div>
        <div class="stat">Labour<b>${fmtMoney(rangeLabourTotal, currency)}</b></div>
      </div>
      <table><thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Status</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5">No estimates in this range.</td></tr>`}</tbody></table>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-ink/50">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-ink/50">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          </div>
          <button onClick={printRangeReport} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink/80"><Printer size={13} /> Print report</button>
        </div>
        <p className="mt-2 text-xs text-ink/40">Prints estimates, payments received, and expenses between the two dates.</p>
        {rangeLabourTotal > 0 && <p className="mt-1 text-xs font-semibold text-warn-600">Labour cost in this range: {fmtMoney(rangeLabourTotal, currency)} ({rangeLabour.length} session{rangeLabour.length !== 1 ? "s" : ""})</p>}
      </Card>
      <EstimatesMapCard invoices={invoices.filter((i: any) => i.date >= fromDate && i.date <= toDate)} currency={currency} />
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (<Card key={s.label}><p className="text-xs font-semibold text-ink/40">{s.label}</p><p className={`mt-1 font-display text-xl font-bold ${s.color}`}>{fmtMoney(s.value, currency)}</p></Card>))}
      </div>

      <Card className="border border-good-100 bg-good-50/40">
        <p className="text-xs font-semibold text-good-700">Gross Profit (revenue − cost of goods sold)</p>
        <p className="mt-1 text-2xl font-bold text-good-700">{fmtMoney(grossProfit, currency)}</p>
        <p className="mt-1 text-xs text-good-600">{grossMarginPercent.toFixed(1)}% margin · Cost of goods sold: {fmtMoney(costOfGoodsSold, currency)}</p>
        <p className="mt-2 text-xs text-ink/40">This is different from "Total Received − Total Expenses" — it accounts for what your items actually cost to buy, not just cash overhead.</p>
      </Card>

      {itemProfitability.length > 0 && (
        <Card>
          <h3 className="mb-3 font-display text-base font-bold text-ink">Item profitability</h3>
          <div className="space-y-2">
            {itemProfitability.slice(0, 10).map((it) => (
              <div key={it.itemId} className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-ink">{it.name}</p>
                  <p className="text-xs text-ink/40">{it.qtySold} sold · Revenue {fmtMoney(it.revenue, currency)}</p>
                </div>
                <p className={`text-sm font-bold ${it.margin >= 0 ? "text-good-600" : "text-bad-600"}`}>{fmtMoney(it.margin, currency)}</p>
              </div>
            ))}
          </div>
          {itemProfitability.length > 10 && <p className="mt-2 text-xs text-ink/40">Showing top 10 of {itemProfitability.length} items.</p>}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">Estimates by status</h3>
        {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-ink/40">No estimates yet.</p>
          : <ul className="space-y-2">{Object.entries(statusCounts).map(([s, c]) => (<li key={s} className="flex items-center justify-between text-sm"><Badge status={s} /><span className="font-semibold text-ink/80">{c}</span></li>))}</ul>}
      </Card>
      <Card><p className="text-xs font-semibold text-ink/40">Total Customers</p><p className="mt-1 font-display text-xl font-bold text-ink">{customers.length}</p></Card>

      {/* Search by name */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-brand-500" /><h3 className="font-display text-base font-bold text-ink">Search estimates by customer name</h3></div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Type customer name..." className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        {trimmedName && (
          <div className="mt-3">
            {nameMatchedInvoices.length === 0
              ? <p className="text-sm text-ink/40">{nameMatchedCustomers.length === 0 ? `No customer matching "${nameQuery}".` : "Customer found but no estimates yet."}</p>
              : <ul className="divide-y divide-line">
                {nameMatchedInvoices.map((inv: any) => {
                  const c = customers.find((cu: any) => cu.id === inv.customerId);
                  return (<li key={inv.id} className="py-3"><div className="flex items-start justify-between"><div><p className="font-semibold text-ink">{inv.number}</p><p className="text-xs text-ink/50">{c?.name} · {fmtDate(inv.date)}</p>{c?.location && <p className="flex items-center gap-1 text-xs text-ink/40"><MapPin size={10} /> {c.location}</p>}</div><div className="text-right"><p className="font-bold text-ink">{fmtMoney(inv.total, currency)}</p><Badge status={inv.status} /></div></div></li>);
                })}
              </ul>
            }
          </div>
        )}
      </Card>

      {/* Search by location */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><MapPin size={16} className="text-advance-500" /><h3 className="font-display text-base font-bold text-ink">Search customers by location</h3></div>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="Type city, area or address..." className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-advance-400" />
        </div>
        {trimmedLoc && (
          <div className="mt-3">
            {locationMatchedCustomers.length === 0
              ? <p className="text-sm text-ink/40">No customers at "{locationQuery}".</p>
              : <ul className="divide-y divide-line">
                {locationMatchedCustomers.map((c: any) => {
                  const custInvoices = invoices.filter((inv: any) => inv.customerId === c.id);
                  const custTotal = custInvoices.reduce((s: number, inv: any) => s + inv.total, 0);
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-start justify-between">
                        <div><p className="font-semibold text-ink">{c.name}</p><p className="flex items-center gap-1 text-xs text-ink/40 mt-0.5"><MapPin size={10} /> {c.location}</p>{c.phone && <p className="text-xs text-ink/40">{c.phone}</p>}</div>
                        <div className="text-right"><p className="text-xs text-ink/40">{custInvoices.length} estimate{custInvoices.length !== 1 ? "s" : ""}</p><p className="font-bold text-ink">{fmtMoney(custTotal, currency)}</p></div>
                      </div>
                      {custInvoices.length > 0 && <ul className="mt-2 space-y-1 pl-2 border-l-2 border-line">{custInvoices.map((inv: any) => (<li key={inv.id} className="flex items-center justify-between text-xs text-ink/50"><span>{inv.number} · {fmtDate(inv.date)}</span><span className="flex items-center gap-2">{fmtMoney(inv.total, currency)}<Badge status={inv.status} /></span></li>))}</ul>}
                    </li>
                  );
                })}
              </ul>
            }
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---- Share Report ---- */

function ShareReportView({ invoices, items, customers, currency, settings }: any) {
  const todayStr = today();

  const todayInvoices = invoices.filter((inv: any) => inv.date === todayStr);

  // Aggregate qty + amount per item across today's invoices
  const itemMap: Record<string, { name: string; qty: number; amount: number }> = {};
  todayInvoices.forEach((inv: any) => {
    (inv.lines || []).forEach((ln: any) => {
      const it = items.find((x: any) => x.id === ln.itemId);
      if (!it) return;
      if (!itemMap[it.id]) itemMap[it.id] = { name: it.name, qty: 0, amount: 0 };
      const qty = Number(ln.qty) || 0;
      itemMap[it.id].qty += qty;
      itemMap[it.id].amount += qty * (ln.rate ?? it.sellingPrice ?? it.price ?? 0);
    });
  });

  const rows = Object.values(itemMap);
  const totalSales = todayInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
  const totalInvoices = todayInvoices.length;

  const buildReport = () => {
    const lines = [
      `📊 *Daily Sales Report — ${fmtDate(todayStr)}*`,
      `🏢 ${settings.orgName}`,
      ``,
      `📦 *Items Sold Today:*`,
      ...rows.map((r) => `  • ${r.name}: ${r.qty} unit(s) — ${currency}${r.amount.toFixed(2)}`),
      ``,
      `🧾 Estimates raised: ${totalInvoices}`,
      `💰 *Total Sales: ${currency}${totalSales.toFixed(2)}*`,
    ];
    return lines.join("\n");
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(buildReport());
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareSMS = () => {
    const text = encodeURIComponent(buildReport());
    window.open(`sms:?body=${text}`, "_blank");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {}).catch(() => {});
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center"><Send size={18} className="text-brand-600" /></div>
          <div>
            <h3 className="font-bold text-ink">Daily Sales Report</h3>
            <p className="text-xs text-ink/40">{fmtDate(todayStr)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-paper px-4 py-6 text-center">
            <p className="text-sm text-ink/40">No estimates created today yet.</p>
            <p className="text-xs text-ink/30 mt-1">Create an estimate and it will appear here.</p>
          </div>
        ) : (
          <>
            {/* Item breakdown table */}
            <div className="rounded-xl overflow-hidden border border-line">
              <div className="grid grid-cols-3 bg-paper px-4 py-2 text-xs font-semibold text-ink/50">
                <span>Item</span><span className="text-center">Qty</span><span className="text-right">Amount</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className={`grid grid-cols-3 px-4 py-2.5 text-sm ${i % 2 === 0 ? "bg-white" : "bg-paper"}`}>
                  <span className="font-medium text-ink truncate">{r.name}</span>
                  <span className="text-center text-ink/70">{r.qty}</span>
                  <span className="text-right font-semibold text-ink">{currency}{r.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-between items-center rounded-xl bg-brand-600 px-4 py-3">
              <div>
                <p className="text-xs text-ink/40">{totalInvoices} invoice{totalInvoices !== 1 ? "s" : ""} today</p>
                <p className="text-sm font-bold text-white">Total Sales</p>
              </div>
              <p className="font-display text-xl font-bold text-good-400">{currency}{totalSales.toFixed(2)}</p>
            </div>
          </>
        )}
      </Card>

      {/* Share buttons */}
      <Card>
        <h3 className="text-sm font-bold text-ink/80 mb-3">Share this report</h3>
        <div className="flex flex-col gap-2">
          <button onClick={shareWhatsApp}
            className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition"
            style={{ backgroundColor: "#25D366" }}>
            <Phone size={18} />Share via WhatsApp
          </button>
          <button onClick={shareSMS}
            className="flex items-center gap-3 w-full rounded-xl bg-advance-500 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
            <MessageSquare size={18} />Share via SMS
          </button>
          <button onClick={copyToClipboard}
            className="flex items-center gap-3 w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink/80 hover:bg-paper active:scale-[0.98] transition">
            <CheckCircle2 size={18} className="text-ink/40" />Copy to Clipboard
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---- Advanced Billing ---- */

function AdvancedBillingView({ autoReminder, setAutoReminder, overdueCount, settings }: any) {
  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">WhatsApp payment reminders</h3>
            <p className="mt-1 text-sm text-ink/40">Show a banner for overdue estimates with one-tap WhatsApp messaging.</p>
          </div>
          <button onClick={() => setAutoReminder((v: boolean) => !v)} className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition ${autoReminder ? "bg-good-500" : "bg-paper"}`}>
            <span className={`block h-6 w-6 rounded-full bg-white transition ${autoReminder ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {autoReminder && <p className="mt-3 rounded-xl bg-good-50 px-3 py-2 text-xs font-semibold text-good-700">Enabled — {overdueCount} overdue estimate{overdueCount !== 1 ? "s" : ""} will be flagged.</p>}
      </Card>
      <Card>
        <h3 className="font-display text-base font-bold text-ink">Recurring estimates</h3>
        <p className="mt-1 text-sm text-ink/40">Set up retainer or subscription billing.</p>
        <EmptyState text="No recurring profiles yet." />
      </Card>
      <Card>
        <h3 className="font-display text-base font-bold text-ink">Business WhatsApp number</h3>
        <p className="mt-1 text-sm text-ink/40">{settings.businessWhatsApp ? `Connected: ${settings.businessWhatsApp}` : "Not set — add one in Settings."}</p>
      </Card>
    </div>
  );
}

/* ---- Settings ---- */

function ChangePinCard() {
  const [mode, setMode] = useState<"idle"|"current"|"new"|"confirm">("idle");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [saving, setSaving] = useState(false);
  const MAX = 4;

  const inputCls = "w-full rounded-xl border border-line px-3 py-2.5 text-sm tracking-[0.4em] text-center font-bold";

  const handleCurrent = () => {
    if (cur.length < MAX) return;
    setMsg(null); setMode("new");
  };
  const handleNew = () => {
    if (next.length < MAX) return;
    setMsg(null); setMode("confirm");
  };
  const handleConfirm = async (val: string) => {
    if (val.length < MAX) return;
    if (val !== next) { setMsg({ text: "PINs don't match. Try again.", ok: false }); setNext(""); setMode("new"); return; }
    setSaving(true);
    try {
      await api.auth.changePin(cur, val);
      setMsg({ text: "PIN changed successfully!", ok: true });
      setCur(""); setNext(""); setMode("idle");
    } catch (err: any) {
      setMsg({ text: err?.message || "Current PIN is incorrect.", ok: false });
      setCur(""); setNext(""); setMode("current");
    } finally {
      setSaving(false);
    }
  };

  const numOnly = (v: string) => v.replace(/\D/g, "").slice(0, MAX);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-paper flex items-center justify-center"><SettingsIcon size={14} className="text-ink/70" /></div>
        <h3 className="text-sm font-bold text-ink">Change PIN</h3>
      </div>
      {msg && <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-good-50 text-good-700" : "bg-bad-50 text-bad-600"}`}>{msg.text}</p>}

      {mode === "idle" && (
        <button onClick={() => { setMode("current"); setMsg(null); }}
          className="w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-ink/80 hover:bg-paper transition">
          Change my PIN
        </button>
      )}
      {mode === "current" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Enter current PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={cur} onChange={(e) => setCur(numOnly(e.target.value))} placeholder="••••" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={cur.length < MAX} onClick={handleCurrent} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Enter new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={next} onChange={(e) => setNext(numOnly(e.target.value))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={next.length < MAX} onClick={handleNew} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Confirm new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} placeholder="••••" className={inputCls} autoFocus
            onChange={(e) => { const v = numOnly(e.target.value); if (v.length === MAX) handleConfirm(v); }} />
          <button onClick={() => setMode("idle")} className="w-full rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
        </div>
      )}
    </Card>
  );
}

function SettingsView({ settings, setSettings }: any) {
  const [local, setLocal] = useState(settings);
  const set = (k: string, v: any) => setLocal((s: any) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);
  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-4">
        {[["orgName","Organization name","Acme Ltd."],["ownerName","Your name",""],["email","Address / Email","Address or email"]].map(([k,l,p]) => (
          <div key={k}><label className="mb-1 block text-xs font-semibold text-ink/50">{l}</label>
          <input value={(local as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={p} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" /></div>
        ))}
        <div><label className="mb-1 block text-xs font-semibold text-ink/50">Currency symbol</label>
        <select value={local.currency} onChange={(e) => set("currency", e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
          {["₹","$","€","£"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Phone size={16} style={{ color: WHATSAPP_GREEN }} /><h3 className="text-sm font-bold text-ink">WhatsApp integration</h3></div>
        <div><label className="mb-1 block text-xs font-semibold text-ink/50">Business WhatsApp number (with country code)</label>
        <input value={local.businessWhatsApp} onChange={(e) => set("businessWhatsApp", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" /></div>
      </Card>
      <ChangePinCard />
      <PillButton disabled={!dirty} onClick={() => setSettings(local)} className="w-full justify-center">Save changes</PillButton>
    </div>
  );
}

/* ---- Main App ---- */

/* ---- PIN Screen ---- */

const PIN_KEY = "invoice_app_pin";
// Session is tracked in React state only — clears on every page load/refresh

function PinScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const storedPin = localStorage.getItem(PIN_KEY);
  const isSetup = !storedPin;

  const [phase, setPhase] = useState<"enter" | "setup" | "confirm">(isSetup ? "setup" : "enter");
  const [pin, setPin] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const MAX = 4;

  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    setPin("");
    setTimeout(() => setShake(false), 500);
  };

  const handleDigit = (d: string) => {
    if (pin.length >= MAX) return;
    const next = pin + d;
    setPin(next);
    setError("");

    if (next.length === MAX) {
      setTimeout(() => {
        if (phase === "enter") {
          if (next === localStorage.getItem(PIN_KEY)) {
            onUnlocked();
          } else {
            triggerShake("Incorrect PIN. Try again.");
          }
        } else if (phase === "setup") {
          setSetupPin(next);
          setPin("");
          setPhase("confirm");
        } else if (phase === "confirm") {
          if (next === setupPin) {
            localStorage.setItem(PIN_KEY, next);
            onUnlocked();
          } else {
            triggerShake("PINs don't match. Start again.");
            setSetupPin("");
            setPhase("setup");
          }
        }
      }, 120);
    }
  };

  const handleDelete = () => { setPin((p) => p.slice(0, -1)); setError(""); };

  const dots = Array.from({ length: MAX }, (_, i) => i < pin.length);
  const phaseLabel = phase === "setup" ? "Set a 4-digit PIN" : phase === "confirm" ? "Confirm your PIN" : "Enter your PIN";
  const phaseHint  = phase === "setup" ? "You'll enter this every time you open the app." : phase === "confirm" ? "Re-enter the same PIN to confirm." : "";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-900 select-none">
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">
        {/* Icon + title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg">
            <ShoppingBag size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{phaseLabel}</h1>
          {phaseHint && <p className="text-sm text-ink/40 text-center">{phaseHint}</p>}
        </div>

        {/* PIN dots */}
        <div className={`flex gap-4 transition-transform ${shake ? "animate-[shake_0.4s_ease]" : ""}`}>
          {dots.map((filled, i) => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${filled ? "bg-brand-400 border-brand-400 scale-110" : "border-ink/30"}`} />
          ))}
        </div>

        {/* Error */}
        {error && <p className="text-sm font-semibold text-bad-400 -mt-4 text-center">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => {
            if (k === "") return <div key={i} />;
            const isDelete = k === "⌫";
            return (
              <button
                key={k + i}
                onClick={() => isDelete ? handleDelete() : handleDigit(k)}
                className={`h-16 rounded-2xl text-xl font-semibold transition active:scale-95 ${
                  isDelete
                    ? "bg-ink/20 text-ink/30 hover:bg-ink/20"
                    : "bg-ink/20 text-white hover:bg-ink/20"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>

        {/* Reset link (only on enter phase) */}
        {phase === "enter" && (
          <button
            onClick={() => { localStorage.removeItem(PIN_KEY); setPhase("setup"); setPin(""); setError(""); }}
            className="text-xs text-ink/50 hover:text-ink/30 transition mt-2"
          >
            Forgot PIN? Reset
          </button>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
      `}</style>
    </div>
  );
}

function InvoiceApp({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<any>(null);
  const [shareInvoice, setShareInvoice] = useState<any>(null);
  const [printSide, setPrintSide] = useState<"left" | "right">(() => (localStorage.getItem("sbt_print_side") === "right" ? "right" : "left"));
  const togglePrintSide = () => setPrintSide((s) => { const next = s === "left" ? "right" : "left"; localStorage.setItem("sbt_print_side", next); return next; });
  const [toast, setToast] = useState<string | null>(null);
  const [autoReminder, setAutoReminder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [settings, setSettings] = useState({
    orgName: "SHREE BALAJI TRADERS", ownerName: "SBT", email: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI", currency: "₹", businessWhatsApp: "",
  });

  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [labourSessions, setLabourSessions] = useState<any[]>([]);
  const [labourWorkers, setLabourWorkers] = useState<string[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const closeModal = () => setModal(null);
  const nextNumber = (list: any[], prefix: string) => `${prefix}-${String(list.length + 1).padStart(4, "0")}`;

  /* ---- initial load from backend ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, it, o, est, ch, ex, pay, st, ls, lw] = await Promise.all([
          api.customers.list(),
          api.items.list(),
          api.orders.list(),
          api.documents("estimate").list(),
          api.documents("challan").list(),
          api.expenses.list(),
          api.payments.list(),
          api.settings.get(),
          api.labourSessions.list(),
          api.labourSessions.workers(),
        ]);
        if (cancelled) return;
        setCustomers(c); setItems(it); setOrders(o); setEstimates(est);
        setChallans(ch); setExpenses(ex); setPayments(pay);
        setLabourSessions(ls); setLabourWorkers(lw);
        setSettings((prev) => ({ ...prev, ...st }));
      } catch (err: any) {
        if (!cancelled) {
          if (err?.status === 401) { onSignOut(); return; }
          setLoadError(err.message || "Failed to load your data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- handlers (all persist to the backend, then sync local state from the response) ---- */

  const onApiError = (err: any, fallback: string) => {
    if (err?.status === 401) { onSignOut(); return; }
    showToast(err?.message || fallback);
  };

  const saveCustomer = async (v: any) => {
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const normPhone = (s: string) => (s || "").replace(/\D/g, "");
    const isDuplicate = customers.some((c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone));
    if (isDuplicate) { showToast("A customer with this name and phone number already exists"); return; }
    try {
      const { locationLat, locationLng, ...rest } = v;
      const payload = { ...rest, ...(locationLat != null ? { lat: locationLat } : {}), ...(locationLng != null ? { lng: locationLng } : {}) };
      const doc = await api.customers.create(payload);
      setCustomers((c) => [doc, ...c]);
      showToast("Customer added");
      closeModal();
    } catch (err) { onApiError(err, "Failed to add customer"); }
  };

  const removeCustomer = async (id: string) => {
    try { await api.customers.remove(id); setCustomers((c) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete customer"); }
  };

  const saveChallan = async (v: any) => {
    try {
      const { doc } = await api.documents("challan").create(v);
      setChallans((c) => [doc, ...c]);
      showToast("Challan saved");
      closeModal();
    } catch (err) { onApiError(err, "Failed to save challan"); }
  };

  const saveItem = async (v: any) => {
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const isDuplicate = items.some((it) => it.id !== v.id && normName(it.name) === normName(v.name));
    if (isDuplicate) { showToast("An item with this name already exists"); return; }
    try {
      if (v.id) {
        const { id, ...rest } = v;
        const doc = await api.items.update(id, rest);
        setItems((c) => c.map((x) => (x.id === id ? doc : x)));
        showToast("Item updated");
      } else {
        const doc = await api.items.create(v);
        setItems((c) => [doc, ...c]);
        showToast("Item added");
      }
      closeModal();
    } catch (err) { onApiError(err, "Failed to save item"); }
  };

  const removeItem = async (id: string) => {
    try { await api.items.remove(id); setItems((c) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete item"); }
  };

  const saveExpense = async (v: any) => {
    try {
      const doc = await api.expenses.create({ category: v.category, vendor: v.vendor, amount: Number(v.amount), date: v.date || today() });
      setExpenses((c) => [doc, ...c]);
      showToast("Expense recorded");
      closeModal();
    } catch (err) { onApiError(err, "Failed to record expense"); }
  };

  const removeExpense = async (id: string) => {
    try { await api.expenses.remove(id); setExpenses((c) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete expense"); }
  };

  const docSetter = (type: string) => (type === "estimate" ? setEstimates : setChallans);

  const saveDocument = async (type: string, v: any) => {
    try {
      const payload: any = { customerId: v.customerId, date: v.date, dueDate: v.dueDate, lines: v.lines, notes: v.notes, total: v.total };
      if (type === "estimate") {
        payload.freightCost = v.freightCost || 0;
        payload.labourCost = v.labourCost || 0;
        payload.previousDue = v.previousDue || 0;
        payload.rolledEstimateIds = v.rolledEstimateIds || [];
        payload.contractorName = v.contractorName || "";
        payload.destination = v.destination || "";
        if (v.status) payload.status = v.status; // Due/Paid choice from the confirmation popup, create-only
        if (v.isAdvanceBooking) payload.isAdvanceBooking = true; // only true when "Advance Booking" was picked in that popup
      }

      if (v.id) {
        // editing an existing document — update in place, don't touch stock or status
        const doc = await api.documents(type as any).update(v.id, payload);
        docSetter(type)((l: any[]) => l.map((x: any) => (x.id === v.id ? doc : x)));
        showToast(`${doc.number} updated`);
        closeModal();
        return;
      }

      const { doc, lowStock } = await api.documents(type as any).create(payload);
      docSetter(type)((l: any[]) => [doc, ...l]);

      if (type === "estimate") {
        if (v.rolledEstimateIds && v.rolledEstimateIds.length) {
          setEstimates((l) => l.map((e) => (v.rolledEstimateIds.includes(e.id) ? { ...e, status: "Paid" } : e)));
        }
        /* stock was deducted server-side — pull the fresh numbers */
        const freshItems = await api.items.list();
        setItems(freshItems);
        if (lowStock && lowStock.length > 0) {
          showToast(`⚠️ Low stock: ${lowStock.map((i: any) => `${i.name} (${i.stock} left)`).join(", ")}`);
        } else {
          showToast(`${doc.number} created`);
        }
      } else {
        showToast(`${doc.number} created`);
      }
      closeModal();
    } catch (err) { onApiError(err, "Failed to save document"); }
  };

  const removeDoc = (type: string) => async (id: string) => {
    try { await api.documents(type as any).remove(id); docSetter(type)((c: any[]) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete"); }
  };

  const updateDocStatus = (type: string) => async (id: string, s: string) => {
    try {
      const doc = await api.documents(type as any).updateStatus(id, s);
      docSetter(type)((list: any[]) => list.map((x) => (x.id === id ? doc : x)));
    } catch (err) { onApiError(err, "Failed to update status"); }
  };

  const savePayment = async (v: any) => {
    try {
      const { payment, invoice } = await api.payments.create(v);
      setPayments((p) => [payment, ...p]);
      if (invoice) setEstimates((list) => list.map((i) => (i.id === invoice.id ? invoice : i)));
      showToast(invoice?.status === "Paid" ? "Payment recorded — estimate fully paid" : invoice?.status === "Partially Paid" ? "Partial payment recorded" : "Payment recorded");
      closeModal();
    } catch (err) { onApiError(err, "Failed to record payment"); }
  };

  const saveReturn = async (docId: string, lines: { itemId: string; qty: number }[]) => {
    try {
      const { doc, payment, items: freshItems } = await api.documents("estimate").addReturn(docId, lines);
      setEstimates((list) => list.map((e) => (e.id === docId ? doc : e)));
      setItems(freshItems);
      setPayments((p) => [payment, ...p]);
      showToast(`Refund of ${fmtMoney(Math.abs(payment.amount), settings.currency)} recorded, stock updated`);
      closeModal();
    } catch (err) { onApiError(err, "Failed to record return"); }
  };

  const saveDelivery = async (docId: string, lines: { itemId: string; qty: number }[]) => {
    try {
      const { doc } = await api.documents("estimate").addDelivery(docId, lines);
      setEstimates((list) => list.map((e) => (e.id === docId ? doc : e)));
      const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
      showToast(`Collection recorded: ${totalQty} item${totalQty !== 1 ? "s" : ""} taken`);
      closeModal();
    } catch (err) { onApiError(err, "Failed to record collection"); }
  };

  const removePayment = async (id: string) => {
    try {
      const { invoice } = await api.payments.remove(id);
      setPayments((c) => c.filter((x) => x.id !== id));
      if (invoice) setEstimates((list) => list.map((i) => (i.id === invoice.id ? invoice : i)));
    } catch (err) { onApiError(err, "Failed to delete payment"); }
  };

  const saveOrder = async (v: any) => {
    try {
      const doc = await api.orders.create({ itemId: v.itemId, qty: v.qty, date: v.date, notes: v.notes });
      setOrders((o) => [doc, ...o]);
      showToast("Order placed");
      closeModal();
    } catch (err) { onApiError(err, "Failed to place order"); }
  };

  const removeOrder = async (id: string) => {
    try { await api.orders.remove(id); setOrders((c) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete order"); }
  };

  const markOrderReceived = async (orderId: string) => {
    try {
      const { order, item } = await api.orders.receive(orderId);
      setOrders((list) => list.map((o) => (o.id === orderId ? order : o)));
      setItems((list) => list.map((it) => (it.id === item.id ? item : it)));
      showToast(`Stock updated: +${order.qty} added`);
    } catch (err) { onApiError(err, "Failed to update order"); }
  };

  const openModal = (type: string, payload?: any) => setModal({ type, payload });
  const recordPaymentFor = (invoice: any) => openModal("payment", { invoiceId: invoice.id, customerId: invoice.customerId, amount: Number(invoice.total || 0) - Number(invoice.amountPaid || 0) });

  const saveLabourSession = async (v: any) => {
    try {
      const session = await api.labourSessions.create(v);
      setLabourSessions((l) => [session, ...l]);
      const newNames = (v.workers || []).filter((n: string) => !labourWorkers.includes(n));
      if (newNames.length) setLabourWorkers((w) => [...w, ...newNames].sort());
      showToast("Session saved");
    } catch (err) { onApiError(err, "Failed to save session"); }
  };
  const removeLabourSession = async (id: string) => {
    try { await api.labourSessions.remove(id); setLabourSessions((l) => l.filter((s) => s.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete session"); }
  };

  const printEstimate = (invoice: any) => {
    const customer = customers.find((c) => c.id === invoice.customerId);
    const lines = invoice.lines || [];
    const COMPACT_MAX_LINES = 12; // beyond this, a quarter-strip can't stay readable — use a fresh full page instead
    const compact = lines.length <= COMPACT_MAX_LINES;
    const rowFont = lines.length <= 4 ? 8.5 : lines.length <= 8 ? 7.5 : 6.5;

    const rowsHtml = lines.map((ln: any) => {
      const it = items.find((i) => i.id === ln.itemId);
      const name = it?.name || "Item";
      const qty = Number(ln.qty || 0);
      const rate = ln.rate ?? it?.price ?? 0;
      const amount = qty * rate;
      return `<div class="ln"><span class="ln-name">${name} × ${qty}</span><span class="ln-amt">${fmtMoney(amount, settings.currency)}</span></div>`;
    }).join("");

    const extrasHtml = [
      Number(invoice.freightCost || 0) > 0 ? `<div class="ln"><span>Freight</span><span>${fmtMoney(invoice.freightCost, settings.currency)}</span></div>` : "",
      Number(invoice.labourCost || 0) > 0 ? `<div class="ln"><span>Labour</span><span>${fmtMoney(invoice.labourCost, settings.currency)}</span></div>` : "",
      Number(invoice.previousDue || 0) > 0 ? `<div class="ln"><span>Previous due</span><span>${fmtMoney(invoice.previousDue, settings.currency)}</span></div>` : "",
    ].join("");

    const statusNote = invoice.isAdvanceBooking
      ? "Advance Booked"
      : invoice.status === "Paid"
      ? "Paid"
      : "Due";

    const notesHtml = invoice.notes ? `<div class="notes">${invoice.notes}</div>` : "";

    const bodyHtml = `
      <div class="hd"><span class="name">${customer?.name || "Customer"}</span><span class="doc">${fmtDate(invoice.date)}</span></div>
      <div class="place">${customer?.location || ""}</div>
      <div class="divider"></div>
      <div class="lines">${rowsHtml}${extrasHtml}</div>
      <div class="tot"><span>Total</span><span>${fmtMoney(invoice.total, settings.currency)}</span></div>
      ${notesHtml}
      <div class="stat">${statusNote}</div>
    `;

    const w = window.open("", "_blank", "width=480,height=680");
    if (!w) { showToast("Please allow pop-ups to print."); return; }
    w.document.write(`<!doctype html><html><head><title>${invoice.number}</title><style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
      .box {
        position: absolute; top: 6mm; ${compact ? (printSide === "left" ? "left: 6mm;" : "left: 111mm;") : "left: 10mm; right: 10mm;"}
        width: ${compact ? "93mm" : "auto"};
        padding: ${compact ? "3mm" : "8mm"};
        border: 0.25mm dashed #cbd5e1;
      }
      .hd { display: flex; justify-content: space-between; align-items: baseline; }
      .name { font-weight: 700; font-size: ${compact ? "8px" : "13px"}; }
      .doc { font-weight: 700; font-size: ${compact ? "8px" : "13px"}; }
      .place { font-size: ${compact ? "8px" : "13px"}; color: #64748b; margin-top: ${compact ? "0.3mm" : "0.5mm"}; }
      .divider { border-bottom: 0.3mm solid #0f172a; margin: ${compact ? "1.5mm 0" : "3mm 0"}; }
      .lines { }
      .ln { display: flex; justify-content: space-between; font-size: ${compact ? rowFont + "px" : "12px"}; padding: ${compact ? "0.4mm 0" : "1.5mm 0"}; border-bottom: 0.15mm dotted #e2e8f0; }
      .tot { display: flex; justify-content: space-between; font-weight: 700; font-size: ${compact ? "8.5px" : "14px"}; border-top: 0.3mm solid #0f172a; margin-top: ${compact ? "1mm" : "2mm"}; padding-top: ${compact ? "1mm" : "2mm"}; }
      .notes { font-size: ${compact ? "6.5px" : "10px"}; color: #475569; margin-top: ${compact ? "1mm" : "2mm"}; font-style: italic; word-break: break-word; }
      .stat { text-align: right; font-size: ${compact ? "6.5px" : "10px"}; color: #d97706; margin-top: ${compact ? "0.5mm" : "1.5mm"}; font-weight: 700; }
    </style></head><body><div class="box">${bodyHtml}</div></body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    if (compact) togglePrintSide();
  };

  const saveSettings = async (s: any) => {
    try {
      const doc = await api.settings.update(s);
      setSettings((prev) => ({ ...prev, ...doc }));
      showToast("Settings saved");
    } catch (err) { onApiError(err, "Failed to save settings"); }
  };

  const overdueCount = estimates.filter((i) => i.status === "Due" && i.dueDate && new Date(i.dueDate) < new Date()).length;
  const data = { customers, items, orders, estimates, invoices: estimates, challans, expenses, payments, labourSessions };

  /* ---- view renderer ---- */
  const renderView = () => {
    switch (view) {
      case "dashboard": return <Dashboard data={data} settings={settings} openModal={openModal} go={setView} />;
      case "customers": return <CustomersView customers={customers} estimates={estimates} openModal={openModal} removeCustomer={removeCustomer}
        onSelectCustomer={(id: string) => { setSelectedCustomerId(id); setView("customerDetail"); }} />;
      case "customerDetail": return <CustomerDetailView
        customer={customers.find((c: any) => c.id === selectedCustomerId)}
        estimates={estimates} payments={payments} items={items} openModal={openModal} currency={settings.currency}
        onBack={() => setView("customers")} />;
      case "items":     return <ItemsView items={items} openModal={openModal} currency={settings.currency} removeItem={removeItem} />;
      case "orders":    return <OrdersView orders={orders} items={items} openModal={openModal} markOrderReceived={markOrderReceived} removeOrder={removeOrder} />;
      case "challans":  return <DocumentList type="challan" docs={challans} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={removeDoc("challan")} updateStatus={updateDocStatus("challan")} />;
      case "estimates":  return (
        <div className="px-5 pt-1">
          {autoReminder && overdueCount > 0 && <div className="mb-3 rounded-2xl bg-warn-50 px-4 py-3 text-sm font-semibold text-warn-700 flex items-center gap-2"><AlertCircle size={16} /> {overdueCount} estimate{overdueCount !== 1 ? "s" : ""} overdue.</div>}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-paper px-4 py-2.5 text-xs text-ink/50">
            <span>Next print → <b className="text-ink/80">top-{printSide}</b> corner</span>
            <button onClick={togglePrintSide} className="font-semibold text-brand-600">Switch side ⇄</button>
          </div>
          <div className="-mx-5">
            <DocumentList type="estimate" docs={estimates} customers={customers} items={items} currency={settings.currency} openModal={openModal}
              removeDoc={removeDoc("estimate")}
              updateStatus={updateDocStatus("estimate")}
              recordPayment={recordPaymentFor} onReturn={(doc: any) => openModal("return", { doc })} onDeliver={(doc: any) => openModal("delivery", { doc })} onShareInvoice={(inv: any) => setShareInvoice(inv)}
              onPrint={printEstimate}
              onView={(doc: any) => openModal("viewEstimate", { doc })} />
          </div>
        </div>
      );
      case "payments":  return <PaymentsView payments={payments} customers={customers} currency={settings.currency} openModal={openModal} removePayment={removePayment} />;
      case "expenses":  return <ExpensesView expenses={expenses} currency={settings.currency} openModal={openModal} removeExpense={removeExpense} />;
      case "todo":      return <ToDoTrackingView items={items} settings={settings} openModal={openModal} />;
      case "labour":    return <LabourTrackingView sessions={labourSessions} knownWorkers={labourWorkers} onSave={saveLabourSession} onRemove={removeLabourSession} currency={settings.currency} />;
      case "contractors": return <ContractorScorecardView estimates={estimates} items={items} currency={settings.currency} />;
      case "reports":      return <ReportsView data={data} currency={settings.currency} settings={settings} />;
      case "sharereport":  return <ShareReportView invoices={estimates} items={items} customers={customers} currency={settings.currency} settings={settings} />;
      case "billing":      return <AdvancedBillingView autoReminder={autoReminder} setAutoReminder={setAutoReminder} overdueCount={overdueCount} settings={settings} />;
      case "settings":  return <SettingsView settings={settings} setSettings={saveSettings} />;
      default: return null;
    }
  };

  /* ---- modal renderer ---- */
  const renderModal = () => {
    if (!modal) return null;
    const { type, payload } = modal;
    if (type === "viewEstimate") return <ViewEstimateModal doc={payload?.doc} customers={customers} items={items} currency={settings.currency} onClose={closeModal} />;

    if (type === "customer") return <FieldModal title="New Customer" fields={[
      { key: "name",     label: "Customer name",                     required: true, placeholder: "Acme Co." },
      { key: "email",    label: "Email",                             placeholder: "name@example.com" },
      { key: "phone",    label: "Phone (with country code)",         placeholder: "+91 98765 43210" },
      { key: "location", label: "Location / Address",                type: "location", placeholder: "City, area or full address" },
    ]} onClose={closeModal} onSave={saveCustomer} />;

    if (type === "item") {
      const editingItem = payload?.editingItem;
      return <FieldModal title={editingItem ? "Edit Item" : "New Item"} fields={[
        { key: "name",          label: "Item name",           required: true, placeholder: "Web design service" },
        { key: "category",      label: "Category",            type: "select", options: ITEM_CATEGORIES.map((c) => ({ value: c, label: c })), required: true },
        { key: "sellingPrice",  label: "Selling price",       type: "number", required: true, placeholder: "0.00" },
        { key: "purchasePrice", label: "Purchase price",      type: "number", placeholder: "0.00" },
        { key: "unit",          label: "Unit",                placeholder: "hr / pc / job" },
        { key: "stock",         label: editingItem ? "Stock (qty)" : "Opening stock (qty)", type: "number", placeholder: "0" },
        { key: "lowStock",      label: "Low stock alert at",  type: "number", placeholder: `${LOW_STOCK_DEFAULT}` },
      ]} initial={editingItem ? {
        id: editingItem.id, name: editingItem.name, category: editingItem.category || "Others",
        sellingPrice: editingItem.sellingPrice ?? editingItem.price, purchasePrice: editingItem.purchasePrice,
        unit: editingItem.unit, stock: editingItem.stock, lowStock: editingItem.lowStock ?? LOW_STOCK_DEFAULT,
      } : { category: "Others" }} onClose={closeModal} onSave={saveItem} />;
    }

    if (type === "expense") return <FieldModal title="Record Expense" fields={[
      { key: "category", label: "Category", required: true, placeholder: "Travel, Software..." },
      { key: "vendor",   label: "Vendor",   placeholder: "Optional" },
      { key: "amount",   label: "Amount",   type: "number", required: true, placeholder: "0.00" },
      { key: "date",     label: "Date",     type: "date" },
    ]} initial={{ date: today() }} onClose={closeModal} onSave={saveExpense} />;

    if (type === "order") return <OrderModal items={items} onClose={closeModal} onSave={saveOrder} prefill={payload} />;

    if (type === "challan")
      return <ChallanModal onClose={closeModal} onSave={saveChallan} />;

    if (type === "estimate")
      return <DocumentModal type={type} customers={customers} items={items} estimates={estimates} editingDoc={payload?.editingDoc} onClose={closeModal} onSave={(v: any) => saveDocument(type, v)} />;

    if (type === "payment") {
      const invoiceOptions = estimates.filter((i) => i.status !== "Paid").map((i) => ({ value: i.id, label: `${i.number} — ${fmtMoney(Number(i.total || 0) - Number(i.amountPaid || 0), settings.currency)} due` }));
      const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
      return <FieldModal title="Record Payment" fields={[
        { key: "customerId", label: "Customer", type: "select", options: customerOptions, required: true },
        { key: "invoiceId",  label: "Against estimate", type: "select", options: [{ value: "", label: "No specific estimate" }, ...invoiceOptions] },
        { key: "amount",     label: "Amount",  type: "number", required: true },
        { key: "method",     label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",       label: "Date",    type: "date" },
      ]} initial={{ date: today(), customerId: payload?.customerId || "", invoiceId: payload?.invoiceId || "", amount: payload?.amount || "" }} onClose={closeModal} onSave={savePayment} />;
    }

    if (type === "return") {
      return <ReturnModal doc={payload?.doc} items={items} currency={settings.currency} onClose={closeModal}
        onSave={(lines: { itemId: string; qty: number }[]) => saveReturn(payload?.doc?.id, lines)} />;
    }
    if (type === "delivery") {
      return <DeliveryModal doc={payload?.doc} items={items} onClose={closeModal}
        onSave={(lines: { itemId: string; qty: number }[]) => saveDelivery(payload?.doc?.id, lines)} />;
    }
    return null;
  };

  const businessWa = settings.businessWhatsApp;
  const shareCustomer = shareInvoice ? customers.find((c) => c.id === shareInvoice.customerId) : null;
  const sharePayment = shareInvoice ? payments.find((p) => p.invoiceId === shareInvoice.id) : null;

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-paper text-ink/50">
        <Loader2 size={28} className="animate-spin text-brand-500" />
        <p className="text-sm font-medium">Loading your data…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
        <AlertCircle size={28} className="text-bad-500" />
        <p className="text-sm font-medium text-ink/70">{loadError}</p>
        <button onClick={() => window.location.reload()} className="rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          Try again
        </button>
        <button onClick={onSignOut} className="text-xs font-medium text-ink/50">Sign out</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-paper font-sans text-ink">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} active={view} onNav={setView} settings={settings} onSignOut={onSignOut} />
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        <Topbar onMenu={() => setSidebarOpen(true)} settings={settings} view={view} onOpenSearch={() => setGlobalSearchOpen(true)} />
        {renderView()}
      </div>

      <BottomNav
        active={view}
        onNav={setView}
        onMore={() => setSidebarOpen(true)}
        onQuickAction={(key: string) => openModal(key === "customer" ? "customer" : key === "expense" ? "expense" : "estimate")}
      />

      <a href={businessWa ? waLink(businessWa, "Hi, I have a question about my account.") : "#settings"}
        onClick={(e) => { if (!businessWa) { e.preventDefault(); setView("settings"); showToast("Add a WhatsApp number in Settings first"); } }}
        target={businessWa ? "_blank" : undefined} rel="noreferrer"
        className="fixed bottom-24 md:bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-card active:scale-95 transition"
        style={{ backgroundColor: businessWa ? WHATSAPP_GREEN : "#94a3b8" }}>
        <Phone size={24} />
      </a>

      {renderModal()}
      {globalSearchOpen && (
        <GlobalSearchOverlay
          customers={customers} items={items} estimates={estimates} currency={settings.currency}
          onClose={() => setGlobalSearchOpen(false)}
          onSelectCustomer={(id: string) => { setSelectedCustomerId(id); setView("customerDetail"); setGlobalSearchOpen(false); }}
          onSelectItem={() => { setView("items"); setGlobalSearchOpen(false); }}
          onSelectEstimate={(doc: any) => { openModal("viewEstimate", { doc }); setGlobalSearchOpen(false); }}
        />
      )}

      {shareInvoice && (
        <InvoiceShareModal invoice={shareInvoice} customer={shareCustomer} items={items} settings={settings} payment={sharePayment} onClose={() => setShareInvoice(null)} />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg max-w-sm text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !pin) { setError("Email and PIN are required"); return; }
    setBusy(true);
    try {
      const res: any = mode === "login"
        ? await api.auth.login(email.trim(), pin)
        : await api.auth.register(email.trim(), pin, name.trim());
      api.setToken(res.token);
      onAuthed();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-paper px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card bg-white p-7 shadow-card border border-line/70">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 font-display text-lg font-semibold text-white">SBT</div>
          <h1 className="font-display text-xl font-semibold text-ink">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-ink/40">Shree Balaji Traders</p>
        </div>

        {mode === "register" && (
          <input
            className="mb-3 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="mb-3 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
          placeholder="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-4 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
          placeholder="PIN (4+ digits)"
          type="password"
          inputMode="numeric"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {error && <p className="mb-3 text-sm font-medium text-bad-500">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-medium text-ink/50 hover:text-brand-500 transition-colors"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "First time here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!api.getToken());
  if (!authed) return <AuthScreen onAuthed={() => setAuthed(true)} />;
  return <InvoiceApp onSignOut={() => { api.setToken(null); setAuthed(false); }} />;
}
