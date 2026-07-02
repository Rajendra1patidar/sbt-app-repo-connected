import React, { useState, useRef, useEffect } from "react";
import {
  Menu, X, Home, Users, ShoppingBag, FileText, Truck, Receipt,
  ArrowDownToLine, Wallet, BarChart3, Globe2, Settings as SettingsIcon,
  Bell, LifeBuoy, Plus, Trash2, Phone, ChevronDown, Sparkles, RotateCcw,
  Send, Check, CheckCircle2, AlertCircle, ArrowRight, MessageSquare,
  Search, MapPin, PackageCheck, ClipboardList, ChevronUp, AlertTriangle,
  ShoppingCart, Loader2
} from "lucide-react";
import { api } from "../lib/api";

/* ---- helpers ---- */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const WHATSAPP_GREEN = "#25D366";
const LOW_STOCK_DEFAULT = 5;

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
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-blue-100 text-blue-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Declined: "bg-rose-100 text-rose-700",
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
  { id: "quotes",     label: "Quotes",               icon: FileText },
  { id: "challans",   label: "Delivery Challans",    icon: Truck },
  { id: "invoices",   label: "Invoices",             icon: Receipt },
  { id: "payments",   label: "Payments Received",    icon: ArrowDownToLine },
  { id: "expenses",   label: "Expenses",             icon: Wallet },
  { id: "todo",       label: "To-Do Tracking",       icon: ClipboardList },
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
    </div>
  );
}

/* ---- ItemSearchSelect ---- */

function ItemSearchSelect({ items, value, onChange }: { items: any[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = items.find((it: any) => it.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? items.filter((it: any) => it.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-2 py-2 text-sm text-left bg-white">
        <span className="truncate">{selected ? `${selected.name} (stock: ${selected.stock ?? 0})` : "Select item..."}</span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
          <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">No items match.</p>
          ) : (
            filtered.map((it: any) => (
              <button key={it.id} type="button" onClick={() => { onChange(it.id); setQuery(""); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${it.id === value ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700"}`}>
                {it.name} <span className="text-xs text-slate-400">(stock: {it.stock ?? 0})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ---- DocumentModal ---- */

function DocumentModal({ type, customers, items, onClose, onSave }: any) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [lines, setLines] = useState([{ itemId: items[0]?.id || "", qty: 1 }]);
  const [notes, setNotes] = useState("");
  const [freightCost, setFreightCost] = useState("");
  const [labourCost, setLabourCost] = useState("");

  const addLine = () => setLines((l) => [...l, { itemId: items[0]?.id || "", qty: 1 }]);
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => items.find((it: any) => it.id === id);
  const itemsSubtotal = lines.reduce((sum, ln) => {
    const it = itemById(ln.itemId);
    return sum + (it ? (it.sellingPrice ?? it.price) * Number(ln.qty || 0) : 0);
  }, 0);
  const extraCharges = type === "invoice" ? (Number(freightCost) || 0) + (Number(labourCost) || 0) : 0;
  const total = itemsSubtotal + extraCharges;

  const titleMap: any = { quote: "New Quote", invoice: "New Invoice", challan: "New Delivery Challan" };
  const canSave = customerId && lines.length > 0 && lines.every((l) => l.itemId);

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
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">{type === "challan" ? "Delivery date" : "Date"}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </div>
              {type !== "challan" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">{type === "quote" ? "Valid until" : "Due date"}</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500">Items *</label>
                <button onClick={addLine} className="text-xs font-semibold text-blue-600">+ Add line</button>
              </div>
              <div className="space-y-2">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <ItemSearchSelect items={items} value={ln.itemId} onChange={(id) => updateLine(i, { itemId: id })} />
                      <input type="number" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="w-16 rounded-xl border border-slate-200 px-2 py-2 text-sm" />
                      {it && Number(ln.qty) > (it.stock ?? 0) && <span title="Exceeds stock"><AlertTriangle size={14} className="text-amber-500 shrink-0" /></span>}
                      {lines.length > 1 && <button onClick={() => removeLine(i)} className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>}
                    </div>
                  );
                })}
              </div>
            </div>
            {type === "invoice" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Freight cost</label>
                  <input type="number" min="0" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Labour cost</label>
                  <input type="number" min="0" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>
            <div className="space-y-1.5 rounded-xl bg-slate-50 px-4 py-3">
              {extraCharges > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500"><span>Items subtotal</span><span>{itemsSubtotal.toFixed(2)}</span></div>
                  {Number(freightCost) > 0 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Freight</span><span>{Number(freightCost).toFixed(2)}</span></div>}
                  {Number(labourCost) > 0 && <div className="flex items-center justify-between text-xs text-slate-500"><span>Labour</span><span>{Number(labourCost).toFixed(2)}</span></div>}
                  <div className="my-1 border-t border-slate-200" />
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
          <button disabled={!canSave} onClick={() => canSave && onSave({ customerId, date, dueDate, lines, notes, total, ...(type === "invoice" ? { freightCost: Number(freightCost) || 0, labourCost: Number(labourCost) || 0 } : {}) })}
            className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">Save {type}</button>
        </div>
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

/* ---- InvoiceShareModal ---- */

function InvoiceShareModal({ invoice, customer, items, settings, payment, onClose }: any) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isOverdue = invoice.status !== "Paid" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const statusLabel = invoice.status === "Paid" ? "PAID" : isOverdue ? "OVERDUE" : "DUE";
  const statusColor = invoice.status === "Paid" ? "#10b981" : isOverdue ? "#e11d48" : "#d97706";

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const W = 900;
    const rowH = 42;
    const lineCount = (invoice.lines || []).length;
    const H = 660 + lineCount * rowH;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, 10);
    let y = 70;
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 32px Arial"; ctx.fillText(settings.orgName || "Your Business", 60, y);
    ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(settings.email || "", 60, y + 24);
    ctx.textAlign = "right"; ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText("INVOICE", W - 60, y - 6);
    ctx.font = "15px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(invoice.number, W - 60, y + 22); ctx.textAlign = "left";
    y += 70; ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
    y += 40; ctx.font = "bold 13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText("BILLED TO", 60, y);
    y += 24; ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(customer?.name || "Customer", 60, y);
    let billY = y;
    if (customer?.phone) { billY += 22; ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(customer.phone, 60, billY); }
    if (customer?.location) { billY += 20; ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText(customer.location, 60, billY); }
    const dateTop = y - 24;
    ctx.textAlign = "right"; ctx.font = "13px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText("INVOICE DATE", W - 60, dateTop);
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
      const name = it?.name || "Item"; const qty = Number(ln.qty || 0); const price = it?.price || 0; const amount = qty * price;
      y += rowH; ctx.strokeStyle = "#f1f5f9"; ctx.beginPath(); ctx.moveTo(60, y - rowH + 8); ctx.lineTo(W - 60, y - rowH + 8); ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.fillText(name.length > 28 ? name.slice(0, 27) + "…" : name, 76, y - 8);
      ctx.fillText(String(qty), W - 330, y - 8); ctx.fillText(fmtMoney(price, settings.currency), W - 230, y - 8); ctx.fillText(fmtMoney(amount, settings.currency), W - 120, y - 8);
    });
    y += 50; ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke(); y += 40;
    ctx.textAlign = "right"; ctx.font = "bold 16px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText("TOTAL", W - 220, y);
    ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a"; ctx.fillText(fmtMoney(invoice.total, settings.currency), W - 60, y); ctx.textAlign = "left";
    y += 50;
    if (invoice.status === "Paid") {
      ctx.fillStyle = "#ecfdf5"; ctx.fillRect(60, y, W - 120, 50); ctx.fillStyle = "#10b981"; ctx.font = "bold 16px Arial";
      ctx.fillText(`✓ Payment received${payment ? " on " + fmtDate(payment.date) : ""}`, 80, y + 32);
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
    ? `Hi ${customer?.name || ""}, thank you! Your payment for invoice ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) has been received.`
    : `Hi ${customer?.name || ""}, your invoice ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} is due on ${fmtDate(invoice.dueDate)}.`;
  const smsMsg = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, payment for invoice ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) received. Thank you! - ${settings.orgName}`
    : `Hi ${customer?.name || ""}, invoice ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} due ${fmtDate(invoice.dueDate)}. - ${settings.orgName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Share invoice</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          {imgUrl ? <img src={imgUrl} alt={`Invoice ${invoice.number}`} className="block h-auto w-full" />
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
  const { customers, invoices, quotes, expenses, items } = data;
  const [tab, setTab] = useState("invoices");
  const outstanding = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + i.total, 0);
  const byCategory: any = {};
  expenses.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
  const catEntries = Object.entries(byCategory) as [string, number][];
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0);
  const lowStockItems = items.filter((it: any) => (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT));

  const quickActions = [
    { label: "New Invoice", icon: Receipt, bg: "bg-blue-100", fg: "text-blue-600", action: () => openModal("invoice") },
    { label: "New Customer", icon: Users, bg: "bg-emerald-100", fg: "text-emerald-600", action: () => openModal("customer") },
    { label: "New Expense", icon: Wallet, bg: "bg-rose-100", fg: "text-rose-600", action: () => openModal("expense") },
    { label: "New Order", icon: ShoppingCart, bg: "bg-amber-100", fg: "text-amber-600", action: () => openModal("order") },
  ];

  const recentMap: any = { invoices, quotes, expenses };
  const recent = recentMap[tab].slice(-5).reverse();

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
        <PillButton className="mt-4" onClick={() => openModal("invoice")}><Plus size={16} /> Create Invoice</PillButton>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-slate-700">
          <RotateCcw size={16} /> <h3 className="text-base font-bold">Recent Transactions</h3>
        </div>
        <div className="mb-4 flex gap-2">
          {["invoices", "quotes", "expenses"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>{t}</button>
          ))}
        </div>
        {recent.length === 0 ? (
          <EmptyState text={`No ${tab} yet.`} cta={`Create ${tab === "invoices" ? "Invoice" : tab === "quotes" ? "Quote" : "Expense"}`}
            onCta={() => openModal(tab === "invoices" ? "invoice" : tab === "quotes" ? "quote" : "expense")} />
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
              {c.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><MapPin size={11} /> {c.location}</p>}
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
                {[...received].reverse().map((o: any) => (
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

function DocumentList({ type, docs, customers, currency, openModal, removeDoc, updateStatus, convertQuote, recordPayment, onShareInvoice }: any) {
  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Unknown";
  const customerPhone = (id: string) => customers.find((c: any) => c.id === id)?.phone;
  const labelMap: any = { quote: "Quote", invoice: "Invoice", challan: "Challan" };
  const emptyMap: any = {
    quote: "Create quotes to send price estimates to customers.",
    invoice: "Create invoices to start receiving payments.",
    challan: "Create delivery challans to track goods sent.",
  };
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-slate-400">{docs.length} {labelMap[type].toLowerCase()}{docs.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal(type)}><Plus size={16} /> New {labelMap[type]}</PillButton>
      </div>
      {docs.length === 0
        ? <Card><EmptyState text={emptyMap[type]} cta={`New ${labelMap[type]}`} onCta={() => openModal(type)} /></Card>
        : [...docs].reverse().map((d: any) => {
          const isOverdue = type === "invoice" && d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date();
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {type !== "challan" && (
                  <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    {(type === "quote" ? ["Draft","Sent","Accepted","Declined"] : ["Draft","Sent","Paid"]).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {type === "quote" && d.status === "Accepted" && <GhostButton onClick={() => convertQuote(d)}><ArrowRight size={13} /> Convert to invoice</GhostButton>}
                {type === "invoice" && d.status !== "Paid" && <GhostButton onClick={() => recordPayment(d)}><CheckCircle2 size={13} /> Record payment</GhostButton>}
                {type === "invoice"
                  ? <button onClick={() => onShareInvoice(d)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98]" style={{ backgroundColor: WHATSAPP_GREEN }}><Phone size={13} /> Share invoice</button>
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
        : [...payments].reverse().map((p: any) => (
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
        : [...expenses].reverse().map((e: any) => (
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

function ToDoTrackingView({ items }: any) {
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
                  <p className="text-xs text-slate-500">{it.unit || "unit"} · Alert threshold: {it.lowStock ?? LOW_STOCK_DEFAULT}</p>
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

      {/* Full inventory — collapsible */}
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
          {inventoryOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
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
                      <p className="text-xs text-slate-400">/ alert ≤{it.lowStock ?? LOW_STOCK_DEFAULT}</p>
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

function ReportsView({ data, currency }: any) {
  const { invoices, payments, expenses, customers } = data;
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const totalInvoiced = invoices.reduce((s: number, i: any) => s + i.total, 0);
  const totalReceived = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const outstanding = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + i.total, 0);
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

  return (
    <div className="space-y-4 px-5 pb-28">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (<Card key={s.label}><p className="text-xs font-semibold text-slate-400">{s.label}</p><p className={`mt-1 text-xl font-bold ${s.color}`}>{fmtMoney(s.value, currency)}</p></Card>))}
      </div>
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-900">Invoices by status</h3>
        {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-slate-400">No invoices yet.</p>
          : <ul className="space-y-2">{Object.entries(statusCounts).map(([s, c]) => (<li key={s} className="flex items-center justify-between text-sm"><Badge status={s} /><span className="font-semibold text-slate-700">{c}</span></li>))}</ul>}
      </Card>
      <Card><p className="text-xs font-semibold text-slate-400">Total Customers</p><p className="mt-1 text-xl font-bold text-slate-900">{customers.length}</p></Card>

      {/* Search by name */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-blue-500" /><h3 className="text-base font-bold text-slate-900">Search invoices by customer name</h3></div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Type customer name..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        {trimmedName && (
          <div className="mt-3">
            {nameMatchedInvoices.length === 0
              ? <p className="text-sm text-slate-400">{nameMatchedCustomers.length === 0 ? `No customer matching "${nameQuery}".` : "Customer found but no invoices yet."}</p>
              : <ul className="divide-y divide-slate-100">
                {nameMatchedInvoices.map((inv: any) => {
                  const c = customers.find((cu: any) => cu.id === inv.customerId);
                  return (<li key={inv.id} className="py-3"><div className="flex items-start justify-between"><div><p className="font-semibold text-slate-900">{inv.number}</p><p className="text-xs text-slate-500">{c?.name} · {fmtDate(inv.date)}</p>{c?.location && <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={10} /> {c.location}</p>}</div><div className="text-right"><p className="font-bold text-slate-800">{fmtMoney(inv.total, currency)}</p><Badge status={inv.status} /></div></div></li>);
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
                        <div className="text-right"><p className="text-xs text-slate-400">{custInvoices.length} invoice{custInvoices.length !== 1 ? "s" : ""}</p><p className="font-bold text-slate-800">{fmtMoney(custTotal, currency)}</p></div>
                      </div>
                      {custInvoices.length > 0 && <ul className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100">{custInvoices.map((inv: any) => (<li key={inv.id} className="flex items-center justify-between text-xs text-slate-500"><span>{inv.number} · {fmtDate(inv.date)}</span><span className="flex items-center gap-2">{fmtMoney(inv.total, currency)}<Badge status={inv.status} /></span></li>))}</ul>}
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
      itemMap[it.id].amount += qty * (it.sellingPrice ?? it.price ?? 0);
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
      `🧾 Invoices raised: ${totalInvoices}`,
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
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Send size={18} className="text-blue-600" /></div>
          <div>
            <h3 className="font-bold text-slate-900">Daily Sales Report</h3>
            <p className="text-xs text-slate-400">{fmtDate(todayStr)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm text-slate-400">No invoices created today yet.</p>
            <p className="text-xs text-slate-300 mt-1">Create an invoice and it will appear here.</p>
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

/* ---- Advanced Billing ---- */

function AdvancedBillingView({ autoReminder, setAutoReminder, overdueCount, settings }: any) {
  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">WhatsApp payment reminders</h3>
            <p className="mt-1 text-sm text-slate-400">Show a banner for overdue invoices with one-tap WhatsApp messaging.</p>
          </div>
          <button onClick={() => setAutoReminder((v: boolean) => !v)} className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition ${autoReminder ? "bg-emerald-500" : "bg-slate-200"}`}>
            <span className={`block h-6 w-6 rounded-full bg-white transition ${autoReminder ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {autoReminder && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Enabled — {overdueCount} overdue invoice{overdueCount !== 1 ? "s" : ""} will be flagged.</p>}
      </Card>
      <Card>
        <h3 className="text-base font-bold text-slate-900">Recurring invoices</h3>
        <p className="mt-1 text-sm text-slate-400">Set up retainer or subscription billing.</p>
        <EmptyState text="No recurring profiles yet." />
      </Card>
      <Card>
        <h3 className="text-base font-bold text-slate-900">Business WhatsApp number</h3>
        <p className="mt-1 text-sm text-slate-400">{settings.businessWhatsApp ? `Connected: ${settings.businessWhatsApp}` : "Not set — add one in Settings."}</p>
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
  const MAX = 4;

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm tracking-[0.4em] text-center font-bold";

  const handleCurrent = () => {
    if (cur.length < MAX) return;
    if (cur !== (localStorage.getItem("invoice_app_pin") || "")) {
      setMsg({ text: "Current PIN is incorrect.", ok: false });
      setCur(""); return;
    }
    setMsg(null); setMode("new");
  };
  const handleNew = () => {
    if (next.length < MAX) return;
    setMsg(null); setMode("confirm");
  };
  const handleConfirm = (val: string) => {
    if (val.length < MAX) return;
    if (val !== next) { setMsg({ text: "PINs don't match. Try again.", ok: false }); setNext(""); setMode("new"); return; }
    localStorage.setItem("invoice_app_pin", val);
    setMsg({ text: "PIN changed successfully!", ok: true });
    setCur(""); setNext(""); setMode("idle");
  };

  const numOnly = (v: string) => v.replace(/\D/g, "").slice(0, MAX);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><SettingsIcon size={14} className="text-slate-600" /></div>
        <h3 className="text-sm font-bold text-slate-900">Change PIN</h3>
      </div>
      {msg && <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</p>}

      {mode === "idle" && (
        <button onClick={() => { setMode("current"); setMsg(null); }}
          className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
          Change my PIN
        </button>
      )}
      {mode === "current" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500">Enter current PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={cur} onChange={(e) => setCur(numOnly(e.target.value))} placeholder="••••" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-500">Cancel</button>
            <button disabled={cur.length < MAX} onClick={handleCurrent} className="flex-1 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500">Enter new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={next} onChange={(e) => setNext(numOnly(e.target.value))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-500">Cancel</button>
            <button disabled={next.length < MAX} onClick={handleNew} className="flex-1 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500">Confirm new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} placeholder="••••" className={inputCls} autoFocus
            onChange={(e) => { const v = numOnly(e.target.value); if (v.length === MAX) handleConfirm(v); }} />
          <button onClick={() => setMode("idle")} className="w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-500">Cancel</button>
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
          <div key={k}><label className="mb-1 block text-xs font-semibold text-slate-500">{l}</label>
          <input value={(local as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={p} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></div>
        ))}
        <div><label className="mb-1 block text-xs font-semibold text-slate-500">Currency symbol</label>
        <select value={local.currency} onChange={(e) => set("currency", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          {["₹","$","€","£"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Phone size={16} style={{ color: WHATSAPP_GREEN }} /><h3 className="text-sm font-bold text-slate-900">WhatsApp integration</h3></div>
        <div><label className="mb-1 block text-xs font-semibold text-slate-500">Business WhatsApp number (with country code)</label>
        <input value={local.businessWhatsApp} onChange={(e) => set("businessWhatsApp", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></div>
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
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => {
            if (k === "") return <div key={i} />;
            const isDelete = k === "⌫";
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
  const [toast, setToast] = useState<string | null>(null);
  const [autoReminder, setAutoReminder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [settings, setSettings] = useState({
    orgName: "SHREE BALAJI TRADERS", ownerName: "SBT", email: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI", currency: "₹", businessWhatsApp: "",
  });

  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const closeModal = () => setModal(null);
  const nextNumber = (list: any[], prefix: string) => `${prefix}-${String(list.length + 1).padStart(4, "0")}`;

  /* ---- initial load from backend ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, it, o, q, inv, ch, ex, pay, st] = await Promise.all([
          api.customers.list(),
          api.items.list(),
          api.orders.list(),
          api.documents("quote").list(),
          api.documents("invoice").list(),
          api.documents("challan").list(),
          api.expenses.list(),
          api.payments.list(),
          api.settings.get(),
        ]);
        if (cancelled) return;
        setCustomers(c); setItems(it); setOrders(o); setQuotes(q);
        setInvoices(inv); setChallans(ch); setExpenses(ex); setPayments(pay);
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
      const doc = await api.customers.create(v);
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

  const docSetter = (type: string) => (type === "quote" ? setQuotes : type === "invoice" ? setInvoices : setChallans);

  const saveDocument = async (type: string, v: any) => {
    try {
      const payload = {
        customerId: v.customerId, date: v.date, dueDate: v.dueDate, lines: v.lines, notes: v.notes, total: v.total,
        ...(v.freightCost !== undefined ? { freightCost: v.freightCost } : {}),
        ...(v.labourCost !== undefined ? { labourCost: v.labourCost } : {}),
      };
      const { doc, lowStock } = await api.documents(type as any).create(payload);
      docSetter(type)((l: any[]) => [doc, ...l]);

      if (type === "invoice") {
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
      await api.documents(type as any).updateStatus(id, s);
      docSetter(type)((list: any[]) => list.map((x) => (x.id === id ? { ...x, status: s } : x)));
    } catch (err) { onApiError(err, "Failed to update status"); }
  };

  const savePayment = async (v: any) => {
    try {
      const doc = await api.payments.create(v);
      setPayments((p) => [doc, ...p]);
      if (v.invoiceId) setInvoices((list) => list.map((i) => (i.id === v.invoiceId ? { ...i, status: "Paid" } : i)));
      showToast("Payment recorded");
      closeModal();
    } catch (err) { onApiError(err, "Failed to record payment"); }
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
  const convertQuote = async (quote: any) => {
    try {
      const invoice = await api.documents("quote").convert(quote.id);
      setInvoices((list) => [invoice, ...list]);
      showToast(`Converted ${quote.number} to invoice`);
    } catch (err) { onApiError(err, "Failed to convert quote"); }
  };

  const saveSettings = async (s: any) => {
    try {
      const doc = await api.settings.update(s);
      setSettings((prev) => ({ ...prev, ...doc }));
      showToast("Settings saved");
    } catch (err) { onApiError(err, "Failed to save settings"); }
  };

  const overdueCount = invoices.filter((i) => i.status !== "Paid" && i.dueDate && new Date(i.dueDate) < new Date()).length;
  const data = { customers, items, orders, quotes, invoices, challans, expenses, payments };

  /* ---- view renderer ---- */
  const renderView = () => {
    switch (view) {
      case "dashboard": return <Dashboard data={data} settings={settings} openModal={openModal} go={setView} />;
      case "customers": return <CustomersView customers={customers} openModal={openModal} removeCustomer={removeCustomer} />;
      case "items":     return <ItemsView items={items} openModal={openModal} currency={settings.currency} removeItem={removeItem} />;
      case "orders":    return <OrdersView orders={orders} items={items} openModal={openModal} markOrderReceived={markOrderReceived} removeOrder={removeOrder} />;
      case "quotes":    return <DocumentList type="quote" docs={quotes} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={removeDoc("quote")} updateStatus={updateDocStatus("quote")} convertQuote={convertQuote} />;
      case "challans":  return <DocumentList type="challan" docs={challans} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={removeDoc("challan")} updateStatus={updateDocStatus("challan")} />;
      case "invoices":  return (
        <div className="px-5 pt-1">
          {autoReminder && overdueCount > 0 && <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 flex items-center gap-2"><AlertCircle size={16} /> {overdueCount} invoice{overdueCount !== 1 ? "s" : ""} overdue.</div>}
          <div className="-mx-5">
            <DocumentList type="invoice" docs={invoices} customers={customers} currency={settings.currency} openModal={openModal}
              removeDoc={removeDoc("invoice")}
              updateStatus={updateDocStatus("invoice")}
              recordPayment={recordPaymentFor} onShareInvoice={(inv: any) => setShareInvoice(inv)} />
          </div>
        </div>
      );
      case "payments":  return <PaymentsView payments={payments} customers={customers} currency={settings.currency} openModal={openModal} removePayment={removePayment} />;
      case "expenses":  return <ExpensesView expenses={expenses} currency={settings.currency} openModal={openModal} removeExpense={removeExpense} />;
      case "todo":      return <ToDoTrackingView items={items} />;
      case "reports":      return <ReportsView data={data} currency={settings.currency} />;
      case "sharereport":  return <ShareReportView invoices={invoices} items={items} customers={customers} currency={settings.currency} settings={settings} />;
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
      { key: "location", label: "Location / Address",                placeholder: "City, area or full address" },
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

    if (type === "quote" || type === "invoice")
      return <DocumentModal type={type} customers={customers} items={items} onClose={closeModal} onSave={(v: any) => saveDocument(type, v)} />;

    if (type === "payment") {
      const invoiceOptions = invoices.filter((i) => i.status !== "Paid").map((i) => ({ value: i.id, label: `${i.number} — ${fmtMoney(i.total, settings.currency)}` }));
      const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
      return <FieldModal title="Record Payment" fields={[
        { key: "customerId", label: "Customer", type: "select", options: customerOptions, required: true },
        { key: "invoiceId",  label: "Against invoice", type: "select", options: [{ value: "", label: "No specific invoice" }, ...invoiceOptions] },
        { key: "amount",     label: "Amount",  type: "number", required: true },
        { key: "method",     label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",       label: "Date",    type: "date" },
      ]} initial={{ date: today(), customerId: payload?.customerId || "", invoiceId: payload?.invoiceId || "", amount: payload?.amount || "" }} onClose={closeModal} onSave={savePayment} />;
    }
    return null;
  };

  const businessWa = settings.businessWhatsApp;
  const shareCustomer = shareInvoice ? customers.find((c) => c.id === shareInvoice.customerId) : null;
  const sharePayment = shareInvoice ? [...payments].reverse().find((p) => p.invoiceId === shareInvoice.id) : null;

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
        <Loader2 size={28} className="animate-spin" />
        <p className="text-sm font-medium">Loading your data…</p>
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
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
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
}
