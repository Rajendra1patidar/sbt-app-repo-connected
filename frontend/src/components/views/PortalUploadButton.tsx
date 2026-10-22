import React, { useRef, useState } from "react";
import { Upload, Loader2, Link2 } from "lucide-react";
import { uploadPortalFile } from "../../lib/portalUpload";

const matches = (file: File, accept: string) => accept.split(",").some((t) => t.trim() === file.type);

/** Pick files from your computer (or drag them in) → uploads to Cloudinary → reports the resulting URLs. */
export function PortalUploadButton({ label, accept, multiple, onUploaded }: {
  label: string; accept: string; multiple?: boolean; onUploaded: (urls: string[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const run = async (files: File[]) => {
    if (!files.length) return;
    const ok = files.filter((f) => matches(f, accept));
    if (!ok.length) { setError("That file type isn't allowed here."); return; }
    setBusy(true); setError("");
    const urls: string[] = [];
    try {
      for (const f of multiple ? ok : ok.slice(0, 1)) { setPct(0); urls.push(await uploadPortalFile(f, setPct)); }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
      if (urls.length) onUploaded(urls);
    }
  };

  return (
    <div
      className={`inline-flex flex-col gap-1 rounded-xl border-2 border-dashed p-2 transition ${over ? "border-blue-600 bg-blue-50" : "border-slate-300"}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); run(Array.from(e.dataTransfer.files)); }}
    >
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-60">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {busy ? `Uploading ${pct}%` : label}
      </button>
      <span className="px-1 text-[11px] text-slate-500">…or drag files here from your computer</span>
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; run(f); }} />
      {error && <span role="alert" className="max-w-xs px-1 text-xs text-red-700">{error}</span>}
    </div>
  );
}

/** Optional: add media that already lives online by pasting its https link. */
export function AddByLink({ placeholder, onAdd }: { placeholder: string; onAdd: (url: string) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const add = () => {
    if (!/^https:\/\//i.test(v.trim())) { setErr("Link must start with https://"); return; }
    onAdd(v.trim()); setV(""); setErr("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Link2 size={14} className="text-slate-500" />
        <input aria-label={placeholder} className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <button type="button" onClick={add} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Add</button>
      </div>
      {err && <span role="alert" className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
