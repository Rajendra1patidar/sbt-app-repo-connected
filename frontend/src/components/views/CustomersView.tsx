import React, { useState } from "react";
import { Archive, ArchiveRestore, KeyRound, MapPin, MessageSquare, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton, WhatsAppButton } from "../common/UIPrimitives";
import { RowActionMenu } from "../common/RowActionMenu";
import { Pagination } from "../common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { PAGE_SIZE } from "../../lib/constants";
import { smsLink } from "../../lib/contactLinks";
import { fmtMoney } from "../../lib/format";
import { CustomerPortalSharePopup } from "../modals/CustomerPortalSharePopup";

/* ---- Customers ---- */

export function CustomersView({ customers: allCustomers, openModal, removeCustomer, restoreCustomer, estimates, onSelectCustomer }: any) {
  const [search, setSearch] = useState("");
  // "Deleting" a customer who has history archives them (see the store's removeCustomer): they leave this
  // list, and every picker, but their bills and payments keep working. Show archived brings them back into view.
  const [showArchived, setShowArchived] = useState(false);
  const archivedList = (allCustomers || []).filter((c: any) => c.archived);
  const customers = (allCustomers || []).filter((c: any) => !!c.archived === showArchived);
  const [portalCustomer, setPortalCustomer] = useState<any>(null);
  const balanceFor = (customerId: string) =>
    (estimates || [])
      .filter((e: any) => String(e.customerId) === String(customerId))
      .reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);

  // With bills on file, the menu says Archive (the customer is kept, just hidden); without, Delete.
  const hasHistory = (customerId: string) => (estimates || []).some((e: any) => String(e.customerId) === String(customerId));

  const q = search.trim().toLowerCase();
  const filteredCustomers = !q ? customers : customers.filter((c: any) =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.email || "").toLowerCase().includes(q) ||
    (c.location || "").toLowerCase().includes(q)
  );
  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filteredCustomers, PAGE_SIZE);

  return (
    <div className="space-y-3 px-5 pb-28">
      {portalCustomer && <CustomerPortalSharePopup customer={portalCustomer} onClose={() => setPortalCustomer(null)} />}
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-faint">{customers.length} {showArchived ? "archived" : `customer${customers.length !== 1 ? "s" : ""}`}</p>
        <PillButton onClick={() => openModal("customer")}><Plus size={16} /> New Customer</PillButton>
      </div>
      {(archivedList.length > 0 || showArchived) && (
        <button type="button" onClick={() => { setShowArchived(!showArchived); setSearch(""); }} className="text-sm font-semibold text-brand-600">
          {showArchived ? "Back to customers" : `Show archived (${archivedList.length})`}
        </button>
      )}
      {customers.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or location..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {customers.length === 0
        ? showArchived
          ? <Card><p className="text-center text-sm text-faint">No archived customers.</p></Card>
          : (allCustomers || []).length > 0
          ? <Card><p className="text-center text-sm text-faint">All your customers are archived. Tap Show archived to restore one.</p></Card>
          : <Card><EmptyState text="Add your first customer." cta="New Customer" onCta={() => openModal("customer")} /></Card>
        : pageItems.length === 0
        ? <Card><p className="text-center text-sm text-faint">No customers match your search.</p></Card>
        : <>
          {pageItems.map((c: any, idx: number) => {
          const balance = balanceFor(c.id);
          const initials = (c.name || "?").trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <Card key={c.id} style={{ animationDelay: `${Math.min(idx, 8) * 25}ms` }} className="animate-row-in flex items-center gap-3 justify-between cursor-pointer" onClick={() => onSelectCustomer(c.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-semibold ${balance > 0 ? "bg-bad-50 text-bad-600" : "bg-good-50 text-good-600"}`}>{initials}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{c.name}{c.archived && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 align-middle text-xs font-semibold text-chipText">Archived</span>}</p>
                  <p className="text-xs text-faint truncate">{c.email || "No email"}{c.phone ? ` · ${c.phone}` : ""}</p>
                  {c.location && (
                    <a
                      href={c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`}
                      target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 flex items-center gap-1 text-xs text-faint hover:text-brand-600 hover:underline"
                    >
                      <MapPin size={11} /> {c.location}
                    </a>
                  )}
                  {balance > 0 && <p className="mt-1 text-xs font-semibold text-bad-600">Due {fmtMoney(balance, "₹")}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {c.archived && (
                  <button type="button" onClick={() => restoreCustomer?.(c.id)} className="mr-1 inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                    <ArchiveRestore size={14} /> Restore
                  </button>
                )}
                <button
                  onClick={() => setPortalCustomer(c)}
                  aria-label="Share account link with customer"
                  title="Share account link"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-300 bg-brand-50 text-brand-700 active:scale-[0.94]"
                >
                  <KeyRound size={15} />
                </button>
                <WhatsAppButton compact phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
                <RowActionMenu
                  actions={[
                    ...(c.phone ? [{ key: "sms", label: "Send SMS", icon: MessageSquare, href: smsLink(c.phone, `Hi ${c.name}, reaching out from ${c.name}'s account.`), onClick: () => {} }] : []),
                    ...(c.archived
                      ? [{ key: "restore", label: "Restore customer", icon: ArchiveRestore, onClick: () => restoreCustomer?.(c.id) }]
                      : [hasHistory(c.id)
                        ? { key: "archive", label: "Archive customer", icon: Archive, onClick: () => removeCustomer(c.id) }
                        : { key: "delete", label: "Delete customer", icon: Trash2, danger: true, onClick: () => removeCustomer(c.id) }]),
                  ]}
                />
              </div>
            </Card>
          );
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
        </>
      }
    </div>
  );
}
