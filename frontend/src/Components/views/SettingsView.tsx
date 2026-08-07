import React, { useState } from "react";
import { Phone, Plus, X, Download, Loader2, ShieldCheck } from "lucide-react";
import { Card, PillButton } from "../common/UIPrimitives";
import { ChangePinCard } from "./ChangePinCard";
import { StaffManagementCard } from "./StaffManagementCard";
import { WHATSAPP_GREEN, ITEM_CATEGORIES } from "../../lib/constants";
import { api } from "../../lib/api";

export function SettingsView({ settings, setSettings }: any) {
  const [local, setLocal] = useState({ itemCategories: ITEM_CATEGORIES, ...settings });
  const [newCategory, setNewCategory] = useState("");
  const [exporting, setExporting] = useState<"json" | "excel" | null>(null);
  const [exportError, setExportError] = useState("");
  const set = (k: string, v: any) => setLocal((s: any) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);

  const runExport = async (format: "json" | "excel") => {
    setExportError("");
    setExporting(format);
    try {
      if (format === "json") await api.dataExport.toJson();
      else await api.dataExport.toExcel();
    } catch (err: any) {
      setExportError(err.message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const categories: string[] = local.itemCategories?.length ? local.itemCategories : ITEM_CATEGORIES;
  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || categories.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    set("itemCategories", [...categories, name]);
    setNewCategory("");
  };
  const removeCategory = (name: string) => set("itemCategories", categories.filter((c) => c !== name));

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
        <h3 className="text-sm font-bold text-ink">Item categories</h3>
        <p className="text-xs text-ink/40">Used across Items, Orders and Inventory. Removing a category here won't change items already tagged with it.</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-ink/70">
              {c}
              <button type="button" onClick={() => removeCategory(c)} className="text-ink/30 hover:text-bad-500"><X size={12} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
            placeholder="New category name"
            className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm"
          />
          <button type="button" onClick={addCategory} disabled={!newCategory.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
            <Plus size={14} /> Add
          </button>
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Phone size={16} style={{ color: WHATSAPP_GREEN }} /><h3 className="text-sm font-bold text-ink">WhatsApp integration</h3></div>
        <div><label className="mb-1 block text-xs font-semibold text-ink/50">Business WhatsApp number (with country code)</label>
        <input value={local.businessWhatsApp} onChange={(e) => set("businessWhatsApp", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" /></div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-brand-500" /><h3 className="text-sm font-bold text-ink">Staff approval limit</h3></div>
        <p className="text-xs text-ink/40">
          A manual purchase a staff member creates above this amount waits for your approval instead of going through
          right away. Set to 0 to turn this off — your own purchases are never gated, regardless of this setting.
        </p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink/50">Approval limit ({local.currency || "₹"})</label>
          <input
            type="number"
            min={0}
            value={local.approvalThreshold ?? 0}
            onChange={(e) => set("approvalThreshold", Number(e.target.value))}
            placeholder="0 = disabled"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
        </div>
      </Card>
      <StaffManagementCard />
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-ink">Export your data</h3>
        <p className="text-xs text-ink/40">
          Download everything — customers, items, orders, expenses, payments, purchases, ledger entries and more —
          as a single file. Useful as a manual backup, or to work with your data in Excel.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => runExport("excel")}
            disabled={exporting !== null}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {exporting === "excel" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export to Excel
          </button>
          <button
            type="button"
            onClick={() => runExport("json")}
            disabled={exporting !== null}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold text-ink/70 disabled:opacity-40"
          >
            {exporting === "json" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export to JSON
          </button>
        </div>
        {exportError && <p className="text-xs font-medium text-bad-500">{exportError}</p>}
      </Card>
      <ChangePinCard />
      <PillButton disabled={!dirty} onClick={() => setSettings(local)} className="w-full justify-center">Save changes</PillButton>
    </div>
  );
}
