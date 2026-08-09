import { create } from "zustand";
import { api } from "../lib/api";
import { ITEM_CATEGORIES } from "../lib/constants";
import { fmtMoney, fmtNum, today } from "../lib/format";

/**
 * Central app store. This replaces the ~15 useState calls and every
 * save/remove handler that used to live inline in InvoiceApp.tsx.
 *
 * Views can now either keep receiving these as props (current InvoiceApp.tsx
 * still passes them down that way, so no view component had to change) or —
 * for new/rewritten views — call `useAppStore()` directly and skip the props
 * entirely. Both styles work against the same store.
 *
 * Deliberately kept loosely typed (mostly `any[]`), matching the rest of the
 * codebase's existing convention rather than introducing a parallel type
 * system as part of this refactor.
 */

// Pending optimistic-delete timers/undo closures. Not part of reactive state —
// nothing needs to re-render when a timer is scheduled or cleared.
const pendingDeletes: Record<string, () => void> = {};

type Toast = { message: string; undo?: () => void } | null;
type ConfirmDelete = { label: string; description?: string; onConfirm: () => void } | null;

interface AppState {
  // ---- data loaded from the backend ----
  loading: boolean;
  loadError: string;
  settings: any;
  customers: any[];
  items: any[];
  orders: any[];
  estimates: any[];
  challans: any[];
  expenses: any[];
  payments: any[];
  labourSessions: any[];
  labourWorkers: string[];
  contractors: any[];
  vendors: any[];
  purchases: any[];
  reorderSuggestions: any[];
  notifications: any[];
  role: "owner" | "staff";

  // ---- ephemeral UI state ----
  toast: Toast;
  modal: { type: string; payload?: any } | null;
  confirmDeleteFor: ConfirmDelete;
  shareInvoice: any;
  autoReminder: boolean;

  // Set once by InvoiceApp on mount so 401s anywhere in the store can sign the user out.
  onSignOut: (() => void) | null;
  setOnSignOut: (fn: () => void) => void;

  fetchAll: () => Promise<void>;
  showToast: (msg: string, opts?: { undo?: () => void; duration?: number }) => void;
  clearToast: () => void;
  openModal: (type: string, payload?: any) => void;
  closeModal: () => void;
  confirmThenDelete: (label: string, description: string | undefined, doDelete: () => void) => void;
  cancelConfirmDelete: () => void;
  setAutoReminder: (v: boolean) => void;
  setShareInvoice: (inv: any) => void;
  refreshReorderSuggestions: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;

  saveCustomer: (v: any) => Promise<any>;
  quickAddCustomer: (v: any) => Promise<any>;
  removeCustomer: (id: string) => void;
  saveItem: (v: any) => Promise<void>;
  removeItem: (id: string) => void;
  saveExpense: (v: any) => Promise<any>;
  removeExpense: (id: string) => void;
  saveVendor: (v: any) => Promise<void>;
  removeVendor: (id: string) => void;
  savePurchase: (v: any) => Promise<any>;
  removePurchase: (id: string) => void;
  saveVendorPayment: (v: any) => Promise<void>;
  savePurchasePayment: (v: any) => Promise<void>;
  saveDocument: (type: string, v: any) => Promise<any>;
  removeDoc: (type: string, id: string) => void;
  restoreDoc: (id: string) => Promise<void>;
  updateDocStatus: (type: string, id: string, s: string) => Promise<void>;
  savePayment: (v: any) => Promise<any>;
  savePaymentSplit: (v: { customerId: string; date?: string; method?: string; allocations: { invoiceId: string; amount: number }[]; advanceAmount?: number }) => Promise<void>;
  saveReturn: (docId: string, lines: { itemId: string; qty: number }[]) => Promise<void>;
  saveDelivery: (docId: string, lines: { itemId: string; qty: number }[]) => Promise<void>;
  removePayment: (id: string) => void;
  saveOrder: (v: any) => Promise<void>;
  removeOrder: (id: string) => void;
  payOrder: (order: any) => void;
  saveOrderPayment: (v: any) => Promise<void>;
  saveLabourSession: (v: any) => Promise<void>;
  removeLabourSession: (id: string) => void;
  saveContractorPhone: (name: string, phone: string) => Promise<void>;
  saveSettings: (s: any) => Promise<void>;
  saveChallan: (v: any) => Promise<void>;
  recordPaymentFor: (invoice: any) => void;
}

const docListKey = (type: string): "estimates" | "challans" => (type === "estimate" ? "estimates" : "challans");

export const useAppStore = create<AppState>()((set, get) => ({
  loading: true,
  loadError: "",
  settings: {
    orgName: "SHREE BALAJI TRADERS",
    ownerName: "SBT",
    email: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI",
    currency: "₹",
    businessWhatsApp: "",
    itemCategories: ITEM_CATEGORIES,
  },
  customers: [],
  items: [],
  orders: [],
  estimates: [],
  challans: [],
  expenses: [],
  payments: [],
  labourSessions: [],
  labourWorkers: [],
  contractors: [],
  vendors: [],
  purchases: [],
  reorderSuggestions: [],
  notifications: [],
  role: "owner",

  toast: null,
  modal: null,
  confirmDeleteFor: null,
  shareInvoice: null,
  autoReminder: false,

  onSignOut: null,
  setOnSignOut: (fn) => set({ onSignOut: fn }),

  fetchAll: async () => {
    set({ loading: true, loadError: "" });
    try {
      const [c, it, o, est, ch, ex, pay, st, ls, lw, ct, vd, pu, rs, nt, me] = await Promise.all([
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
        api.contractors.list(),
        api.vendors.list(),
        api.purchases.list(),
        api.reports.reorderSuggestions().catch(() => []),
        api.notifications.list().catch(() => []),
        api.auth.me().catch(() => ({ role: "owner" })),
      ]);
      set((state) => ({
        customers: c,
        items: it,
        orders: o,
        estimates: est,
        challans: ch,
        expenses: ex,
        payments: pay,
        labourSessions: ls,
        labourWorkers: lw,
        contractors: ct,
        vendors: vd,
        purchases: pu,
        reorderSuggestions: rs || [],
        notifications: nt || [],
        role: me?.role === "staff" ? "staff" : "owner",
        settings: { ...state.settings, ...st },
        loading: false,
      }));
    } catch (err: any) {
      if (err?.status === 401) { get().onSignOut?.(); return; }
      set({ loadError: err.message || "Failed to load your data", loading: false });
    }
  },

  showToast: (message, opts) => {
    set({ toast: { message, undo: opts?.undo } });
    setTimeout(() => {
      set((state) => (state.toast && state.toast.message === message ? { toast: null } : {}));
    }, opts?.duration ?? 3000);
  },
  clearToast: () => set({ toast: null }),

  openModal: (type, payload) => set({ modal: { type, payload } }),
  closeModal: () => set({ modal: null }),

  confirmThenDelete: (label, description, doDelete) => {
    set({
      confirmDeleteFor: {
        label,
        description,
        onConfirm: () => { doDelete(); set({ confirmDeleteFor: null }); },
      },
    });
  },
  cancelConfirmDelete: () => set({ confirmDeleteFor: null }),

  setAutoReminder: (v) => set({ autoReminder: v }),
  setShareInvoice: (inv) => set({ shareInvoice: inv }),

  refreshReorderSuggestions: async () => {
    try {
      const rs = await api.reports.reorderSuggestions();
      set({ reorderSuggestions: rs });
    } catch { /* non-critical */ }
  },

  fetchNotifications: async () => {
    try {
      const nt = await api.notifications.list();
      set({ notifications: nt || [] });
    } catch { /* non-critical — bell just shows stale data until the next successful poll */ }
  },
  markNotificationRead: (id) => {
    // optimistic: flip locally first, since this is purely a read/unread flag
    // with nothing else depending on the server round-trip completing first
    set((state) => ({ notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    api.notifications.markRead(id).catch(() => { /* worst case it re-shows as unread on next fetchAll */ });
  },
  markAllNotificationsRead: () => {
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }));
    api.notifications.markAllRead().catch(() => { /* same as above */ });
  },
  clearNotification: (id) => {
    // optimistic removal — worst case a stale one reappears on the next fetch
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
    api.notifications.remove(id).catch(() => { /* non-critical */ });
  },
  clearAllNotifications: () => {
    set({ notifications: [] });
    api.notifications.clearAll().catch(() => { /* non-critical */ });
  },

  // ---- internal helpers (not part of the public interface, but attached via closures below) ----

  saveCustomer: async (v) => {
    const { customers, showToast, closeModal } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const normPhone = (s: string) => (s || "").replace(/\D/g, "");
    const isDuplicate = customers.some((c) => c.id !== v.id && normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone));
    if (isDuplicate) { showToast("A customer with this name and phone number already exists"); return; }
    try {
      const { locationLat, locationLng, ...rest } = v;
      const payload = {
        ...rest,
        ...(locationLat != null ? { lat: locationLat } : {}),
        ...(locationLng != null ? { lng: locationLng } : {}),
        // an empty field means "no limit", not a limit of 0 — Mongoose would
        // otherwise cast "" to 0 and every future estimate would warn
        ...("creditLimit" in v ? { creditLimit: v.creditLimit === "" || v.creditLimit == null ? null : Number(v.creditLimit) } : {}),
      };
      if (v.id) {
        const { id, ...updateFields } = payload;
        const doc = await api.customers.update(id, updateFields);
        set((state) => ({ customers: state.customers.map((x) => (x.id === id ? doc : x)) }));
        showToast("Customer updated");
        closeModal();
        return doc;
      } else {
        const doc = await api.customers.create(payload);
        set((state) => ({ customers: [doc, ...state.customers] }));
        showToast("Customer added");
        closeModal();
        return doc;
      }
    } catch (err) { onApiError(get, err, "Failed to save customer"); }
  },

  // Same duplicate-check + create as saveCustomer, but built for the quick-add
  // popup inside the estimate/challan form: it must NOT call closeModal() (that
  // would close the document form the person is in the middle of filling out),
  // and it hands the new customer straight back so the caller can select it.
  quickAddCustomer: async (v) => {
    const { customers, showToast } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const normPhone = (s: string) => (s || "").replace(/\D/g, "");
    const isDuplicate = customers.some((c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone));
    if (isDuplicate) { showToast("A customer with this name and phone number already exists"); return null; }
    try {
      const doc = await api.customers.create(v);
      set((state) => ({ customers: [doc, ...state.customers] }));
      showToast("Customer added");
      return doc;
    } catch (err) { onApiError(get, err, "Failed to add customer"); return null; }
  },

  removeCustomer: (id) => {
    const { customers } = get();
    const c = customers.find((x) => x.id === id);
    get().confirmThenDelete(c?.name || "this customer", "This removes the customer and their ledger history.", () => {
      scheduleDelete(set, get, "Customer", "customers", id, () => api.customers.remove(id));
    });
  },

  saveChallan: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const { doc } = await api.documents("challan").create(v);
      set((state) => ({ challans: [doc, ...state.challans] }));
      showToast("Challan saved");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to save challan"); }
  },

  saveItem: async (v) => {
    const { items, showToast, closeModal, refreshReorderSuggestions } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const isDuplicate = items.some((it) => it.id !== v.id && normName(it.name) === normName(v.name));
    if (isDuplicate) { showToast("An item with this name already exists"); return; }
    try {
      if (v.id) {
        const { id, ...rest } = v;
        const doc = await api.items.update(id, rest);
        set((state) => ({ items: state.items.map((x) => (x.id === id ? doc : x)) }));
        showToast("Item updated");
      } else {
        const doc = await api.items.create(v);
        set((state) => ({ items: [doc, ...state.items] }));
        showToast("Item added");
      }
      closeModal();
      refreshReorderSuggestions();
    } catch (err) { onApiError(get, err, "Failed to save item"); }
  },

  removeItem: (id) => {
    const { items } = get();
    const it = items.find((x) => x.id === id);
    get().confirmThenDelete(it?.name || "this item", "This removes the item and its stock history.", () => {
      scheduleDelete(set, get, "Item", "items", id, () => api.items.remove(id));
    });
  },

  saveExpense: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const doc = await api.expenses.create({ category: v.category, vendor: v.vendor, amount: Number(v.amount), date: v.date || today() });
      set((state) => ({ expenses: [doc, ...state.expenses] }));
      showToast("Expense recorded");
      closeModal();
      return doc;
    } catch (err) { onApiError(get, err, "Failed to record expense"); }
  },

  removeExpense: (id) => {
    scheduleDelete(set, get, "Expense", "expenses", id, () => api.expenses.remove(id));
  },

  saveVendor: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const doc = await api.vendors.create(v);
      set((state) => ({ vendors: [doc, ...state.vendors] }));
      showToast("Vendor added");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to add vendor"); }
  },

  removeVendor: (id) => {
    scheduleDelete(set, get, "Vendor", "vendors", id, () => api.vendors.remove(id));
  },

  savePurchase: async (v) => {
    const { showToast, closeModal, refreshReorderSuggestions } = get();
    try {
      const { purchase, item } = await api.purchases.create({
        vendorId: v.vendorId,
        itemId: v.itemId,
        qty: Number(v.qty),
        rate: Number(v.rate),
        date: v.date || today(),
        paymentStatus: v.paymentStatus || "unpaid",
        amountPaid: v.amountPaid ? Number(v.amountPaid) : undefined,
        notes: v.notes,
      });
      set((state) => ({
        // A manually-logged purchase (source:"manual") only ever belongs in
        // the Purchases list — unlike an order, it has no matching card in Orders.
        purchases: [purchase, ...state.purchases],
        items: item ? state.items.map((x) => (x.id === item.id ? item : x)) : state.items,
      }));
      showToast("Purchase recorded");
      closeModal();
      refreshReorderSuggestions();
      return purchase;
    } catch (err) { onApiError(get, err, "Failed to record purchase"); }
  },

  removePurchase: (id) => {
    const { purchases, items } = get();
    const p = purchases.find((x: any) => x.id === id);
    const itemName = p ? items.find((i: any) => i.id === p.itemId)?.name : undefined;
    get().confirmThenDelete(
      itemName ? `purchase of ${itemName}` : "this purchase",
      "This reverses the ledger entries but does NOT adjust the item's stock quantity — adjust it manually afterward if needed.",
      () => {
        scheduleDelete(set, get, "Purchase", "purchases", id, async () => {
          await api.purchases.remove(id);
          // If this card originated from an order, drop it from the orders
          // array too once the delete has actually committed.
          set((state) => ({ orders: state.orders.filter((o: any) => o.id !== id) }));
        });
      }
    );
  },

  saveVendorPayment: async (v) => {
    const { showToast, closeModal } = get();
    try {
      await api.vendors.recordPayment(v.vendorId, { amount: Number(v.amount), date: v.date || today(), method: v.method, notes: v.notes });
      // amountPaid on the underlying purchases isn't tracked per-payment here, so just
      // refresh the purchase list to reflect any state the backend may have changed
      const pu = await api.purchases.list();
      set({ purchases: pu });
      showToast("Payment recorded");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to record vendor payment"); }
  },

  savePurchasePayment: async (v) => {
    const { showToast, closeModal, refreshReorderSuggestions } = get();
    try {
      // Same endpoint/logic Orders uses — if this card is actually an
      // order-sourced restock (source:"order") and this payment pays it off
      // in full, `item` comes back non-null and stock has just been bumped.
      const { purchase, item } = await api.purchases.recordPayment(v.purchaseId, {
        amount: Number(v.amount), date: v.date || today(), method: v.method, notes: v.notes,
      });
      set((state) => ({
        purchases: state.purchases.map((x) => (x.id === purchase.id ? purchase : x)),
        // keep the mirrored Orders-screen card in sync too, if it exists there
        orders: state.orders.map((x) => (x.id === purchase.id ? purchase : x)),
        items: item ? state.items.map((x) => (x.id === item.id ? item : x)) : state.items,
      }));
      showToast(item ? `Paid in full — stock updated: +${fmtNum(purchase.qty)} added` : "Payment recorded");
      closeModal();
      if (item) refreshReorderSuggestions();
    } catch (err) { onApiError(get, err, "Failed to record payment"); }
  },

  saveDocument: async (type, v) => {
    const { showToast, closeModal } = get();
    const key = docListKey(type);
    try {
      const payload: any = { customerId: v.customerId, date: v.date, dueDate: v.dueDate, lines: v.lines, notes: v.notes, total: v.total };
      if (type === "estimate") {
        payload.freightCost = v.freightCost || 0;
        payload.labourCost = v.labourCost || 0;
        payload.previousDue = v.previousDue || 0;
        payload.rolledEstimateIds = v.rolledEstimateIds || [];
        payload.contractorName = v.contractorName || "";
        payload.destination = v.destination || "";
        if (v.status) payload.status = v.status;
        if (v.isAdvanceBooking) payload.isAdvanceBooking = true;
      }

      if (v.id) {
        payload.expectedUpdatedAt = v.updatedAt;
        const { doc, lowStock } = await api.documents(type as any).update(v.id, payload);
        set((state) => ({ [key]: state[key].map((x: any) => (x.id === v.id ? doc : x)) } as any));

        if (type === "estimate") {
          // editing an estimate can re-deduct/restock items server-side — pull fresh numbers
          const freshItems = await api.items.list();
          set({ items: freshItems });
        }

        if (lowStock && lowStock.length > 0) {
          showToast(`⚠️ Low stock: ${lowStock.map((i: any) => `${i.name} (${fmtNum(i.stock)} left)`).join(", ")}`);
        } else {
          showToast(`${doc.number} updated`);
        }
        closeModal();
        return;
      }

      // guards against the same submit landing twice (double-tap Save, or a retried
      // request after a slow/dropped response creating a duplicate document)
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { doc, lowStock } = await api.documents(type as any).create(payload, idempotencyKey);
      set((state) => ({ [key]: [doc, ...state[key]] } as any));

      let partialPaymentFailed = false;
      if (type === "estimate") {
        if (v.rolledEstimateIds && v.rolledEstimateIds.length) {
          set((state) => ({
            estimates: state.estimates.map((e) => (v.rolledEstimateIds.includes(e.id) ? { ...e, status: "Paid" } : e)),
          }));
        }

        // customer paid part of the total up front — record it the same way a
        // normal partial payment against an invoice is recorded (Payment row +
        // ledger post + amountPaid/status recalc on the estimate), rather than
        // duplicating that accounting logic here.
        if (v.partialAmountPaid && Number(v.partialAmountPaid) > 0) {
          try {
            const { payment, invoice } = await api.payments.create({
              customerId: v.customerId, invoiceId: doc.id, amount: Number(v.partialAmountPaid), date: v.date, method: "Cash",
            });
            set((state) => ({
              payments: [payment, ...state.payments],
              estimates: invoice ? state.estimates.map((e) => (e.id === invoice.id ? invoice : e)) : state.estimates,
            }));
          } catch (err) {
            partialPaymentFailed = true;
          }
        }

        /* stock was deducted server-side — pull the fresh numbers */
        const freshItems = await api.items.list();
        set({ items: freshItems });
        if (partialPaymentFailed) {
          showToast(`${doc.number} created, but the partial payment couldn't be recorded — add it from Payments.`);
        } else if (lowStock && lowStock.length > 0) {
          showToast(`⚠️ Low stock: ${lowStock.map((i: any) => `${i.name} (${fmtNum(i.stock)} left)`).join(", ")}`);
        } else if (v.partialAmountPaid && Number(v.partialAmountPaid) > 0) {
          showToast(`${doc.number} created — partial payment recorded`);
        } else {
          showToast(`${doc.number} created`);
        }
      } else {
        showToast(`${doc.number} created`);
      }
      closeModal();
      return doc;
    } catch (err) { onApiError(get, err, "Failed to save document"); }
  },

  removeDoc: (type, id) => {
    const key = docListKey(type);

    if (type === "estimate") {
      // estimates are soft-deleted server-side and stay in the list (flagged +
      // greyed out) with a Restore button available afterward — but deleting one
      // is still high-stakes (it can affect stock and payment history), so it
      // goes through the same confirm-first gate as Customers/Items/Payments.
      const estimate = get().estimates.find((x: any) => x.id === id);
      get().confirmThenDelete(
        estimate?.number || "this estimate",
        "This removes the estimate from your active lists. You can restore it afterward from \"Show deleted\".",
        () => {
          (async () => {
            try {
              const result = await api.documents("estimate").remove(id);
              set((state) => ({
                estimates: state.estimates.map((x: any) => (x.id === id ? result.doc : x)),
                items: result.items || state.items,
              }));
              get().showToast("Estimate deleted");
            } catch (err) { onApiError(get, err, "Failed to delete estimate"); }
          })();
        }
      );
      return;
    }

    const list = get()[key];
    scheduleDelete(set, get, "Challan", key, id, () => api.documents(type as any).remove(id), list);
  },

  restoreDoc: async (id) => {
    try {
      const result = await api.documents("estimate").restore(id);
      set((state) => ({
        estimates: state.estimates.map((x: any) => (x.id === id ? result.doc : x)),
        items: result.items || state.items,
      }));
      if (result.lowStock && result.lowStock.length > 0) {
        get().showToast(`⚠️ Low stock: ${result.lowStock.map((i: any) => `${i.name} (${fmtNum(i.stock)} left)`).join(", ")}`);
      } else {
        get().showToast(`${result.doc.number} restored`);
      }
    } catch (err) { onApiError(get, err, "Failed to restore estimate"); }
  },

  updateDocStatus: async (type, id, s) => {
    const key = docListKey(type);
    try {
      const doc = await api.documents(type as any).updateStatus(id, s);
      set((state) => ({ [key]: state[key].map((x: any) => (x.id === id ? doc : x)) } as any));
    } catch (err) { onApiError(get, err, "Failed to update status"); }
  },

  savePayment: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const { payment, invoice } = await api.payments.create(v);
      set((state) => ({
        payments: [payment, ...state.payments],
        estimates: invoice ? state.estimates.map((i) => (i.id === invoice.id ? invoice : i)) : state.estimates,
      }));
      const toastMessage = v.invoiceId
        ? invoice?.status === "Paid"
          ? "Payment recorded — estimate fully paid"
          : invoice?.status === "Partially Paid"
            ? "Partial payment recorded"
            : "Payment recorded"
        : "Advance payment recorded";
      showToast(toastMessage);
      closeModal();
      return payment;
    } catch (err) { onApiError(get, err, "Failed to record payment"); }
  },

  // Records a single amount received against several due estimates at once (plus
  // an optional leftover as a general advance) by posting one Payment per estimate —
  // the backend/ledger already handle a single-invoice payment correctly, so this
  // just sequences that call once per allocation instead of needing a new API shape.
  savePaymentSplit: async (v) => {
    const { showToast, closeModal } = get();
    const allocations = (v.allocations || []).filter((a) => Number(a.amount) > 0);
    const advanceAmount = Number(v.advanceAmount || 0);
    if (!allocations.length && advanceAmount <= 0) return;

    try {
      const results: any[] = [];
      for (const a of allocations) {
        const { payment, invoice } = await api.payments.create({
          customerId: v.customerId,
          invoiceId: a.invoiceId,
          amount: Number(a.amount),
          date: v.date,
          method: v.method,
        });
        results.push({ payment, invoice });
      }
      if (advanceAmount > 0) {
        const { payment } = await api.payments.create({
          customerId: v.customerId,
          amount: advanceAmount,
          date: v.date,
          method: v.method,
        });
        results.push({ payment, invoice: null });
      }

      set((state) => {
        const invoiceById: Record<string, any> = {};
        for (const r of results) if (r.invoice) invoiceById[r.invoice.id] = r.invoice;
        return {
          payments: [...results.map((r) => r.payment), ...state.payments],
          estimates: state.estimates.map((e) => invoiceById[e.id] || e),
        };
      });

      const settledCount = results.filter((r) => r.invoice?.status === "Paid").length;
      showToast(
        allocations.length > 1
          ? `Payment recorded across ${allocations.length} estimates${settledCount ? ` — ${settledCount} settled` : ""}`
          : allocations.length === 1
            ? (results[0].invoice?.status === "Paid" ? "Payment recorded — estimate fully paid" : "Partial payment recorded")
            : "Advance payment recorded"
      );
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to record payment"); }
  },

  saveReturn: async (docId, lines) => {
    const { showToast, closeModal, settings } = get();
    try {
      const { doc, payment, items: freshItems } = await api.documents("estimate").addReturn(docId, lines);
      set((state) => ({
        estimates: state.estimates.map((e) => (e.id === docId ? doc : e)),
        items: freshItems,
        payments: [payment, ...state.payments],
      }));
      showToast(`Refund of ${fmtMoney(Math.abs(payment.amount), settings.currency)} recorded, stock updated`);
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to record return"); }
  },

  saveDelivery: async (docId, lines) => {
    const { showToast, closeModal } = get();
    try {
      const { doc } = await api.documents("estimate").addDelivery(docId, lines);
      set((state) => ({ estimates: state.estimates.map((e) => (e.id === docId ? doc : e)) }));
      const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
      showToast(`Collection recorded: ${fmtNum(totalQty)} item${totalQty !== 1 ? "s" : ""} taken`);
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to record collection"); }
  },

  removePayment: (id) => {
    const { payments, settings, confirmThenDelete } = get();
    const p = payments.find((x) => x.id === id);
    confirmThenDelete(
      "this payment",
      p ? `This removes the recorded payment of ${fmtMoney(Math.abs(Number(p.amount || 0)), settings.currency)} and reopens the linked invoice's due amount.` : undefined,
      () => {
        scheduleDelete(set, get, "Payment", "payments", id, async () => {
          const { invoice } = await api.payments.remove(id);
          if (invoice) set((state) => ({ estimates: state.estimates.map((i) => (i.id === invoice.id ? invoice : i)) }));
        });
      }
    );
  },

  saveOrder: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const { order, item } = await api.orders.create({ itemId: v.itemId, vendorId: v.vendorId, qty: v.qty, rate: v.rate, date: v.date, notes: v.notes });
      set((state) => ({
        // An order is a Purchase document under the hood (source:"order"), so
        // the same card belongs in both lists — the Purchases screen already
        // returns it too on its next fetch, this just keeps it in sync now.
        orders: [order, ...state.orders],
        purchases: [order, ...state.purchases],
        items: item ? state.items.map((it) => (it.id === item.id ? item : it)) : state.items,
      }));
      showToast(order.status === "Received" ? `Order placed — stock updated: +${fmtNum(order.qty)} added` : "Order placed");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to place order"); }
  },

  removeOrder: (id) => {
    // Same document also lives in the purchases array (an order is a
    // Purchase under the hood) — once the delete actually commits (the 5s
    // undo window in scheduleDelete elapses without the user hitting Undo),
    // drop it from there too so the mirrored card disappears as well.
    scheduleDelete(set, get, "Order", "orders", id, async () => {
      await api.orders.remove(id);
      set((state) => ({ purchases: state.purchases.filter((p: any) => p.id !== id) }));
    });
  },

  // opens the payment modal for a pending order — paying it off in full is
  // what bumps stock now, replacing the old manual "mark as received" step
  payOrder: (order) =>
    get().openModal("orderPayment", { orderId: order.id, itemName: order.itemName, remaining: Math.round((Number(order.amount) - Number(order.amountPaid)) * 100) / 100 }),

  saveOrderPayment: async (v) => {
    const { showToast, closeModal, refreshReorderSuggestions } = get();
    try {
      const { order, item } = await api.orders.recordPayment(v.orderId, {
        amount: Number(v.amount), date: v.date || today(), method: v.method, notes: v.notes,
      });
      set((state) => ({
        orders: state.orders.map((o) => (o.id === order.id ? order : o)),
        // same underlying document — keep the mirrored Purchases-screen card in sync too
        purchases: state.purchases.map((p) => (p.id === order.id ? order : p)),
        items: item ? state.items.map((it) => (it.id === item.id ? item : it)) : state.items,
      }));
      showToast(order.status === "Received" ? `Paid in full — stock updated: +${fmtNum(order.qty)} added` : "Payment recorded");
      closeModal();
      if (item) refreshReorderSuggestions();
    } catch (err) { onApiError(get, err, "Failed to record payment"); }
  },

  recordPaymentFor: (invoice) =>
    get().openModal("payment", { invoiceId: invoice.id, customerId: invoice.customerId, amount: Number(invoice.total || 0) - Number(invoice.amountPaid || 0) }),

  saveLabourSession: async (v) => {
    const { showToast, labourWorkers } = get();
    try {
      const session = await api.labourSessions.create(v);
      set((state) => ({ labourSessions: [session, ...state.labourSessions] }));
      const newNames = (v.workers || []).filter((n: string) => !labourWorkers.includes(n));
      if (newNames.length) set((state) => ({ labourWorkers: [...state.labourWorkers, ...newNames].sort() }));
      showToast("Session saved");
    } catch (err) { onApiError(get, err, "Failed to save session"); }
  },

  removeLabourSession: (id) => {
    scheduleDelete(set, get, "Session", "labourSessions", id, () => api.labourSessions.remove(id));
  },

  saveContractorPhone: async (name, phone) => {
    const { showToast } = get();
    try {
      const doc = await api.contractors.create({ name, phone });
      set((state) => {
        const idx = state.contractors.findIndex((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
        const contractors = idx === -1 ? [doc, ...state.contractors] : (() => { const copy = [...state.contractors]; copy[idx] = doc; return copy; })();
        return { contractors };
      });
      showToast("Contractor number saved");
    } catch (err) { onApiError(get, err, "Failed to save contractor number"); }
  },

  saveSettings: async (s) => {
    const { showToast } = get();
    try {
      const doc = await api.settings.update(s);
      set((state) => ({ settings: { ...state.settings, ...doc } }));
      showToast("Settings saved");
    } catch (err) { onApiError(get, err, "Failed to save settings"); }
  },
}));

/** Shared 401-handling: if the API call failed because the token's gone, sign out; otherwise toast the error. */
function onApiError(get: () => AppState, err: any, fallback: string) {
  if (err?.status === 401) { get().onSignOut?.(); return; }
  get().showToast(err?.message || fallback);
}

/**
 * Generic optimistic delete with a 5s undo window, used by every "trash can" button in the app.
 * Removes the item from store state immediately; the actual API call only fires after the window
 * elapses, unless the user taps Undo (which restores the item to its original position and cancels
 * the pending API call).
 */
function scheduleDelete(
  set: (partial: any) => void,
  get: () => AppState,
  label: string,
  listKey: keyof AppState,
  id: string,
  commit: () => Promise<void>,
  listOverride?: any[]
) {
  const list: any[] = listOverride ?? (get()[listKey] as any);
  const index = list.findIndex((x) => x.id === id);
  if (index === -1) return;
  const item = list[index];
  const key = `${label}-${id}-${Date.now()}`;
  const restore = () => {
    set((state: any) => {
      const copy = [...state[listKey]];
      copy.splice(Math.min(index, copy.length), 0, item);
      return { [listKey]: copy };
    });
  };

  set((state: any) => ({ [listKey]: state[listKey].filter((x: any) => x.id !== id) }));

  const timer = setTimeout(async () => {
    delete pendingDeletes[key];
    try { await commit(); }
    catch (err: any) { restore(); onApiError(get, err, `Failed to delete ${label}`); }
  }, 5000);

  pendingDeletes[key] = () => { clearTimeout(timer); restore(); };
  get().showToast(`${label} deleted`, { duration: 5000, undo: () => { pendingDeletes[key]?.(); delete pendingDeletes[key]; } });
}