import { useMemo, useState } from "react";
import { Pagination } from "../common/Pagination";
import { CustomerPortalSharePopup } from "../modals/CustomerPortalSharePopup";
import { ActionRow, EmptyNote } from "../ui/blocks";
import { ArchiveIcon, EditIcon, KeyIcon, MessageIcon, MoreIcon, WhatsAppIcon } from "../ui/icons";
import { Avatar, Group, GroupLabel, GroupRow, IconButton, SearchField, Segmented, Sheet, StatusChip, TextButton } from "../ui/kit";
import { usePagination } from "../../hooks/usePagination";
import { PAGE_SIZE } from "../../lib/constants";
import { smsLink, waLink } from "../../lib/contactLinks";
import { estimateState, localToday } from "../../lib/estimates";
import { inr, inrCompact } from "../../lib/money";

/* ---- Customers ----
 * Customers are archived, never deleted. An archived customer is out of this list (and out of the
 * pickers and the capture bar) but keeps every bill and payment; the Archived tab brings them back.
 * Only the owner archives or restores, so staff never see the tab or the action.
 *
 * One quiet row per customer: tap it to open the customer. The things you can do without opening
 * them (WhatsApp, SMS, share the account link, edit, archive) are behind the "..." on the row. */

const greeting = (name: string) => `Hi ${name}, reaching out from ${name}'s account.`;

export function CustomersView({ customers, openModal, removeCustomer, restoreCustomer, role, estimates, onSelectCustomer, currency = "₹" }: any) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [portalCustomer, setPortalCustomer] = useState<any>(null);
  const [actionsFor, setActionsFor] = useState<any>(null);
  const isStaff = role === "staff";
  const todayStr = localToday();

  // What each customer owes (the same sum as before: billed minus paid, across their open estimates),
  // and whether any of their bills is past its due date. One pass over the estimates, not one per row.
  const standing = useMemo(() => {
    const m = new Map<string, { balance: number; overdue: boolean }>();
    for (const e of estimates || []) {
      const id = String(e.customerId);
      const cur = m.get(id) || { balance: 0, overdue: false };
      cur.balance += Number(e.total || 0) - Number(e.amountPaid || 0);
      if (estimateState(e, todayStr).key === "overdue") cur.overdue = true;
      m.set(id, cur);
    }
    return m;
  }, [estimates, todayStr]);
  const owedBy = (id: string) => Math.round((standing.get(String(id))?.balance || 0) * 100) / 100;

  const archivedCount = customers.filter((c: any) => c.archived).length;
  const activeCount = customers.length - archivedCount;
  // The tab only exists for the owner and only once something is archived; restoring the last one drops back to Active.
  const showing: "active" | "archived" = !isStaff && archivedCount > 0 ? view : "active";
  const pool = customers.filter((c: any) => (showing === "archived") === !!c.archived);

  const q = search.trim().toLowerCase();
  const filteredCustomers = !q ? pool : pool.filter((c: any) =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.email || "").toLowerCase().includes(q) ||
    (c.location || "").toLowerCase().includes(q)
  );
  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filteredCustomers, PAGE_SIZE);
  const owedInPool = useMemo(() => pool.reduce((s: number, c: any) => s + Math.max(0, owedBy(c.id)), 0), [pool, standing]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (c: any) => {
    const archived = !!c.archived;
    const owed = owedBy(c.id);
    const overdue = !!standing.get(String(c.id))?.overdue && owed > 0;
    const sub = [c.phone, c.location].filter(Boolean).join(", ") || c.email || "No phone yet";
    return (
      // The row is a div so the "..." can be its own button beside the one that opens the customer.
      <GroupRow key={c.id} className="!gap-0 pr-1.5">
        <button type="button" onClick={() => onSelectCustomer(c.id)}
          className="-ml-4 flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors active:bg-paper">
          <Avatar name={c.name} size={40} className={archived ? "!bg-chip !text-chipText" : ""} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lead font-medium text-ink">{c.name}</p>
            <p className="truncate text-caption text-mute">{sub}</p>
          </div>
          {owed > 0 && (
            <div className="shrink-0 pl-1 text-right">
              <p className="text-lead font-medium tabular-nums text-ink">{inr(owed, currency)}</p>
              {overdue
                ? <StatusChip tone="overdue" small className="mt-0.5">Overdue</StatusChip>
                : <p className="text-micro text-mute">{archived ? "Still owes" : "Owes"}</p>}
            </div>
          )}
        </button>
        {archived
          ? (!isStaff && <TextButton onClick={() => restoreCustomer(c.id)} className="shrink-0 px-2 text-[15px]" aria-label={`Restore ${c.name}`}>Restore</TextButton>)
          : <IconButton label={`Actions for ${c.name}`} tone="faint" layout="compact" onClick={() => setActionsFor(c)}><MoreIcon size={20} /></IconButton>}
      </GroupRow>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      {portalCustomer && <CustomerPortalSharePopup customer={portalCustomer} onClose={() => setPortalCustomer(null)} />}

      {actionsFor && (
        <Sheet onClose={() => setActionsFor(null)} label={`Actions for ${actionsFor.name}`}>
          <h2 className="truncate text-section text-ink">{actionsFor.name}</h2>
          <p className="truncate text-[15px] text-mute">{actionsFor.phone || "No phone number saved"}</p>
          <Group className="mt-4">
            <ActionRow icon={<WhatsAppIcon size={20} />} label="Send WhatsApp message" disabled={!actionsFor.phone}
              href={actionsFor.phone ? waLink(actionsFor.phone, greeting(actionsFor.name)) : undefined} onClick={() => setActionsFor(null)} />
            <ActionRow icon={<MessageIcon size={20} />} label="Send SMS" disabled={!actionsFor.phone}
              href={actionsFor.phone ? smsLink(actionsFor.phone, greeting(actionsFor.name)) : undefined} onClick={() => setActionsFor(null)} />
            <ActionRow icon={<KeyIcon size={20} />} label="Share account link" onClick={() => { const c = actionsFor; setActionsFor(null); setPortalCustomer(c); }} />
            <ActionRow icon={<EditIcon size={20} />} label="Edit customer" onClick={() => { const c = actionsFor; setActionsFor(null); openModal("customer", { editingCustomer: c }); }} />
            {!isStaff && <ActionRow icon={<ArchiveIcon size={20} />} label="Archive customer" danger onClick={() => { const c = actionsFor; setActionsFor(null); removeCustomer(c.id); }} />}
          </Group>
          <div className="h-2" />
        </Sheet>
      )}

      {!isStaff && archivedCount > 0 && (
        <div className="mt-4">
          <Segmented
            ariaLabel="Customer list"
            options={[{ value: "active", label: `Active (${activeCount})` }, { value: "archived", label: `Archived (${archivedCount})` }]}
            value={showing}
            onChange={(v) => { setView(v as "active" | "archived"); setSearch(""); }}
          />
        </div>
      )}

      {customers.length > 0 && (
        <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search name, phone or place" ariaLabel="Search customers" />
      )}

      {customers.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Add your first customer to start tracking what they buy and what they owe." cta="New customer" onCta={() => openModal("customer")} /></Group>
      ) : pool.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{showing === "archived" ? "No archived customers." : "No active customers. Add one, or restore someone from Archived."}</p></Group>
      ) : pageItems.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">No customers match your search.</p></Group>
      ) : (
        <>
          <GroupLabel right={owedInPool > 0 ? <span className="tabular-nums">Owed {inrCompact(owedInPool, currency)}</span> : undefined}>
            {showing === "archived" ? `${archivedCount} archived` : `${activeCount} customer${activeCount === 1 ? "" : "s"}`}
          </GroupLabel>
          <Group>{pageItems.map(row)}</Group>
          <div className="mt-2"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} /></div>
        </>
      )}
    </div>
  );
}
