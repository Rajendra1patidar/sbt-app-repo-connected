import React, { useState } from "react";
import { Archive, KeyRound, MapPin, MessageSquare, Plus, RotateCcw, Search } from "lucide-react";
import { Card, EmptyState, PillButton, WhatsAppButton } from "../common/UIPrimitives";
import { RowActionMenu } from "../common/RowActionMenu";
import { Pagination } from "../common/Pagination";
import { Segmented } from "../ui/kit";
import { usePagination } from "../../hooks/usePagination";
import { PAGE_SIZE } from "../../lib/constants";
import { smsLink } from "../../lib/contactLinks";
import { fmtMoney } from "../../lib/format";
import { CustomerPortalSharePopup } from "../modals/CustomerPortalSharePopup";

/* ---- Customers ----
 * Customers are archived, never deleted. An archived customer is out of this list (and out of the
 * pickers and the capture bar) but keeps every bill and payment; the Archived tab brings them back.
 * Only the owner archives or restores, so staff never see the tab or the action. */

export function CustomersView({ customers, openModal, removeCustomer, restoreCustomer, role, estimates, onSelectCustomer }: any) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [portalCustomer, setPortalCustomer] = useState<any>(null);
  const isStaff = role === "staff";
  const balanceFor = (customerId: string) =>
    (estimates || [])
      .filter((e: any) => String(e.customerId) === String(customerId))
      .reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);

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

  return (
    <div className="space-y-3 px-5 pb-28">
      {portalCustomer && <CustomerPortalSharePopup customer={portalCustomer} onClose={() => setPortalCustomer(null)} />}
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-faint">
          {showing === "archived"
            ? `${archivedCount} archived`
            : `${activeCount} customer${activeCount !== 1 ? "s" : ""}`}
        </p>
        <PillButton onClick={() => openModal("customer")}><Plus size={16} /> New Customer</PillButton>
      </div>
      {!isStaff && archivedCount > 0 && (
        <Segmented
          ariaLabel="Customer list"
          options={[{ value: "active", label: `Active (${activeCount})` }, { value: "archived", label: `Archived (${archivedCount})` }]}
          value={showing}
          onChange={(v) => { setView(v as "active" | "archived"); setSearch(""); }}
        />
      )}
      {customers.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or location..."
            aria-label="Search customers"
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {customers.length === 0
        ? <Card><EmptyState text="Add your first customer." cta="New Customer" onCta={() => openModal("customer")} /></Card>
        : pool.length === 0
        ? <Card><p className="text-center text-sm text-faint">{showing === "archived" ? "No archived customers." : "No active customers. Add one, or restore someone from Archived."}</p></Card>
        : pageItems.length === 0
        ? <Card><p className="text-center text-sm text-faint">No customers match your search.</p></Card>
        : <>
          {pageItems.map((c: any, idx: number) => {
          const balance = balanceFor(c.id);
          const archived = !!c.archived;
          const initials = (c.name || "?").trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <Card key={c.id} style={{ animationDelay: `${Math.min(idx, 8) * 25}ms` }} className="animate-row-in flex items-center gap-3 justify-between cursor-pointer" onClick={() => onSelectCustomer(c.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-semibold ${archived ? "bg-chip text-mute" : balance > 0 ? "bg-bad-50 text-bad-500" : "bg-good-50 text-good-500"}`}>{initials}</div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-semibold text-ink">{c.name}</p>
                    {archived && <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chipText">Archived</span>}
                  </div>
                  <p className="text-xs text-faint truncate">{c.email || "No email"}{c.phone ? ` · ${c.phone}` : ""}</p>
                  {c.location && (
                    <a
                      href={c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`}
                      target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 flex items-center gap-1 text-xs text-faint hover:text-brand-500 hover:underline"
                    >
                      <MapPin size={11} /> {c.location}
                    </a>
                  )}
                  {balance > 0 && <p className="mt-1 text-xs font-semibold text-bad-600">{archived ? "Still owes" : "Due"} {fmtMoney(balance, "₹")}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {archived ? (
                  <button
                    type="button"
                    onClick={() => restoreCustomer(c.id)}
                    className="flex min-h-[44px] items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-brand-600 active:scale-[0.97]"
                  >
                    <RotateCcw size={14} aria-hidden="true" /> Restore
                  </button>
                ) : (
                  <>
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
                        ...(isStaff ? [] : [{ key: "archive", label: "Archive customer", icon: Archive, onClick: () => removeCustomer(c.id) }]),
                      ]}
                    />
                  </>
                )}
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
