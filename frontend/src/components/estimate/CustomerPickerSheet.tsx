import { useMemo, useState } from "react";
import { QuickAddCustomerPopup } from "../modals/QuickAddCustomerPopup";
import { CheckIcon, PlusIcon } from "../ui/icons";
import { Avatar, Group, GroupRow, SearchField, Sheet, TextButton } from "../ui/kit";
import { inrCompact } from "../../lib/money";

/** Choose who the estimate is for. Search by name, place or phone; add a new customer without leaving. */
export function CustomerPickerSheet({ customers, owes, selectedId, currency, onPick, onClose, onQuickAddCustomer }: {
  customers: any[]; owes: Map<string, number>; selectedId?: string; currency: string;
  onPick: (customer: any) => void; onClose: () => void; onQuickAddCustomer?: (v: any) => Promise<any>;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...customers].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!q) return base.slice(0, 80);
    return base.filter((c) => [c.name, c.location, c.phone].some((s) => String(s || "").toLowerCase().includes(q))).slice(0, 80);
  }, [customers, query]);

  return (
    <>
      <Sheet canvas z={60} tall onClose={onClose} title="Customer" trailing={<TextButton onClick={onClose} className="-mr-1 px-1">Done</TextButton>}>
        <SearchField value={query} onChange={setQuery} placeholder="Search customers" className="!h-11 mt-1.5" />
        <Group className="mt-3.5">
          {onQuickAddCustomer && (
            <GroupRow onClick={() => setAdding(true)} className="h-14">
              <div className="flex items-center gap-3 text-brand-500">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-500"><PlusIcon size={18} /></span>
                <span className="text-[16px] font-medium">{query.trim() ? `New customer “${query.trim()}”` : "New customer"}</span>
              </div>
            </GroupRow>
          )}
          {list.map((c) => {
            const owed = owes.get(c.id) || 0;
            return (
              <GroupRow key={c.id} onClick={() => onPick(c)} className="min-h-[60px] py-2">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium text-ink">{c.name}</p>
                    <p className="truncate text-caption text-mute">{[c.location, c.phone].filter(Boolean).join(", ") || "No details"}</p>
                  </div>
                  {owed > 0 && <span className="shrink-0 text-caption tabular-nums text-mute">Owes {inrCompact(owed, currency)}</span>}
                  {selectedId === c.id && <CheckIcon size={20} className="shrink-0 text-brand-500" />}
                </div>
              </GroupRow>
            );
          })}
          {list.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-mute">No customer matches.</p>}
        </Group>
        <div className="h-3" />
      </Sheet>
      {adding && onQuickAddCustomer && (
        <QuickAddCustomerPopup saving={saving} onCancel={() => setAdding(false)}
          onSave={async (v: any) => {
            setSaving(true);
            try {
              const c = await onQuickAddCustomer(v);
              if (c) { setAdding(false); onPick(c); }
            } finally { setSaving(false); }
          }} />
      )}
    </>
  );
}
