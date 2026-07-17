import React, { useState, useRef, useEffect } from "react";
import {
  Menu, X, Home, Users, ShoppingBag, FileText, Truck, Receipt,
  ArrowDownToLine, Wallet, BarChart3, Globe2, Settings as SettingsIcon,
  Bell, LifeBuoy, Plus, Trash2, Phone, ChevronDown, Sparkles, RotateCcw,
  Send, Check, CheckCircle2, AlertCircle, ArrowRight, MessageSquare,
  Search, MapPin, PackageCheck, ClipboardList, ChevronUp, AlertTriangle,
  ShoppingCart, Loader2, Pencil, Printer, HardHat, Award
} from "lucide-react";
import { api } from "../lib/api";

/* ---- helpers ---- */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const WHATSAPP_GREEN = "#25D366";
const LOW_STOCK_DEFAULT = 5;
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
  Accepted: "bg-blue-100 text-blue-700",
  Due: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Overdue: "bg-rose-100 text-rose-700",
  Pending: "bg-amber-100 text-amber-700",
  Delivered: "bg-emerald-100 text-emerald-700",
  Received: "bg-emerald-100 text-emerald-700",
};

const CATEGORY_COLORS = ["bg-blue-400","bg-sky-300","bg-amber-300","bg-violet-300","bg-emerald-300","bg-rose-300"];

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
      className={`inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition ${className}`}>
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, className = "" }: any) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition ${className}`}>
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
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>;
}
function EmptyState({ text, cta, onCta }: any) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-slate-500 text-sm max-w-xs">{text}</p>
      {cta && <PillButton onClick={onCta}><Plus size={16} /> {cta}</PillButton>}
    </div>
  );
}
function Card({ children, className = "" }: any) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm border border-slate-100 ${className}`}>{children}</div>;
}

/* ---- FieldModal ---- */

function FieldModal({ title, fields, initial, onClose, onSave, danger }: any) {
  const [values, setValues] = useState<any>(() => initial || {});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const set = (k: string, v: any) => setValues((s: any) => ({ ...s, [k]: v }));
  const canSave = fields.every((f: any) => !f.required || (values[f.key] !== undefined && values[f.key] !== ""));
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          {fields.map((f: any) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-slate-500">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>
              {f.type === "select" ? (
                <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="" disabled>Choose...</option>
                  {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  rows={3} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              ) : f.type === "location" ? (
                <div className="flex gap-2">
                  <input type="text" value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <button type="button" onClick={() => setPickerFor(f.key)}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <MapPin size={14} /> Map
                  </button>
                </div>
              ) : (
                <input type={f.type || "text"} value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(values)}
            className={`flex-1 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40 ${danger ? "bg-rose-600" : "bg-slate-900"}`}>Save</button>
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
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Pick location on map</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {status === "error" ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {!GOOGLE_MAPS_API_KEY
              ? "No Google Maps API key is configured. Add VITE_GOOGLE_MAPS_API_KEY to your environment variables (Netlify site settings) to enable the map picker."
              : "Couldn't load Google Maps. Check your API key and enabled APIs (Maps JavaScript API, Places API, Geocoding API)."}
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                placeholder="Search for an address or place..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="relative w-full rounded-xl bg-slate-100" style={{ height: 320 }}>
              <div ref={mapDivRef} className="absolute inset-0 rounded-xl overflow-hidden" />
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 gap-2 pointer-events-none">
                  <Loader2 size={16} className="animate-spin" /> Loading map…
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">Tap the map or drag the pin to fine-tune the exact spot.</p>
          </>
        )}

        {address && (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{address}</div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button
            disabled={!coords}
            onClick={() => coords && onPick({ address, lat: coords.lat, lng: coords.lng })}
            className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40"
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
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "truncate text-slate-900" : "truncate text-slate-400"}>
          {selected ? selected.label : (placeholder || "Select...")}
        </span>
        <ChevronDown size={15} className="ml-2 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-slate-100 bg-white p-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm outline-none"
            />
          </div>
          {filtered.length === 0
            ? <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
            : filtered.map((o: any) => (
              <button
                type="button"
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50 ${o.value === value ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700"}`}
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Is this estimate paid?</h3>
        <p className="mt-1 text-sm text-slate-500">Total amount: <span className="font-semibold text-slate-700">{fmtMoney(total, currency)}</span></p>
        <div className="mt-5 space-y-2">
          <button onClick={() => onChoose("Paid")} className="w-full rounded-full bg-emerald-500 py-3 text-sm font-bold text-white active:scale-[0.98]">Paid — customer has paid</button>
          <button onClick={() => onChoose("Due")} className="w-full rounded-full bg-amber-500 py-3 text-sm font-bold text-white active:scale-[0.98]">Due — payment pending</button>
          <button onClick={onCancel} className="w-full rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-500">Back to editing</button>
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
  const [pendingSave, setPendingSave] = useState<any>(null);

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
  const previousDueAmount = previousDueEstimates.reduce((s: number, e: any) => s + Number(e.total || 0), 0);
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{titleMap[type]}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {customers.length === 0 ? <p className="text-sm text-slate-500">Add a customer first.</p>
          : items.length === 0 ? <p className="text-sm text-slate-500">Add an item first.</p>
          : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Customer *</label>
              <SearchableSelect
                options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">{type === "challan" ? "Delivery date" : "Date"}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </div>
              {type !== "challan" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-500">Items *</label>
              <div className="space-y-3">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isOverridden = type === "estimate" && it && Number(ln.rate) !== Number(it.price);
                  const lineSubtotal = Number(ln.qty || 0) * Number(ln.rate || 0);
                  return (
                    <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            options={items.map((it: any) => ({ value: it.id, label: `${it.name} (stock: ${it.stock ?? 0})` }))}
                            value={ln.itemId}
                            onChange={(v: string) => setLineItem(i, v)}
                            placeholder="Select item"
                          />
                        </div>
                        <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-16 rounded-xl border border-slate-200 px-2 py-2 text-sm" />
                        {type === "estimate" && (
                          <button type="button" onClick={() => setRateEditIndex(i)}
                            className={`relative flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-2 text-sm font-semibold ${isOverridden ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}>
                            {fmtMoney(Number(ln.rate || 0), "")}
                            <Pencil size={11} className="opacity-70" />
                            {isOverridden && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          </button>
                        )}
                        {it && Number(ln.qty) > (it.stock ?? 0) && <span title="Exceeds stock"><AlertTriangle size={14} className="text-amber-500 shrink-0" /></span>}
                        {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>}
                      </div>
                      <p className="mt-1.5 px-1 text-xs font-semibold text-slate-500">Subtotal: {fmtMoney(lineSubtotal, "")}</p>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3.5 text-sm font-bold text-blue-600 transition hover:bg-blue-100 hover:border-blue-400 active:scale-[0.98]"
              >
                <Plus size={19} /> Add Item
              </button>
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Contractor name</label>
                  <input list="contractor-names" value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <datalist id="contractor-names">{knownContractors.map((n) => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Destination</label>
                  <input list="destination-names" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Place / area" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <datalist id="destination-names">{knownDestinations.map((n) => <option key={n} value={n} />)}</datalist>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>
            {type === "estimate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Freight cost</label>
                  <input type="number" min="0" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Labour cost</label>
                  <input type="number" min="0" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
              </div>
            )}
            {type === "estimate" && previousDueAmount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Previous due — {fmtMoney(previousDueAmount, "")}</p>
                    <p className="mt-0.5 text-xs text-amber-700">From {previousDueEstimates.length} earlier unpaid estimate{previousDueEstimates.length !== 1 ? "s" : ""}: {previousDueEstimates.map((e: any) => e.number).join(", ")}</p>
                  </div>
                  <button type="button" onClick={() => setIncludePreviousDue((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${includePreviousDue ? "bg-amber-500" : "bg-slate-200"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${includePreviousDue ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                {includePreviousDue && <p className="mt-2 text-[11px] text-amber-700">Included in this estimate's total. Those {previousDueEstimates.length} earlier estimate{previousDueEstimates.length !== 1 ? "s" : ""} will be marked Paid once this one is saved.</p>}
              </div>
            )}
            <div className="space-y-1 rounded-xl bg-slate-50 px-4 py-3">
              {type === "estimate" && (
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Items subtotal</span><span>{itemsSubtotal.toFixed(2)}</span></div>
              )}
              {type === "estimate" && (Number(freightCost || 0) > 0 || Number(labourCost || 0) > 0 || previousDue > 0) && (
                <>
                  {Number(freightCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Freight</span><span>{Number(freightCost).toFixed(2)}</span></div>}
                  {Number(labourCost || 0) > 0 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Labour</span><span>{Number(labourCost).toFixed(2)}</span></div>}
                  {previousDue > 0 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Previous due</span><span>{previousDue.toFixed(2)}</span></div>}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Total</span>
                <span className="text-lg font-bold text-slate-900">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button disabled={!canSave} onClick={handleSaveClick}
            className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">{isEditing ? "Save changes" : `Save ${type}`}</button>
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
          onChoose={(status: string) => { onSave({ ...pendingSave, status }); setPendingSave(null); }}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </div>
  );
}

function RateEditPopup({ itemName, listPrice, rate, onCancel, onReset, onSave }: any) {
  const [value, setValue] = useState(String(rate));
  const numeric = Number(value);
  const canSave = value !== "" && !isNaN(numeric) && numeric >= 0;
  const isOverridden = Number(rate) !== Number(listPrice);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full sm:max-w-xs rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">Edit rate</h3>
        <p className="mb-4 mt-0.5 text-xs text-slate-500">{itemName} — this estimate only</p>

        <label className="mb-1.5 block text-xs font-semibold text-slate-500">Rate per unit</label>
        <div className="flex items-center rounded-xl border-[1.5px] border-blue-600 px-3 py-2.5">
          <span className="mr-1 text-slate-500">₹</span>
          <input
            type="number" min="0" autoFocus value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-none p-0 text-base font-bold text-slate-900 outline-none"
          />
        </div>
        <p className="mb-4 mt-1.5 text-xs text-slate-400">Item's list price: ₹{Number(listPrice).toFixed(2)}</p>

        <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
          This only changes the rate on this estimate. Your saved item price in the Items list won't be affected.
        </p>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(numeric)} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">Save rate</button>
        </div>
        {isOverridden && (
          <button onClick={onReset} className="mt-3 text-left text-xs font-semibold text-blue-600 underline">
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

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[93vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New Delivery Challan</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
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
              <button onClick={() => addRow(setExpenses, expenses)} className="text-xs font-semibold text-blue-600">+ Add ({expenses.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {expenses.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setExpenses, expenses, i, "label", e.target.value)} placeholder="Expense label (e.g. Fuel)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setExpenses, expenses, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                {expenses.length > 1 && <button onClick={() => removeRow(setExpenses, expenses, i)} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalExpenses > 0 && <p className="mt-1 text-right text-xs text-slate-400">Total: <span className="font-semibold text-rose-600">₹{totalExpenses.toFixed(2)}</span></p>}
        </div>

        {/* Income Types */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Income Types</label>
            {incomes.length < MAX_ENTRY_ROWS && (
              <button onClick={() => addRow(setIncomes, incomes)} className="text-xs font-semibold text-blue-600">+ Add ({incomes.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {incomes.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setIncomes, incomes, i, "label", e.target.value)} placeholder="Income label (e.g. Freight)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setIncomes, incomes, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                {incomes.length > 1 && <button onClick={() => removeRow(setIncomes, incomes, i)} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalIncomes > 0 && <p className="mt-1 text-right text-xs text-slate-400">Total: <span className="font-semibold text-emerald-600">₹{totalIncomes.toFixed(2)}</span></p>}
        </div>

        {/* Delivery Fee */}
        <div className={`rounded-2xl border p-4 space-y-3 ${!feeVerified && deliveryFee ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <div>
            <label className={labelCls}>Delivery Fee</label>
            <input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="0.00" className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white ${!feeVerified && deliveryFee ? "border-amber-400" : "border-slate-200"}`} />
          </div>
          <button
            type="button"
            onClick={() => setFeeVerified((v) => !v)}
            className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 transition select-none"
          >
            <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${feeVerified ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"}`}>
              {feeVerified && <Check size={11} className="text-white" />}
            </span>
            <span className={`text-sm font-medium ${feeVerified ? "text-emerald-700" : "text-slate-600"}`}>Verify delivery fee</span>
            {!feeVerified && deliveryFee && <span className="ml-auto text-xs font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> Not verified</span>}
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ route, fromDate, toDate, byWhom, transporter, expenses, incomes, deliveryFee: Number(deliveryFee) || 0, feeVerified, total: totalIncomes - totalExpenses + (Number(deliveryFee) || 0) })}
            className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">Save Challan</button>
        </div>
      </div>
    </div>
  );
}

/* ---- OrderModal ---- */

function OrderModal({ items, onClose, onSave }: any) {
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const canSave = itemId && Number(qty) > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">New Order</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {items.length === 0 ? <p className="text-sm text-slate-500">Add items first.</p> : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Item *</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                {items.map((it: any) => <option key={it.id} value={it.id}>{it.name} (current stock: {it.stock ?? 0})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Qty to order *</label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Notes / Supplier</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Supplier name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ itemId, qty: Number(qty), date, notes })}
            className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">Place Order</button>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-slate-900">Return items</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-500">{doc.number} — enter how many of each item are being returned.</p>

        {returnableLines.length === 0 ? (
          <p className="text-sm text-slate-500">Every item on this estimate has already been returned.</p>
        ) : (
          <div className="space-y-3">
            {returnableLines.map((l: any) => (
              <div key={l.itemId} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{l.name}</p>
                  <p className="text-xs text-slate-400">
                    {l.qty - l.returned} available to return · {fmtMoney(l.rate, currency)} each
                    {l.returned > 0 ? ` · ${l.returned} already returned` : ""}
                  </p>
                </div>
                <input
                  type="number" min="0" max={l.qty - l.returned} placeholder="0"
                  value={qtyMap[l.itemId] || ""} onChange={(e) => setQty(l.itemId, e.target.value)}
                  className="w-16 rounded-xl border border-slate-200 px-2 py-2 text-sm text-center"
                />
              </div>
            ))}
          </div>
        )}

        {refundTotal > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2.5">
            <span className="text-sm font-semibold text-rose-600">Refund due</span>
            <span className="text-base font-bold text-rose-700">{fmtMoney(refundTotal, currency)}</span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.returnQty })))}
            className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Refund {refundTotal > 0 ? fmtMoney(refundTotal, currency) : ""}
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
  const statusLabel = invoice.status === "Paid" ? "PAID" : invoice.status === "Accepted" ? "ACCEPTED" : isOverdue ? "OVERDUE" : "DUE";
  const statusColor = invoice.status === "Paid" ? "#10b981" : invoice.status === "Accepted" ? "#2563eb" : isOverdue ? "#e11d48" : "#d97706";

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const W = 900;
    const rowH = 42;
    const lineCount = (invoice.lines || []).length;
    const hasExtras = Number(invoice.freightCost || 0) > 0 || Number(invoice.labourCost || 0) > 0 || Number(invoice.previousDue || 0) > 0;
    const extraRows = hasExtras ? 1 + [invoice.freightCost, invoice.labourCost, invoice.previousDue].filter((v: any) => Number(v || 0) > 0).length : 0;
    const H = 660 + lineCount * rowH + extraRows * 32;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, 10);
    let y = 70;
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 32px Arial"; ctx.fillText(settings.orgName || "Your Business", 60, y);
    ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(settings.email || "", 60, y + 24);
    ctx.textAlign = "right"; ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText("ESTIMATE", W - 60, y - 6);
    ctx.font = "15px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(invoice.number, W - 60, y + 22); ctx.textAlign = "left";
    y += 70; ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
    y += 40; ctx.font = "bold 13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText("BILLED TO", 60, y);
    y += 24; ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(customer?.name || "Customer", 60, y);
    let billY = y;
    if (customer?.phone) { billY += 22; ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(customer.phone, 60, billY); }
    if (customer?.location) { billY += 20; ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText(customer.location, 60, billY); }
    const dateTop = y - 24;
    ctx.textAlign = "right"; ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText("ESTIMATE DATE", W - 60, dateTop);
    ctx.font = "bold 15px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtDate(invoice.date), W - 60, dateTop + 20);
    ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText("DUE DATE", W - 60, dateTop + 50);
    ctx.font = "bold 15px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtDate(invoice.dueDate), W - 60, dateTop + 70); ctx.textAlign = "left";
    y = Math.max(billY, dateTop + 70) + 40;
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(60, y, W - 120, 40);
    ctx.font = "bold 13px Arial"; ctx.fillStyle = "#64748b";
    ctx.fillText("ITEM", 76, y + 26); ctx.fillText("QTY", W - 330, y + 26); ctx.fillText("PRICE", W - 230, y + 26); ctx.fillText("AMOUNT", W - 120, y + 26);
    y += 40; ctx.font = "15px Arial";
    (invoice.lines || []).forEach((ln: any) => {
      const it = items.find((i: any) => i.id === ln.itemId);
      const name = it?.name || "Item"; const qty = Number(ln.qty || 0); const price = ln.rate ?? it?.price ?? 0; const amount = qty * price;
      y += rowH; ctx.strokeStyle = "#f1f5f9"; ctx.beginPath(); ctx.moveTo(60, y - rowH + 8); ctx.lineTo(W - 60, y - rowH + 8); ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.fillText(name.length > 28 ? name.slice(0, 27) + "…" : name, 76, y - 8);
      ctx.fillText(String(qty), W - 330, y - 8); ctx.fillText(fmtMoney(price, settings.currency), W - 230, y - 8); ctx.fillText(fmtMoney(amount, settings.currency), W - 120, y - 8);
    });
    y += 50; ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke(); y += 40;
    if (hasExtras) {
      const itemsSubtotal = (invoice.lines || []).reduce((s: number, ln: any) => { const it = items.find((i: any) => i.id === ln.itemId); return s + Number(ln.qty || 0) * Number(ln.rate ?? it?.price ?? 0); }, 0);
      ctx.textAlign = "right"; ctx.font = "14px Arial"; ctx.fillStyle = "#64748b";
      ctx.fillText("Items subtotal", W - 220, y); ctx.font = "bold 14px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(itemsSubtotal, settings.currency), W - 60, y); y += 26;
      if (Number(invoice.freightCost || 0) > 0) { ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText("Freight", W - 220, y); ctx.font = "bold 14px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(invoice.freightCost, settings.currency), W - 60, y); y += 26; }
      if (Number(invoice.labourCost || 0) > 0) { ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText("Labour", W - 220, y); ctx.font = "bold 14px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(invoice.labourCost, settings.currency), W - 60, y); y += 26; }
      if (Number(invoice.previousDue || 0) > 0) { ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText("Previous due", W - 220, y); ctx.font = "bold 14px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(invoice.previousDue, settings.currency), W - 60, y); y += 26; }
      ctx.textAlign = "left"; y += 10;
    }
    ctx.textAlign = "right"; ctx.font = "bold 16px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText("TOTAL", W - 220, y);
    ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(invoice.total, settings.currency), W - 60, y); ctx.textAlign = "left";
    y += 50;
    if (invoice.status === "Paid") {
      ctx.fillStyle = "#ecfdf5"; ctx.fillRect(60, y, W - 120, 50); ctx.fillStyle = "#10b981"; ctx.font = "bold 16px Arial";
      ctx.fillText(`✓ Payment received${payment ? " on " + fmtDate(payment.date) : ""}`, 80, y + 32);
    } else if (invoice.status === "Accepted") {
      ctx.fillStyle = "#eff6ff"; ctx.fillRect(60, y, W - 120, 50); ctx.fillStyle = "#2563eb"; ctx.font = "bold 16px Arial";
      ctx.fillText(`Accepted — payment due by ${fmtDate(invoice.dueDate)}`, 80, y + 32);
    } else {
      ctx.fillStyle = isOverdue ? "#fff1f2" : "#fffbeb"; ctx.fillRect(60, y, W - 120, 50); ctx.fillStyle = isOverdue ? "#e11d48" : "#d97706"; ctx.font = "bold 16px Arial";
      ctx.fillText(isOverdue ? `Overdue — was due ${fmtDate(invoice.dueDate)}` : `Payment due by ${fmtDate(invoice.dueDate)}`, 80, y + 32);
    }
    ctx.save(); ctx.translate(W - 160, 150); ctx.rotate(-0.28); ctx.globalAlpha = 0.9; ctx.font = "bold 32px Arial"; ctx.textAlign = "center";
    const textW = ctx.measureText(statusLabel).width; ctx.lineWidth = 4; ctx.strokeStyle = statusColor;
    ctx.strokeRect(-textW / 2 - 24, -26, textW + 48, 52); ctx.fillStyle = statusColor; ctx.fillText(statusLabel, 0, 10); ctx.restore();
    ctx.textAlign = "center"; ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Thank you for your business — ${settings.orgName || ""}`, W / 2, H - 28); ctx.textAlign = "left";
    setImgUrl(canvas.toDataURL("image/png"));
  }, [invoice, customer, items, settings, payment, isOverdue, statusLabel, statusColor]);

  const message = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, thank you! Your payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) has been received.`
    : `Hi ${customer?.name || ""}, your estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} is due on ${fmtDate(invoice.dueDate)}.`;
  const smsMsg = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) received. Thank you! - ${settings.orgName}`
    : `Hi ${customer?.name || ""}, estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} due ${fmtDate(invoice.dueDate)}. - ${settings.orgName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Share estimate</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          {imgUrl ? <img src={imgUrl} alt={`Estimate ${invoice.number}`} className="block h-auto w-full" />
            : <div className="flex h-40 items-center justify-center text-sm text-slate-400">Generating preview…</div>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">Press and hold the image to save it, then share from your gallery — or use the buttons below.</p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <a href={imgUrl || undefined} download={`${invoice.number}.png`} onClick={(e) => { if (!imgUrl) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition active:scale-[0.98] ${!imgUrl ? "opacity-40" : ""}`}>
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
        {!customer?.phone && <p className="mt-2 text-center text-xs text-rose-500">Add a phone number to enable sharing.</p>}
      </div>
    </div>
  );
}

/* ---- Sidebar + Topbar ---- */

function Sidebar({ open, onClose, active, onNav, settings, onSignOut }: any) {
  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-slate-900/30 md:hidden" />}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 transform bg-white border-r border-slate-100 transition-transform md:translate-x-0 md:static md:z-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto px-5 py-6">
          <div className="flex items-center justify-between md:hidden mb-2">
            <span className="text-sm font-semibold text-slate-400">Menu</span>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
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
            <button className="flex items-center gap-1 text-lg font-bold text-slate-900">{settings.orgName} <ChevronDown size={16} className="text-slate-400" /></button>
            <p className="text-sm text-slate-400">{settings.email}</p>
          </div>
          <div className="-mx-5 mb-2 border-t border-slate-100" />
          <nav className="flex-1 space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon; const isActive = active === n.id;
              return (
                <button key={n.id} onClick={() => { onNav(n.id); onClose(); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
                  <Icon size={19} /> {n.label}
                </button>
              );
            })}
          </nav>
          <div className="-mx-5 mt-2 border-t border-slate-100 pt-3">
            <button onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">
              <X size={19} /> Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, settings, view }: any) {
  const titleMap: any = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between bg-slate-50/95 backdrop-blur px-5 py-4">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="rounded-full p-2 hover:bg-slate-100 md:hidden"><Menu size={22} /></button>
        <span className="text-lg font-bold text-slate-900">{view === "dashboard" ? settings.orgName : titleMap[view]}</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="rounded-full border border-slate-200 bg-white p-2"><LifeBuoy size={18} className="text-slate-500" /></button>
        <button className="rounded-full border border-slate-200 bg-white p-2"><Bell size={18} className="text-slate-500" /></button>
      </div>
    </div>
  );
}

/* ---- Dashboard ---- */

function Dashboard({ data, settings, openModal, go }: any) {
  const { customers, estimates, expenses, items, payments } = data;
  const [tab, setTab] = useState("estimates");
  const outstanding = estimates.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + i.total, 0);
  const byCategory: any = {};
  expenses.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
  const catEntries = Object.entries(byCategory) as [string, number][];
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0);
  const lowStockItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));

  const quickActions = [
    { label: "New Estimate", icon: Receipt, bg: "bg-blue-100", fg: "text-blue-600", action: () => openModal("estimate") },
    { label: "New Customer", icon: Users, bg: "bg-emerald-100", fg: "text-emerald-600", action: () => openModal("customer") },
    { label: "New Expense", icon: Wallet, bg: "bg-rose-100", fg: "text-rose-600", action: () => openModal("expense") },
    { label: "New Order", icon: ShoppingCart, bg: "bg-amber-100", fg: "text-amber-600", action: () => openModal("order") },
  ];

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
      <div className="flex items-center gap-2 pt-1">
        <Sparkles size={18} className="text-orange-400" />
        <h1 className="text-xl font-bold text-slate-900">Welcome {settings.ownerName}</h1>
      </div>
      <p className="-mt-3 text-sm text-slate-400">Here's your organization's overview</p>

      {lowStockItems.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">Low stock alert</p>
            <p className="text-xs text-amber-700 mt-0.5">{lowStockItems.map((it: any) => `${it.name} (${it.stock ?? 0} left)`).join(", ")}</p>
          </div>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-4 gap-2 text-center">
          {quickActions.map((q) => (
            <button key={q.label} onClick={q.action} className="flex flex-col items-center gap-2">
              <span className={`flex h-14 w-14 items-center justify-center rounded-full ${q.bg} ${q.fg}`}><q.icon size={22} /></span>
              <span className="text-xs font-medium text-slate-600 leading-tight">{q.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-slate-900">Receivables Summary</h3>
        <p className="mt-1 text-sm text-slate-400">Outstanding amounts owed by customers.</p>
        <p className="mt-3 text-2xl font-bold text-slate-900">{fmtMoney(outstanding, settings.currency)}</p>
        <PillButton className="mt-4" onClick={() => openModal("estimate")}><Plus size={16} /> Create Estimate</PillButton>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-slate-700">
          <ArrowDownToLine size={16} /> <h3 className="text-base font-bold">Sales &amp; Refunds</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-400">Today</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmtMoney(todaySales, settings.currency)}</p>
            {refundsToday > 0 && <p className="text-xs font-semibold text-rose-500">−{fmtMoney(refundsToday, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-emerald-600">Net {fmtMoney(todaySales - refundsToday, settings.currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">This month</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmtMoney(monthSales, settings.currency)}</p>
            {refundsMonth > 0 && <p className="text-xs font-semibold text-rose-500">−{fmtMoney(refundsMonth, settings.currency)} refunded</p>}
            <p className="text-xs font-semibold text-emerald-600">Net {fmtMoney(monthSales - refundsMonth, settings.currency)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2 text-slate-700">
          <BarChart3 size={16} /> <h3 className="text-base font-bold">Monthly Sales</h3>
        </div>
        {!hasSales ? (
          <p className="text-sm text-slate-400">No estimates yet in the last 6 months.</p>
        ) : (
          <div className="flex items-end justify-between gap-2" style={{ height: 150 }}>
            {salesByMonth.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] font-semibold leading-tight text-slate-500">{m.total > 0 ? fmtMoney(m.total, settings.currency) : ""}</span>
                <div className="w-full rounded-t-lg bg-blue-500" style={{ height: `${Math.max(3, (m.total / maxSale) * 100)}px` }} />
                <span className="text-xs font-medium text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-slate-700">
          <RotateCcw size={16} /> <h3 className="text-base font-bold">Recent Transactions</h3>
        </div>
        <div className="mb-4 flex gap-2">
          {["estimates", "expenses", "returns"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>{t}</button>
          ))}
        </div>
        {recent.length === 0 ? (
          <EmptyState text={`No ${tab} yet.`} cta={`Create ${tab === "estimates" ? "Estimate" : tab === "expenses" ? "Expense" : "Estimate"}`}
            onCta={() => openModal(tab === "expenses" ? "expense" : "estimate")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <div><p className="font-semibold text-slate-800">{r.number || r.category}</p><p className="text-xs text-slate-400">{fmtDate(r.date)}</p></div>
                <div className="text-right"><p className="font-bold text-slate-800">{fmtMoney(r.total ?? r.amount, settings.currency)}</p>{r.status && <Badge status={r.status} />}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {catEntries.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Top Expenses</h3>
            <span className="text-xs font-semibold text-slate-400">This Fiscal Year</span>
          </div>
          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
            {catEntries.map(([cat, v], i) => <div key={cat} className={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} style={{ width: `${(v / catTotal) * 100}%` }} />)}
          </div>
          <ul className="space-y-2">
            {catEntries.map(([cat, v], i) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />{cat}</span>
                <span className="font-semibold text-slate-800">{fmtMoney(v, settings.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ---- Customers ---- */

function CustomersView({ customers, openModal, removeCustomer }: any) {
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("customer")}><Plus size={16} /> New Customer</PillButton>
      </div>
      {customers.length === 0
        ? <Card><EmptyState text="Add your first customer." cta="New Customer" onCta={() => openModal("customer")} /></Card>
        : customers.map((c: any) => (
          <Card key={c.id} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{c.name}</p>
              <p className="text-xs text-slate-400">{c.email || "No email"}{c.phone ? ` · ${c.phone}` : ""}</p>
              {c.location && (
                <a
                  href={c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`}
                  target="_blank" rel="noreferrer"
                  className="mt-0.5 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 hover:underline"
                >
                  <MapPin size={11} /> {c.location}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <WhatsAppButton phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
              <SmsButton phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
              <button onClick={() => removeCustomer(c.id)} className="rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={16} /></button>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

/* ---- Items (with stock display) ---- */

function ItemsView({ items, openModal, removeItem, currency }: any) {
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("item")}><Plus size={16} /> New Item</PillButton>
      </div>
      {items.length === 0
        ? <Card><EmptyState text="Add items you sell." cta="New Item" onCta={() => openModal("item")} /></Card>
        : items.map((it: any) => {
          const threshold = it.lowStock ?? LOW_STOCK_DEFAULT;
          const isLow = (it.stock ?? 0) <= threshold;
          return (
            <Card key={it.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{it.name}</p>
                  {isLow && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={10} /> Low stock</span>}
                </div>
                <p className="text-xs text-slate-400">{it.unit || "unit"} · Stock: <span className={`font-semibold ${isLow ? "text-amber-600" : "text-slate-700"}`}>{it.stock ?? 0}</span> (alert at ≤{threshold})</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Sell: <span className="font-bold text-slate-800">{fmtMoney(it.sellingPrice ?? it.price, currency)}</span></p>
                  {it.purchasePrice > 0 && <p className="text-xs text-slate-400">Buy: <span className="font-semibold text-slate-600">{fmtMoney(it.purchasePrice, currency)}</span></p>}
                </div>
                <button onClick={() => removeItem(it.id)} className="rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={16} /></button>
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
  const itemName = (id: string) => items.find((it: any) => it.id === id)?.name || "Unknown item";
  const pending = orders.filter((o: any) => o.status === "Pending");
  const received = orders.filter((o: any) => o.status === "Received");

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("order")}><Plus size={16} /> New Order</PillButton>
      </div>

      {orders.length === 0
        ? <Card><EmptyState text="Place orders to restock your inventory. Marking an order as Received will automatically update the item's stock." cta="New Order" onCta={() => openModal("order")} /></Card>
        : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-slate-400">Pending ({pending.length})</p>
                {pending.map((o: any) => (
                  <Card key={o.id} className="mb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{itemName(o.itemId)}</p>
                        <p className="text-xs text-slate-400">Qty: {o.qty} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                      </div>
                      <Badge status="Pending" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => markOrderReceived(o.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.98]">
                        <PackageCheck size={13} /> Mark Received
                      </button>
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {received.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-bold uppercase text-slate-400">Received ({received.length})</p>
                {received.map((o: any) => (
                  <Card key={o.id} className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{itemName(o.itemId)}</p>
                      <p className="text-xs text-slate-400">Qty: {o.qty} · {fmtDate(o.date)}{o.notes ? ` · ${o.notes}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status="Received" />
                      <button onClick={() => removeOrder(o.id)} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={14} /></button>
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

function DocumentList({ type, docs, customers, currency, openModal, removeDoc, updateStatus, recordPayment, onShareInvoice, onPrint, onEdit, onReturn }: any) {
  const [search, setSearch] = useState("");
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  const customerPhone = (id: string) => customers.find((c: any) => c.id === id)?.phone;
  const labelMap: any = { estimate: "Estimate", challan: "Challan" };
  const emptyMap: any = {
    estimate: "Create estimates to send price quotes and invoices to customers.",
    challan: "Create delivery challans to track goods sent.",
  };
  // docs already arrive newest-first from the API (and stay that way as new ones are prepended locally)
  const visibleDocs = type === "estimate" && search.trim()
    ? docs.filter((d: any) => (d.notes || "").toLowerCase().includes(search.trim().toLowerCase()))
    : docs;
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{docs.length} {labelMap[type].toLowerCase()}{docs.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal(type)}><Plus size={16} /> New {labelMap[type]}</PillButton>
      </div>
      {type === "estimate" && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search estimates by notes..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {docs.length === 0
        ? <Card><EmptyState text={emptyMap[type]} cta={`New ${labelMap[type]}`} onCta={() => openModal(type)} /></Card>
        : visibleDocs.length === 0
        ? <Card><p className="text-center text-sm text-slate-400">No estimates match "{search}".</p></Card>
        : visibleDocs.map((d: any) => {
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
                    <p className="font-semibold text-slate-900">{d.number} · {d.route || "–"}</p>
                    <p className="text-xs text-slate-400">{fmtDate(d.fromDate)} → {fmtDate(d.toDate)}</p>
                  </div>
                  <Badge status={d.status} />
                </div>
                {(d.byWhom || d.transporter) && (
                  <div className="mt-2 flex gap-3 text-xs text-slate-500">
                    {d.byWhom && <span><span className="font-semibold text-slate-400">By:</span> {d.byWhom}</span>}
                    {d.transporter && <span><span className="font-semibold text-slate-400">Via:</span> {d.transporter}</span>}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {totalExp > 0 && <div className="rounded-xl bg-rose-50 px-2 py-1.5"><p className="text-xs text-rose-400">Expenses</p><p className="text-sm font-bold text-rose-600">{fmtMoney(totalExp, currency)}</p></div>}
                  {totalInc > 0 && <div className="rounded-xl bg-emerald-50 px-2 py-1.5"><p className="text-xs text-emerald-500">Income</p><p className="text-sm font-bold text-emerald-700">{fmtMoney(totalInc, currency)}</p></div>}
                  {d.deliveryFee > 0 && (
                    <div className={`rounded-xl px-2 py-1.5 ${d.feeVerified ? "bg-blue-50" : "bg-amber-50 border border-amber-300"}`}>
                      <p className={`text-xs flex items-center justify-center gap-1 ${d.feeVerified ? "text-blue-400" : "text-amber-500"}`}>
                        {!d.feeVerified && <AlertTriangle size={10} />}Delivery fee
                      </p>
                      <p className={`text-sm font-bold ${d.feeVerified ? "text-blue-700" : "text-amber-700"}`}>{fmtMoney(d.deliveryFee, currency)}</p>
                      {!d.feeVerified && <p className="text-xs text-amber-500 font-semibold">Unverified</p>}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    {["Pending","Delivered"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={15} /></button>
                </div>
              </Card>
            );
          }

          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between">
                <div><p className="font-semibold text-slate-900">{d.number}</p><p className="text-xs text-slate-400">{customerName(d.customerId)} · {fmtDate(d.date)}</p></div>
                <Badge status={displayStatus} />
              </div>
              <p className="mt-3 text-lg font-bold text-slate-900">{fmtMoney(d.total, currency)}</p>
              {type === "estimate" && d.notes && <p className="mt-1 text-xs text-slate-400 line-clamp-2">📝 {d.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {type !== "challan" && (
                  <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    {["Accepted","Due","Paid"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {type === "estimate" && <GhostButton onClick={() => onEdit(d)}><Pencil size={13} /> Edit</GhostButton>}
                {type === "estimate" && d.status !== "Paid" && <GhostButton onClick={() => recordPayment(d)}><CheckCircle2 size={13} /> Record payment</GhostButton>}
                {type === "estimate" && (d.lines || []).length > 0 && <GhostButton onClick={() => onReturn(d)}><RotateCcw size={13} /> Return items</GhostButton>}
                {type === "estimate" && <GhostButton onClick={() => onPrint(d)}><Printer size={13} /> Print</GhostButton>}
                {type === "estimate"
                  ? <button onClick={() => onShareInvoice(d)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98]" style={{ backgroundColor: WHATSAPP_GREEN }}><Phone size={13} /> Share estimate</button>
                  : <WhatsAppButton phone={customerPhone(d.customerId)} message={msg} label="Send" />
                }
                <button onClick={() => removeDoc(d.id)} className="ml-auto rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={15} /></button>
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}

/* ---- Payments ---- */

function PaymentsView({ payments, customers, currency, openModal, removePayment }: any) {
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{payments.length} payment{payments.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("payment")}><Plus size={16} /> Record Payment</PillButton>
      </div>
      {payments.length === 0
        ? <Card><EmptyState text="Record payments you receive." cta="Record Payment" onCta={() => openModal("payment")} /></Card>
        : payments.map((p: any) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{customerName(p.customerId)}</p>
              <p className="text-xs text-slate-400">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-emerald-600">+{fmtMoney(p.amount, currency)}</span>
              <button onClick={() => removePayment(p.id)} className="rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={16} /></button>
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
        <p className="text-sm text-slate-400">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("expense")}><Plus size={16} /> Record Expense</PillButton>
      </div>
      {expenses.length === 0
        ? <Card><EmptyState text="Record your expenses." cta="Record Expense" onCta={() => openModal("expense")} /></Card>
        : expenses.map((e: any) => (
          <Card key={e.id} className="flex items-center justify-between">
            <div><p className="font-semibold text-slate-900">{e.category}</p><p className="text-xs text-slate-400">{e.vendor || "No vendor"} · {fmtDate(e.date)}</p></div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-rose-600">-{fmtMoney(e.amount, currency)}</span>
              <button onClick={() => removeExpense(e.id)} className="rounded-full p-2 text-rose-400 hover:bg-rose-50"><Trash2 size={16} /></button>
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
        <Card><p className="text-sm text-slate-400">No estimates have a contractor name set yet. Add one when creating an estimate to see them here.</p></Card>
      ) : contractors.map((name) => {
        const c = byContractor[name];
        const itemRows = Object.values(c.itemMap).sort((a, b) => b.amount - a.amount);
        const isOpen = openContractor === name;
        return (
          <Card key={name}>
            <button className="flex w-full items-center justify-between text-left" onClick={() => setOpenContractor(isOpen ? null : name)}>
              <div>
                <p className="text-sm font-bold text-slate-900">{name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{c.count} estimate{c.count !== 1 ? "s" : ""} · {fmtMoney(c.total, currency)}</p>
              </div>
              {isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
            {isOpen && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {itemRows.map((r) => (
                  <div key={r.name} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-600">{r.name}</span>
                    <span className="text-slate-500">{r.qty} units</span>
                    <span className="font-semibold text-slate-900">{fmtMoney(r.amount, currency)}</span>
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
        <h3 className="mb-3 text-base font-bold text-slate-900">Log a work session</h3>

        <label className="mb-1 block text-xs font-semibold text-slate-500">Number of workers</label>
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => setWorkerCountSafe(workerCount - 1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-lg font-bold text-slate-600">âˆ’</button>
          <span className="w-6 text-center text-base font-bold text-slate-900">{workerCount}</span>
          <button onClick={() => setWorkerCountSafe(workerCount + 1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-lg font-bold text-slate-600">+</button>
        </div>

        <datalist id="labour-worker-names">
          {(knownWorkers || []).map((n: string) => <option key={n} value={n} />)}
        </datalist>
        <div className="mb-4 space-y-2">
          {names.map((n, i) => (
            <input key={i} list="labour-worker-names" value={n} onChange={(e) => setNames((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))}
              placeholder={`Worker ${i + 1} name`} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold text-slate-500">Materials moved (shared by the group)</label>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-slate-700">Cement</span>
          <span className="w-16 text-xs text-slate-400">â‚¹{LABOUR_RATES.cement}/unit</span>
          <input type="number" min="0" value={cementQty} onChange={(e) => setCementQty(e.target.value)} className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-blue-600">{fmtMoney(cementAmt, currency)}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-slate-700">Saria</span>
          <span className="w-16 text-xs text-slate-400">â‚¹{LABOUR_RATES.saria}/unit</span>
          <input type="number" min="0" value={sariaQty} onChange={(e) => setSariaQty(e.target.value)} className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-blue-600">{fmtMoney(sariaAmt, currency)}</span>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="w-16 text-sm font-semibold text-slate-700">Balu</span>
          <span className="w-16 text-xs text-slate-400">â‚¹{LABOUR_RATES.balu}/unit</span>
          <input type="number" min="0" value={baluQty} onChange={(e) => setBaluQty(e.target.value)} className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm" />
          <span className="ml-auto text-sm font-bold text-blue-600">{fmtMoney(baluAmt, currency)}</span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Include "Other" work?</span>
          <button type="button" onClick={() => setOtherIncluded((v) => !v)} className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${otherIncluded ? "bg-amber-500" : "bg-slate-200"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${otherIncluded ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {otherIncluded && (
          <div className="mb-3 flex items-center gap-2">
            <span className="w-16 text-sm font-semibold text-slate-700">Other</span>
            <span className="w-16 text-xs text-slate-400">your rate</span>
            <input type="number" min="0" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="â‚¹" className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm" />
            <span className="ml-auto text-sm font-bold text-blue-600">{fmtMoney(otherAmt, currency)}</span>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
          <span className="text-sm font-semibold text-blue-700">This session</span>
          <span className="text-lg font-bold text-blue-700">{fmtMoney(sessionTotal, currency)}</span>
        </div>
        <button disabled={!canSave || saving} onClick={save} className="mt-3 w-full rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "Savingâ€¦" : "+ Save session"}
        </button>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Today's sessions</h3>
          <span className="text-xs font-semibold text-slate-400">{todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""}</span>
        </div>
        {todaySessions.length === 0 ? (
          <p className="text-sm text-slate-400">No sessions logged yet today.</p>
        ) : (
          <div>
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between border-b border-slate-100 py-2.5 last:border-none">
                <div className="flex gap-3">
                  <span className="w-16 shrink-0 text-xs font-bold text-slate-400">{new Date(s.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{(s.workers || []).join(", ") || "â€”"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.cementQty > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Cement {fmtMoney(s.cementQty * LABOUR_RATES.cement, currency)}</span>}
                      {s.sariaQty > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Saria {fmtMoney(s.sariaQty * LABOUR_RATES.saria, currency)}</span>}
                      {s.baluQty > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Balu {fmtMoney(s.baluQty * LABOUR_RATES.balu, currency)}</span>}
                      {s.otherIncluded && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Other {fmtMoney(s.otherAmount, currency)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{fmtMoney(s.total, currency)}</span>
                  <button onClick={() => onRemove(s.id)} className="rounded-full p-1 text-rose-400 hover:bg-rose-50"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-emerald-700">Today's total ({todaySessions.length})</span>
              <span className="text-base font-bold text-emerald-700">{fmtMoney(todayTotal, currency)}</span>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-900">History</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          <label className="text-xs font-semibold text-slate-500">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
        </div>
        {dayRows.length === 0 ? <p className="text-sm text-slate-400">No sessions in this range.</p> : (
          <div>
            {dayRows.map((d) => (
              <div key={d} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-none">
                <span className="text-sm text-slate-600">{fmtDate(d)}</span>
                <span className="text-sm font-bold text-slate-900">{fmtMoney(byDay[d], currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ToDoTrackingView({ items, settings }: any) {
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const lowItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));
  const allItems = [...items].sort((a: any, b: any) => (a.stock ?? 0) - (b.stock ?? 0));

  const stockColor = (it: any) => {
    const s = it.stock ?? 0;
    const t = it.lowStock ?? LOW_STOCK_DEFAULT;
    if (s === 0) return "text-rose-600";
    if (s <= t) return "text-amber-600";
    return "text-emerald-600";
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
      <h1>${settings?.orgName || "Business"} â€” Inventory</h1>
      <table><thead><tr><th>Item</th><th>Unit</th><th style="text-align:right;">In stock</th><th style="text-align:right;">Alert â‰¤</th></tr></thead>
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
          <AlertTriangle size={18} className="text-amber-500" />
          <h3 className="text-base font-bold text-slate-900">Low Inventory Alerts</h3>
          {lowItems.length > 0 && (
            <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{lowItems.length}</span>
          )}
        </div>
        {lowItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700">All items are well-stocked!</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lowItems.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{it.name}</p>
                  <p className="text-xs text-slate-500">{it.unit || "unit"} Â· Alert threshold: {it.lowStock ?? LOW_STOCK_DEFAULT}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${(it.stock ?? 0) === 0 ? "text-rose-600" : "text-amber-600"}`}>{it.stock ?? 0}</p>
                  <p className="text-xs text-slate-400">in stock</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Full inventory â€” collapsible */}
      <Card>
        <button
          onClick={() => setInventoryOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={17} className="text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">Full Inventory Stock</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span onClick={(e) => { e.stopPropagation(); printInventory(); }} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"><Printer size={12} /> Print</span>
            {inventoryOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </div>
        </button>

        {inventoryOpen && (
          <div className="mt-4">
            {items.length === 0 ? (
              <p className="text-sm text-slate-400">No items added yet. Go to Items to add your first product.</p>
            ) : (
              <ul className="space-y-2">
                {allItems.map((it: any) => (
                  <li key={it.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{it.name}</p>
                      <p className="text-xs text-slate-400">{it.unit || "unit"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${stockColor(it)}`}>{it.stock ?? 0}</p>
                      <p className="text-xs text-slate-400">/ alert â‰¤{it.lowStock ?? LOW_STOCK_DEFAULT}</p>
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
        <h3 className="mb-1 text-base font-bold text-slate-900">Estimates by place</h3>
        <p className="text-xs text-slate-400">Add a Google Maps API key as <code className="rounded bg-slate-100 px-1">VITE_GOOGLE_MAPS_API_KEY</code> in your frontend's environment to enable this map.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-900">Estimates by place</h3>
      {destinations.length === 0 ? (
        <p className="text-sm text-slate-400">No estimates in this range have a destination set yet.</p>
      ) : mapError ? (
        <p className="text-sm text-rose-500">{mapError}</p>
      ) : (
        <div ref={mapRef} style={{ width: "100%", height: 260, borderRadius: 12 }} className="mt-2 bg-slate-100" />
      )}
    </Card>
  );
}
return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-900">Estimates by place</h3>
      {destinations.length === 0 ? (
        <p className="text-sm text-slate-400">No estimates in this range have a destination set yet.</p>
      ) : mapError ? (
        <p className="text-sm text-rose-500">{mapError}</p>
      ) : (
        <div ref={mapRef} style={{ width: "100%", height: 260, borderRadius: 12 }} className="mt-2 bg-slate-100" />
      )}
    </Card>
  );
}

function ReportsView({ data, currency, settings }: any) {
  const { invoices, payments, expenses, customers, labourSessions } = data;
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + i.total, 0);
  const totalReceived = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const outstanding = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + i.total, 0);
  const rangeLabour = (labourSessions || []).filter((s: any) => s.date >= fromDate && s.date <= toDate);
  const rangeLabourTotal = rangeLabour.reduce((s: number, x: any) => s + Number(x.total || 0), 0);
  const statusCounts: Record<string, number> = {};
  invoices.forEach((i: any) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });
  const stats = [
    { label: "Total Invoiced", value: totalInvoiced, color: "text-blue-600" },
    { label: "Total Received", value: totalReceived, color: "text-emerald-600" },
    { label: "Outstanding", value: outstanding, color: "text-amber-600" },
    { label: "Total Expenses", value: totalExpenses, color: "text-rose-600" },
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
      <h1>${settings?.orgName || "Business"} â€” Report</h1>
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
            <label className="text-xs font-semibold text-slate-500">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-slate-500">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          </div>
          <button onClick={printRangeReport} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"><Printer size={13} /> Print report</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Prints estimates, payments received, and expenses between the two dates.</p>
        {rangeLabourTotal > 0 && <p className="mt-1 text-xs font-semibold text-amber-600">Labour cost in this range: {fmtMoney(rangeLabourTotal, currency)} ({rangeLabour.length} session{rangeLabour.length !== 1 ? "s" : ""})</p>}
      </Card>
      <EstimatesMapCard invoices={invoices.filter((i: any) => i.date >= fromDate && i.date <= toDate)} currency={currency} />
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (<Card key={s.label}><p className="text-xs font-semibold text-slate-400">{s.label}</p><p className={`mt-1 text-xl font-bold ${s.color}`}>{fmtMoney(s.value, currency)}</p></Card>))}
      </div>
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-900">Estimates by status</h3>
        {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-slate-400">No estimates yet.</p>
          : <ul className="space-y-2">{Object.entries(statusCounts).map(([s, c]) => (<li key={s} className="flex items-center justify-between text-sm"><Badge status={s} /><span className="font-semibold text-slate-700">{c}</span></li>))}</ul>}
      </Card>
      <Card><p className="text-xs font-semibold text-slate-400">Total Customers</p><p className="mt-1 text-xl font-bold text-slate-900">{customers.length}</p></Card>

      {/* Search by name */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-blue-500" /><h3 className="text-base font-bold text-slate-900">Search estimates by customer name</h3></div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Type customer name..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        {trimmedName && (
          <div className="mt-3">
            {nameMatchedInvoices.length === 0
              ? <p className="text-sm text-slate-400">{nameMatchedCustomers.length === 0 ? `No customer matching "${nameQuery}".` : "Customer found but no estimates yet."}</p>
              : <ul className="divide-y divide-slate-100">
                {nameMatchedInvoices.map((inv: any) => {
                  const c = customers.find((cu: any) => cu.id === inv.customerId);
                  return (<li key={inv.id} className="py-3"><div className="flex items-start justify-between"><div><p className="font-semibold text-slate-900">{inv.number}</p><p className="text-xs text-slate-500">{c?.name} Â· {fmtDate(inv.date)}</p>{c?.location && <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={10} /> {c.location}</p>}</div><div className="text-right"><p className="font-bold text-slate-800">{fmtMoney(inv.total, currency)}</p><Badge status={inv.status} /></div></div></li>);
                })}
              </ul>
            }
          </div>
        )}
      </Card>

      {/* Search by name */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-blue-500" /><h3 className="text-base font-bold text-slate-900">Search estimates by customer name</h3></div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Type customer name..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        {trimmedName && (
          <div className="mt-3">
            {nameMatchedInvoices.length === 0
              ? <p className="text-sm text-slate-400">{nameMatchedCustomers.length === 0 ? `No customer matching "${nameQuery}".` : "Customer found but no estimates yet."}</p>
              : <ul className="divide-y divide-slate-100">
                {nameMatchedInvoices.map((inv: any) => {
                  const c = customers.find((cu: any) => cu.id === inv.customerId);
                  return (<li key={inv.id} className="py-3"><div className="flex items-start justify-between"><div><p className="font-semibold text-slate-900">{inv.number}</p><p className="text-xs text-slate-500">{c?.name} Â· {fmtDate(inv.date)}</p>{c?.location && <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={10} /> {c.location}</p>}</div><div className="text-right"><p className="font-bold text-slate-800">{fmtMoney(inv.total, currency)}</p><Badge status={inv.status} /></div></div></li>);
                })}
              </ul>
            }
          </div>
        )}
      </Card>

      {/* Search by location */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><MapPin size={16} className="text-violet-500" /><h3 className="text-base font-bold text-slate-900">Search customers by location</h3></div>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="Type city, area or address..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        {trimmedLoc && (
          <div className="mt-3">
            {locationMatchedCustomers.length === 0
              ? <p className="text-sm text-slate-400">No customers at "{locationQuery}".</p>
              : <ul className="divide-y divide-slate-100">
                {locationMatchedCustomers.map((c: any) => {
                  const custInvoices = invoices.filter((inv: any) => inv.customerId === c.id);
                  const custTotal = custInvoices.reduce((s: number, inv: any) => s + inv.total, 0);
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-start justify-between">
                        <div><p className="font-semibold text-slate-900">{c.name}</p><p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><MapPin size={10} /> {c.location}</p>{c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}</div>
                        <div className="text-right"><p className="text-xs text-slate-400">{custInvoices.length} estimate{custInvoices.length !== 1 ? "s" : ""}</p><p className="font-bold text-slate-800">{fmtMoney(custTotal, currency)}</p></div>
                      </div>
                      {custInvoices.length > 0 && <ul className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100">{custInvoices.map((inv: any) => (<li key={inv.id} className="flex items-center justify-between text-xs text-slate-500"><span>{inv.number} Â· {fmtDate(inv.date)}</span><span className="flex items-center gap-2">{fmtMoney(inv.total, currency)}<Badge status={inv.status} /></span></li>))}</ul>}
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
      `ðŸ“Š *Daily Sales Report â€” ${fmtDate(todayStr)}*`,
      `ðŸ¢ ${settings.orgName}`,
      ``,
      `ðŸ“¦ *Items Sold Today:*`,
      ...rows.map((r) => `  â€¢ ${r.name}: ${r.qty} unit(s) â€” ${currency}${r.amount.toFixed(2)}`),
      ``,
      `ðŸ§¾ Estimates raised: ${totalInvoices}`,
      `ðŸ’° *Total Sales: ${currency}${totalSales.toFixed(2)}*`,
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
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Send size={18} className="text-blue-600" /></div>
          <div>
            <h3 className="font-bold text-slate-900">Daily Sales Report</h3>
            <p className="text-xs text-slate-400">{fmtDate(todayStr)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm text-slate-400">No estimates created today yet.</p>
            <p className="text-xs text-slate-300 mt-1">Create an estimate and it will appear here.</p>
          </div>
        ) : (
          <>
            {/* Item breakdown table */}
            <div className="rounded-xl overflow-hidden border border-slate-100">
              <div className="grid grid-cols-3 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
                <span>Item</span><span className="text-center">Qty</span><span className="text-right">Amount</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className={`grid grid-cols-3 px-4 py-2.5 text-sm ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <span className="font-medium text-slate-800 truncate">{r.name}</span>
                  <span className="text-center text-slate-600">{r.qty}</span>
                  <span className="text-right font-semibold text-slate-900">{currency}{r.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-between items-center rounded-xl bg-slate-900 px-4 py-3">
              <div>
                <p className="text-xs text-slate-400">{totalInvoices} invoice{totalInvoices !== 1 ? "s" : ""} today</p>
                <p className="text-sm font-bold text-white">Total Sales</p>
              </div>
              <p className="text-xl font-bold text-emerald-400">{currency}{totalSales.toFixed(2)}</p>
            </div>
          </>
        )}
      </Card>

      {/* Share buttons */}
      <Card>
        <h3 className="text-sm font-bold text-slate-700 mb-3">Share this report</h3>
        <div className="flex flex-col gap-2">
          <button onClick={shareWhatsApp}
            className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition"
            style={{ backgroundColor: "#25D366" }}>
            <Phone size={18} />Share via WhatsApp
          </button>
          <button onClick={shareSMS}
            className="flex items-center gap-3 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
            <MessageSquare size={18} />Share via SMS
          </button>
          <button onClick={copyToClipboard}
            className="flex items-center gap-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition">
            <CheckCircle2 size={18} className="text-slate-400" />Copy to Clipboard
          </button>
        </div>
      </Card>
    </div>
  );
}
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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900 select-none">
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">
        {/* Icon + title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
            <ShoppingBag size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{phaseLabel}</h1>
          {phaseHint && <p className="text-sm text-slate-400 text-center">{phaseHint}</p>}
        </div>

        {/* PIN dots */}
        <div className={`flex gap-4 transition-transform ${shake ? "animate-[shake_0.4s_ease]" : ""}`}>
          {dots.map((filled, i) => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${filled ? "bg-blue-400 border-blue-400 scale-110" : "border-slate-500"}`} />
          ))}
        </div>

        {/* Error */}
        {error && <p className="text-sm font-semibold text-rose-400 -mt-4 text-center">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {["1","2","3","4","5","6","7","8","9","","0","âŒ«"].map((k, i) => {
            if (k === "") return <div key={i} />;
            const isDelete = k === "âŒ«";
            return (
              <button
                key={k + i}
                onClick={() => isDelete ? handleDelete() : handleDigit(k)}
                className={`h-16 rounded-2xl text-xl font-semibold transition active:scale-95 ${
                  isDelete
                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    : "bg-slate-800 text-white hover:bg-slate-700"
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
            className="text-xs text-slate-500 hover:text-slate-300 transition mt-2"
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
    orgName: "SHREE BALAJI TRADERS", ownerName: "SBT", email: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI", currency: "â‚¹", businessWhatsApp: "",
  });

  const [customers, setCustomers] = useState<any[]>([]);
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
    try {
      const doc = await api.items.create(v);
      setItems((c) => [doc, ...c]);
      showToast("Item added");
      closeModal();
    } catch (err) { onApiError(err, "Failed to add item"); }
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
      }

      if (v.id) {
        // editing an existing document â€” update in place, don't touch stock or status
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
        /* stock was deducted server-side â€” pull the fresh numbers */
        const freshItems = await api.items.list();
        setItems(freshItems);
        if (lowStock && lowStock.length > 0) {
          showToast(`âš ï¸ Low stock: ${lowStock.map((i: any) => `${i.name} (${i.stock} left)`).join(", ")}`);
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
      await api.documents(type as any).updateStatus(id, s);
      docSetter(type)((list: any[]) => list.map((x) => (x.id === id ? { ...x, status: s } : x)));
    } catch (err) { onApiError(err, "Failed to update status"); }
  };

  const savePayment = async (v: any) => {
    try {
      const doc = await api.payments.create(v);
      setPayments((p) => [doc, ...p]);
      if (v.invoiceId) setEstimates((list) => list.map((i) => (i.id === v.invoiceId ? { ...i, status: "Paid" } : i)));
      showToast("Payment recorded");
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

  const removePayment = async (id: string) => {
    try { await api.payments.remove(id); setPayments((c) => c.filter((x) => x.id !== id)); }
    catch (err) { onApiError(err, "Failed to delete payment"); }
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
  const recordPaymentFor = (invoice: any) => openModal("payment", { invoiceId: invoice.id, customerId: invoice.customerId, amount: invoice.total });

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
    const COMPACT_MAX_LINES = 12; // beyond this, a quarter-strip can't stay readable â€” use a fresh full page instead
    const compact = lines.length <= COMPACT_MAX_LINES;
    const rowFont = lines.length <= 4 ? 8.5 : lines.length <= 8 ? 7.5 : 6.5;

    const rowsHtml = lines.map((ln: any) => {
      const it = items.find((i) => i.id === ln.itemId);
      const name = it?.name || "Item";
      const qty = Number(ln.qty || 0);
      const rate = ln.rate ?? it?.price ?? 0;
      const amount = qty * rate;
      return `<div class="ln"><span class="ln-name">${name} Ã— ${qty}</span><span class="ln-amt">${fmtMoney(amount, settings.currency)}</span></div>`;
    }).join("");

    const extrasHtml = [
      Number(invoice.freightCost || 0) > 0 ? `<div class="ln"><span>Freight</span><span>${fmtMoney(invoice.freightCost, settings.currency)}</span></div>` : "",
      Number(invoice.labourCost || 0) > 0 ? `<div class="ln"><span>Labour</span><span>${fmtMoney(invoice.labourCost, settings.currency)}</span></div>` : "",
      Number(invoice.previousDue || 0) > 0 ? `<div class="ln"><span>Previous due</span><span>${fmtMoney(invoice.previousDue, settings.currency)}</span></div>` : "",
    ].join("");

    const statusNote = invoice.status === "Paid"
      ? "PAID"
      : invoice.status === "Accepted"
      ? `Accepted â€” due ${fmtDate(invoice.dueDate)}`
      : `Due ${fmtDate(invoice.dueDate)}`;

    const notesHtml = invoice.notes ? `<div class="notes">${invoice.notes}</div>` : "";

    const bodyHtml = `
      <div class="hd"><span class="org">${settings.orgName || "Your Business"}</span><span class="doc">ESTIMATE ${invoice.number}</span></div>
      <div class="sub">${fmtDate(invoice.date)} Â· ${customer?.name || "Customer"}</div>
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
      .hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.3mm solid #0f172a; padding-bottom: ${compact ? "1mm" : "2mm"}; margin-bottom: ${compact ? "1mm" : "2mm"}; }
      .org { font-weight: 700; font-size: ${compact ? "9.5px" : "16px"}; }
      .doc { font-weight: 700; font-size: ${compact ? "8px" : "13px"}; }
      .sub { font-size: ${compact ? "7px" : "11px"}; color: #475569; margin-bottom: ${compact ? "1.5mm" : "3mm"}; }
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
      case "customers": return <CustomersView customers={customers} openModal={openModal} removeCustomer={removeCustomer} />;
      case "items":     return <ItemsView items={items} openModal={openModal} currency={settings.currency} removeItem={removeItem} />;
      case "orders":    return <OrdersView orders={orders} items={items} openModal={openModal} markOrderReceived={markOrderReceived} removeOrder={removeOrder} />;
      case "challans":  return <DocumentList type="challan" docs={challans} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={removeDoc("challan")} updateStatus={updateDocStatus("challan")} />;
      case "estimates":  return (
        <div className="px-5 pt-1">
          {autoReminder && overdueCount > 0 && <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 flex items-center gap-2"><AlertCircle size={16} /> {overdueCount} estimate{overdueCount !== 1 ? "s" : ""} overdue.</div>}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            <span>Next print â†’ <b className="text-slate-700">top-{printSide}</b> corner</span>
            <button onClick={togglePrintSide} className="font-semibold text-blue-600">Switch side â‡„</button>
          </div>
          <div className="-mx-5">
            <DocumentList type="estimate" docs={estimates} customers={customers} currency={settings.currency} openModal={openModal}
              removeDoc={removeDoc("estimate")}
              updateStatus={updateDocStatus("estimate")}
              recordPayment={recordPaymentFor} onReturn={(doc: any) => openModal("return", { doc })} onShareInvoice={(inv: any) => setShareInvoice(inv)}
              onPrint={printEstimate}
              onEdit={(doc: any) => openModal("estimate", { editingDoc: doc })} />
          </div>
        </div>
      );
      case "payments":  return <PaymentsView payments={payments} customers={customers} currency={settings.currency} openModal={openModal} removePayment={removePayment} />;
      case "expenses":  return <ExpensesView expenses={expenses} currency={settings.currency} openModal={openModal} removeExpense={removeExpense} />;
      case "todo":      return <ToDoTrackingView items={items} settings={settings} />;
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
    if (type === "customer") return <FieldModal title="New Customer" fields={[
      { key: "name",     label: "Customer name",                     required: true, placeholder: "Acme Co." },
      { key: "email",    label: "Email",                             placeholder: "name@example.com" },
      { key: "phone",    label: "Phone (with country code)",         placeholder: "+91 98765 43210" },
      { key: "location", label: "Location / Address",                type: "location", placeholder: "City, area or full address" },
    ]} onClose={closeModal} onSave={saveCustomer} />;

    if (type === "item") return <FieldModal title="New Item" fields={[
      { key: "name",          label: "Item name",           required: true, placeholder: "Web design service" },
      { key: "sellingPrice",  label: "Selling price",       type: "number", required: true, placeholder: "0.00" },
      { key: "purchasePrice", label: "Purchase price",      type: "number", placeholder: "0.00" },
      { key: "unit",          label: "Unit",                placeholder: "hr / pc / job" },
      { key: "stock",         label: "Opening stock (qty)", type: "number", placeholder: "0" },
      { key: "lowStock",      label: "Low stock alert at",  type: "number", placeholder: `${LOW_STOCK_DEFAULT}` },
    ]} onClose={closeModal} onSave={saveItem} />;

    if (type === "expense") return <FieldModal title="Record Expense" fields={[
      { key: "category", label: "Category", required: true, placeholder: "Travel, Software..." },
      { key: "vendor",   label: "Vendor",   placeholder: "Optional" },
      { key: "amount",   label: "Amount",   type: "number", required: true, placeholder: "0.00" },
      { key: "date",     label: "Date",     type: "date" },
    ]} initial={{ date: today() }} onClose={closeModal} onSave={saveExpense} />;

    if (type === "order") return <OrderModal items={items} onClose={closeModal} onSave={saveOrder} />;

    if (type === "challan")
      return <ChallanModal onClose={closeModal} onSave={saveChallan} />;

    if (type === "estimate")
      return <DocumentModal type={type} customers={customers} items={items} estimates={estimates} editingDoc={payload?.editingDoc} onClose={closeModal} onSave={(v: any) => saveDocument(type, v)} />;

    if (type === "payment") {
      const invoiceOptions = estimates.filter((i) => i.status !== "Paid").map((i) => ({ value: i.id, label: `${i.number} â€” ${fmtMoney(i.total, settings.currency)}` }));
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
    return null;
  };

  const businessWa = settings.businessWhatsApp;
  const shareCustomer = shareInvoice ? customers.find((c) => c.id === shareInvoice.customerId) : null;
  const sharePayment = shareInvoice ? payments.find((p) => p.invoiceId === shareInvoice.id) : null;

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
        <Loader2 size={28} className="animate-spin" />
        <p className="text-sm font-medium">Loading your dataâ€¦</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <AlertCircle size={28} className="text-rose-500" />
        <p className="text-sm font-medium text-slate-700">{loadError}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Try again
        </button>
        <button onClick={onSignOut} className="text-xs font-medium text-slate-500">Sign out</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} active={view} onNav={setView} settings={settings} onSignOut={onSignOut} />
      <div className="flex-1 overflow-y-auto">
        <Topbar onMenu={() => setSidebarOpen(true)} settings={settings} view={view} />
        {renderView()}
      </div>

      <a href={businessWa ? waLink(businessWa, "Hi, I have a question about my account.") : "#settings"}
        onClick={(e) => { if (!businessWa) { e.preventDefault(); setView("settings"); showToast("Add a WhatsApp number in Settings first"); } }}
        target={businessWa ? "_blank" : undefined} rel="noreferrer"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition"
        style={{ backgroundColor: businessWa ? WHATSAPP_GREEN : "#94a3b8" }}>
        <Phone size={24} />
      </a>

      {renderModal()}

      {shareInvoice && (
        <InvoiceShareModal invoice={shareInvoice} customer={shareCustomer} items={items} settings={settings} payment={sharePayment} onClose={() => setShareInvoice(null)} />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg max-w-sm text-center">
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
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-xl font-bold text-slate-800">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mb-5 text-sm text-slate-500">Shree Balaji Traders</p>

        {mode === "register" && (
          <input
            className="mb-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="mb-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
          placeholder="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
          placeholder="PIN (4+ digits)"
          type="password"
          inputMode="numeric"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Please waitâ€¦" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-medium text-slate-500"
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
