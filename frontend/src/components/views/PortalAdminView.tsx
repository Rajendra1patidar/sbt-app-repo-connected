import React, { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../../lib/api";

type Tab = "categories" | "items" | "schemes" | "media" | "whatsapp";
const TABS: { id: Tab; label: string }[] = [
  { id: "categories", label: "Categories" }, { id: "items", label: "Items" }, { id: "schemes", label: "Schemes" },
  { id: "media", label: "Media" }, { id: "whatsapp", label: "WhatsApp" },
];
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const btnCls = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50";
const toDateInput = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const emptyItem = { name: "", description: "", categoryId: "", photos: [] as string[], videoUrl: "", show: true, item: "" };

export function PortalAdminView({ settings, showToast }: any) {
  const [tab, setTab] = useState<Tab>("categories");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState<any>({ categories: [], schemes: [], heroVideoUrl: "" });
  const [items, setItems] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(emptyItem);

  useEffect(() => {
    api.portalAdmin.get()
      .then((r: any) => { setContent(r.content); setItems(r.items); setInventory(r.inventory); })
      .catch((e: any) => setError(e.message || "Could not load"))
      .finally(() => setLoading(false));
  }, []);

  const saveContent = async () => {
    setSaving(true); setError("");
    try {
      const saved = await api.portalAdmin.saveContent({
        heroVideoUrl: content.heroVideoUrl,
        categories: content.categories,
        schemes: content.schemes.map((s: any) => ({ ...s, startsAt: s.startsAt || null, endsAt: s.endsAt || null })),
      });
      setContent(saved); showToast?.("Customer portal saved");
    } catch (e: any) { setError(e.message || "Save failed"); } finally { setSaving(false); }
  };

  const saveItem = async () => {
    setSaving(true); setError("");
    try {
      const saved = await api.portalAdmin.saveItem({ ...draft, item: draft.item || null });
      setItems((list) => (draft._id ? list.map((i) => (i._id === saved._id ? saved : i)) : [saved, ...list]));
      setDraft(emptyItem); showToast?.("Portal item saved");
    } catch (e: any) { setError(e.message || "Save failed"); } finally { setSaving(false); }
  };

  const removeItem = async (id: string) => {
    if (!window.confirm("Remove this item from the customer portal?")) return;
    await api.portalAdmin.removeItem(id);
    setItems((l) => l.filter((i) => i._id !== id));
  };

  const setCat = (i: number, patch: any) => setContent((c: any) => ({ ...c, categories: c.categories.map((x: any, k: number) => (k === i ? { ...x, ...patch } : x)) }));
  const moveCat = (i: number, d: number) => setContent((c: any) => {
    const a = [...c.categories]; const j = i + d; if (j < 0 || j >= a.length) return c;
    [a[i], a[j]] = [a[j], a[i]]; return { ...c, categories: a };
  });
  const setScheme = (i: number, patch: any) => setContent((c: any) => ({ ...c, schemes: c.schemes.map((x: any, k: number) => (k === i ? { ...x, ...patch } : x)) }));
  const catName = (id: string) => content.categories.find((c: any) => String(c._id) === id)?.name || "—";

  if (loading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Customer Portal</h1>
      <p className="text-sm text-slate-600">What customers see after they log in. Prices are never shown; customers tap "Enquire for rate" to message you on WhatsApp.</p>
      <div className="flex gap-5 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`py-2.5 text-sm whitespace-nowrap ${tab === t.id ? "border-b-2 border-blue-600 font-semibold" : "text-slate-600"}`}>{t.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {tab === "categories" && (
        <div className="space-y-3 rounded-2xl bg-white p-4">
          {content.categories.map((c: any, i: number) => (
            <div key={c._id || i} className="flex flex-wrap items-center gap-2">
              <button aria-label="Move up" onClick={() => moveCat(i, -1)}><ArrowUp size={16} /></button>
              <button aria-label="Move down" onClick={() => moveCat(i, 1)}><ArrowDown size={16} /></button>
              <input aria-label="Category name" className={`${inputCls} flex-1 min-w-[140px]`} value={c.name} onChange={(e) => setCat(i, { name: e.target.value })} />
              <input aria-label="Cover image URL" className={`${inputCls} flex-1 min-w-[160px]`} placeholder="Cover image URL (https)" value={c.imageUrl || ""} onChange={(e) => setCat(i, { imageUrl: e.target.value })} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={c.visible !== false} onChange={(e) => setCat(i, { visible: e.target.checked })} /> Visible</label>
              <button aria-label="Delete category" onClick={() => setContent((x: any) => ({ ...x, categories: x.categories.filter((_: any, k: number) => k !== i) }))}><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className={btnCls} onClick={() => setContent((c: any) => ({ ...c, categories: [...c.categories, { name: "", imageUrl: "", visible: true }] }))}><Plus size={14} /> Add category</button>
            <button className={btnCls} disabled={saving} onClick={saveContent}>Save</button>
          </div>
        </div>
      )}

      {tab === "items" && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl bg-white p-4">
            <b>{draft._id ? "Edit portal item" : "Add portal item"}</b>
            <select aria-label="Pick from inventory" className={inputCls} value={draft.item || ""} onChange={(e) => {
              const inv = inventory.find((x) => x._id === e.target.value);
              setDraft((d: any) => ({ ...d, item: e.target.value, name: d.name || inv?.name || "" }));
            }}>
              <option value="">Pick from inventory (optional)</option>
              {inventory.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
            <input aria-label="Display name" className={inputCls} placeholder="Name shown to customers" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <textarea aria-label="Short description" className={inputCls} rows={2} placeholder="Short description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <select aria-label="Category" className={inputCls} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
              <option value="">Category…</option>
              {content.categories.filter((c: any) => c._id).map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <textarea aria-label="Photo URLs" className={inputCls} rows={3} placeholder="Photo URLs (https), one per line" value={(draft.photos || []).join("\n")} onChange={(e) => setDraft({ ...draft, photos: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean) })} />
            <input aria-label="Video URL" className={inputCls} placeholder="Video URL (https, optional)" value={draft.videoUrl} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.show} onChange={(e) => setDraft({ ...draft, show: e.target.checked })} /> Show on portal</label>
            <div className="flex gap-2"><button className={btnCls} disabled={saving || !draft.name.trim()} onClick={saveItem}>Save item</button>{draft._id && <button className="text-sm" onClick={() => setDraft(emptyItem)}>Cancel</button>}</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            {items.length === 0 && <p className="text-sm text-slate-600">No items yet. Only items you add here and mark "Show on portal" are visible to customers.</p>}
            {items.map((i) => (
              <div key={i._id} className="flex items-center gap-3 border-b border-slate-100 py-3 text-sm">
                <div className="flex-1"><div>{i.name}</div><div className="text-xs text-slate-600">{catName(i.categoryId)} · {i.photos?.length || 0} photos</div></div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.show ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{i.show ? "Shown" : "Hidden"}</span>
                <button className="text-blue-700" onClick={() => setDraft({ ...emptyItem, ...i, item: i.item || "" })}>Edit</button>
                <button aria-label="Remove" onClick={() => removeItem(i._id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "schemes" && (
        <div className="space-y-3 rounded-2xl bg-white p-4">
          {content.schemes.map((s: any, i: number) => (
            <div key={s._id || i} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-[2fr_3fr_1fr_1fr_auto_auto]">
              <input aria-label="Scheme title" className={inputCls} placeholder="Title" value={s.title} onChange={(e) => setScheme(i, { title: e.target.value })} />
              <input aria-label="Description" className={inputCls} placeholder="Description" value={s.description || ""} onChange={(e) => setScheme(i, { description: e.target.value })} />
              <input aria-label="Starts" type="date" className={inputCls} value={toDateInput(s.startsAt)} onChange={(e) => setScheme(i, { startsAt: e.target.value })} />
              <input aria-label="Ends" type="date" className={inputCls} value={toDateInput(s.endsAt)} onChange={(e) => setScheme(i, { endsAt: e.target.value })} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={s.active !== false} onChange={(e) => setScheme(i, { active: e.target.checked })} /> Active</label>
              <button aria-label="Delete scheme" onClick={() => setContent((c: any) => ({ ...c, schemes: c.schemes.filter((_: any, k: number) => k !== i) }))}><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className={btnCls} onClick={() => setContent((c: any) => ({ ...c, schemes: [...c.schemes, { title: "", description: "", active: true }] }))}><Plus size={14} /> Add scheme</button>
            <button className={btnCls} disabled={saving} onClick={saveContent}>Save</button>
          </div>
          <p className="text-xs text-slate-600">Customers see a scheme only while it is active and today falls between its start and end dates.</p>
        </div>
      )}

      {tab === "media" && (
        <div className="space-y-3 rounded-2xl bg-white p-4">
          <label className="text-sm" htmlFor="hero">Shop walkthrough video URL (https)</label>
          <input id="hero" className={inputCls} value={content.heroVideoUrl || ""} onChange={(e) => setContent({ ...content, heroVideoUrl: e.target.value })} />
          <button className={btnCls} disabled={saving} onClick={saveContent}>Save</button>
          <p className="text-xs text-slate-600">Paste links for now. Direct upload to Firebase Storage comes with the portal project.</p>
        </div>
      )}

      {tab === "whatsapp" && (
        <div className="rounded-2xl bg-white p-4 text-sm">
          Enquiries go to: <b>{settings.businessWhatsApp || "not set"}</b>
          <p className="mt-2 text-xs text-slate-600">Change this number in Settings (Business WhatsApp).</p>
        </div>
      )}
    </div>
  );
}
