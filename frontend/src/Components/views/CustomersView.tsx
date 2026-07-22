import React, { useState } from "react";
import { MapPin, MessageSquare, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton, WhatsAppButton } from "../common/UIPrimitives";
import { RowActionMenu } from "../common/RowActionMenu";
import { smsLink } from "../../lib/contactLinks";
import { fmtMoney } from "../../lib/format";

/* ---- Customers ---- */

export function CustomersView({ customers, openModal, removeCustomer, estimates, onSelectCustomer }: any) {
  const [search, setSearch] = useState("");
  const balanceFor = (customerId: string) =>
    (estimates || [])
      .filter((e: any) => String(e.customerId) === String(customerId))
      .reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0);

  const q = search.trim().toLowerCase();
  const filteredCustomers = !q ? customers : customers.filter((c: any) =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.email || "").toLowerCase().includes(q) ||
    (c.location || "").toLowerCase().includes(q)
  );

  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-ink/40">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("customer")}><Plus size={16} /> New Customer</PillButton>
      </div>
      {customers.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or location..."
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {customers.length === 0
        ? <Card><EmptyState text="Add your first customer." cta="New Customer" onCta={() => openModal("customer")} /></Card>
        : filteredCustomers.length === 0
        ? <Card><p className="text-center text-sm text-ink/40">No customers match your search.</p></Card>
        : filteredCustomers.map((c: any, idx: number) => {
          const balance = balanceFor(c.id);
          const initials = (c.name || "?").trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <Card key={c.id} style={{ animationDelay: `${Math.min(idx, 8) * 25}ms` }} className="animate-row-in flex items-center gap-3 justify-between cursor-pointer" onClick={() => onSelectCustomer(c.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold ${balance > 0 ? "bg-bad-50 text-bad-500" : "bg-good-50 text-good-500"}`}>{initials}</div>
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
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <WhatsAppButton compact phone={c.phone} message={`Hi ${c.name}, reaching out from ${c.name}'s account.`} />
                <RowActionMenu
                  actions={[
                    ...(c.phone ? [{ key: "sms", label: "Send SMS", icon: MessageSquare, href: smsLink(c.phone, `Hi ${c.name}, reaching out from ${c.name}'s account.`), onClick: () => {} }] : []),
                    { key: "delete", label: "Delete customer", icon: Trash2, danger: true, onClick: () => removeCustomer(c.id) },
                  ]}
                />
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}
