import { create } from "zustand";
import { api } from "../lib/api";
import { ITEM_CATEGORIES } from "../lib/constants";
import { fmtMoney, fmtNum, today } from "../lib/format";
import { enqueueOfflineAction } from "../lib/offlineQueue";
import { saveDataCache, loadDataCache } from "../lib/dataCache";
import { waLink } from "../lib/contactLinks";

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

type Toast = { message: string; undo?: () => void; actionLabel?: string } | null;
type ConfirmDelete = { label: string; description?: string; onConfirm: () => void } | null;

interface AppState {
  // ---- data loaded from the backend ----
  loading: boolean;
  loadError: string;
  // Set when fetchAll() couldn't reach the server and fell back to the last
  // locally cached snapshot instead (see lib/dataCache.ts) — the timestamp
  // of that snapshot, so the UI can tell the user the data on screen isn't
  // live. Empty string when showing real, freshly-fetched data.
  offlineDataAsOf: string;
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
  scoreRules: any[];
  vendors: any[];
  godowns: any[];
  purchases: any[];
  reorderSuggestions: any[];
  deadStock: any[];
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
  showToast: (msg: string, opts?: { undo?: () => void; duration?: number; actionLabel?: string }) => void;
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
  quickAddItem: (v: any) => Promise<any>;
  removeCustomer: (id: string) => void;
  shareCustomerPortalAccess: (customerId: string) => Promise<void>;
  saveItem: (v: any) => Promise<void>;
  removeItem: (id: string) => void;
  saveExpense: (v: any) => Promise<any>;
  removeExpense: (id: string) => void;
  saveVendor: (v: any) => Promise<void>;
  removeVendor: (id: string) => void;
  saveGodown: (v: any) => Promise<void>;
  removeGodown: (id: string) => void;
  setDefaultGodown: (id: string) => Promise<void>;
  transferStock: (v: { itemId: string; fromGodownId: string; toGodownId: string; qty: number; qtyKg?: number }) => Promise<void>;
  savePurchase: (v: any) => Promise<any>;
  savePurchaseBatch: (v: any) => Promise<any>;
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
  saveScoreRule: (v: any) => Promise<void>;
  removeScoreRule: (id: string) => void;
  saveSettings: (s: any) => Promise<void>;
  applyStockAdjustments: (lines: { itemId: string; newStock: number; newStockKg?: number; reason?: string }[], reason?: string, godownId?: string) => Promise<any>;
  saveChallan: (v: any) => Promise<void>;
  recordPaymentFor: (invoice: any) => void;
}

const docListKey = (type: string): "estimates" | "challans" => (type === "estimate" ? "estimates" : "challans");

export const useAppStore = create<AppState>()((set, get) => ({
  loading: true,
  loadError: "",
  offlineDataAsOf: "",
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
  scoreRules: [],
  vendors: [],
  godowns: [],
  purchases: [],
  reorderSuggestions: [],
  deadStock: [],
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
      const [c, it, o, est, ch, ex, pay, st, ls, lw, ct, sr, vd, pu, rs, nt, me, gd, ds] = await Promise.all([
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
        api.scoreRules.list().catch(() => []),
        api.vendors.list(),
        api.purchases.list(),
        api.reports.reorderSuggestions().catch(() => []),
        api.notifications.list().catch(() => []),
        api.auth.me().catch(() => ({ role: "owner" })),
        api.godowns.list().catch(() => []),
        api.reports.deadStock().catch(() => []),
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
        scoreRules: sr || [],
        vendors: vd,
        purchases: pu,
        reorderSuggestions: rs || [],
        notifications: nt || [],
        role: me?.role === "staff" ? "staff" : "owner",
        settings: { ...state.settings, ...st },
        godowns: gd || [],
        deadStock: ds || [],
        loading: false,
        offlineDataAsOf: "",
      }));
      // Snapshot this fresh state for the next time the app opens with no
      // connectivity — see the offline fallback below and lib/dataCache.ts.
      saveDataCache(get());
    } catch (err: any) {
      if (err?.status === 401) { get().onSignOut?.(); return; }
      if (err?.status === 0) {
        const cached = loadDataCache();
        if (cached) {
          set({ ...cached.data, loading: false, loadError: "", offlineDataAsOf: cached.savedAt });
          return;
        }
      }
      set({ loadError: err.message || "Failed to load your data", loading: false });
    }
  },

  showToast: (message, opts) => {
    set({ toast: { message, undo: opts?.undo, actionLabel: opts?.actionLabel } });
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
    } catch (err: any) {
      // Editing an existing customer offline isn't supported (same reasoning
      // as estimates/documents — no way to safely apply a concurrent edit
      // without the server's current copy), so this only queues a brand-new
      // customer, same as quickAddOfflineCustomer below.
      if (err?.status === 0 && !v.id) {
        const placeholder = queueOfflineCustomer(set, v);
        showToast("You're offline — customer saved and will sync automatically once you're back online.");
        closeModal();
        return placeholder;
      }
      onApiError(get, err, "Failed to save customer");
    }
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
    } catch (err: any) {
      if (err?.status === 0) {
        // This is the important case for a sales person offline: without
        // this, hitting "+ New customer" mid-estimate for someone not
        // already in the list would dead-end the whole sale. The returned
        // placeholder's id is usable immediately as the estimate's
        // customerId — see saveDocument's offline branch, which queues that
        // reference and resolves it to the real id once this customer syncs.
        const placeholder = queueOfflineCustomer(set, v);
        showToast("You're offline — customer saved and will sync automatically once you're back online.");
        return placeholder;
      }
      onApiError(get, err, "Failed to add customer");
      return null;
    }
  },

  // Same duplicate-check + create as saveItem, but built for the quick-add popup
  // inside the estimate form: it must NOT call closeModal() (that would close the
  // estimate form the person is in the middle of filling out), and it hands the
  // new item straight back so the caller can drop it onto a line.
  quickAddItem: async (v) => {
    const { items, showToast, refreshReorderSuggestions } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const isDuplicate = items.some((it) => !it.deleted && normName(it.name) === normName(v.name));
    if (isDuplicate) { showToast("An item with this name already exists"); return null; }
    try {
      const doc = await api.items.create(v);
      set((state) => ({ items: [doc, ...state.items] }));
      showToast("Item added");
      refreshReorderSuggestions();
      return doc;
    } catch (err) { onApiError(get, err, "Failed to add item"); return null; }
  },

  removeCustomer: (id) => {
    const { customers } = get();
    const c = customers.find((x) => x.id === id);
    get().confirmThenDelete(c?.name || "this customer", "This removes the customer and their ledger history.", () => {
      scheduleDelete(set, get, "Customer", "customers", id, () => api.customers.remove(id));
    });
  },

  // Owner-triggered (re)issue of a customer's Booking Portal PIN — used both the
  // first time a customer needs one outside of the automatic advance-booking flow,
  // and to reset/re-send it if they've forgotten it. Always returns a fresh PIN.
  shareCustomerPortalAccess: async (customerId) => {
    const { customers, showToast } = get();
    const customer = customers.find((c: any) => c.id === customerId);
    try {
      const { phone, pin } = await api.customers.regeneratePortalPin(customerId);
      const usePhone = phone || customer?.phone;
      const portalUrl = `${window.location.origin}/booking-status`;
      const message = `Hi ${customer?.name || ""}, you can check your booking with us anytime here: ${portalUrl}\nLog in with your phone number and this PIN: ${pin}`;
      showToast(`New Booking Portal PIN for ${customer?.name || "this customer"}: ${pin}`, {
        duration: 15000,
        actionLabel: "Send on WhatsApp",
        undo: () => { if (usePhone) window.open(waLink(usePhone, message), "_blank"); },
      });
    } catch (err) { onApiError(get, err, "Failed to generate a portal PIN"); }
  },

  saveChallan: async (v) => {
    const { showToast, closeModal } = get();
    try {
      const { doc } = await api.documents("challan").create(v);
      set((state) => ({ challans: [doc, ...state.challans] }));
      showToast("Challan saved");
      closeModal();
    } catch (err: any) {
      // status 0 = request never reached the server (see lib/api.ts) — that's
      // "we're offline", not a real rejection, so queue it for field staff
      // instead of losing the delivery challan they just filled out.
      if (err?.status === 0) {
        enqueueOfflineAction("challan", v);
        showToast("You're offline — challan saved and will sync automatically once you're back online.");
        closeModal();
        return;
      }
      onApiError(get, err, "Failed to save challan");
    }
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

  saveGodown: async (v) => {
    const { godowns, showToast, closeModal } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const isDuplicate = godowns.some((g) => g.id !== v.id && normName(g.name) === normName(v.name));
    if (isDuplicate) { showToast("A godown with this name already exists"); return; }
    // The location field's map picker writes locationLat/locationLng
    // (FieldModal's convention) — translate to the lat/lng the API expects.
    const { locationLat, locationLng, ...rest } = v;
    const payload = { ...rest, lat: locationLat !== undefined ? locationLat : v.lat, lng: locationLng !== undefined ? locationLng : v.lng };
    try {
      if (payload.id) {
        const { id, ...body } = payload;
        const doc = await api.godowns.update(id, body);
        set((state) => ({ godowns: state.godowns.map((x) => (x.id === id ? doc : x)) }));
        showToast("Godown updated");
      } else {
        const doc = await api.godowns.create(payload);
        set((state) => ({ godowns: [...state.godowns, doc] }));
        showToast("Godown added");
      }
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to save godown"); }
  },

  removeGodown: (id) => {
    scheduleDelete(set, get, "Godown", "godowns", id, () => api.godowns.remove(id));
  },

  setDefaultGodown: async (id) => {
    const { showToast } = get();
    try {
      await api.godowns.setDefault(id);
      // The backend clears isDefault on every other godown for this owner —
      // mirror that locally rather than trying to patch just one record.
      set((state) => ({ godowns: state.godowns.map((g) => ({ ...g, isDefault: g.id === id })) }));
      showToast("Default godown updated");
    } catch (err) { onApiError(get, err, "Failed to set default godown"); }
  },

  transferStock: async (v) => {
    const { showToast, closeModal, fetchAll } = get();
    try {
      await api.godowns.transfer(v);
      showToast("Stock transferred");
      closeModal();
      // Both godown breakdowns live on the Item document, and there's no
      // per-item cache-patch worth writing for a two-sided move — a full
      // refresh keeps every screen (Item drawer, reports) consistent.
      await fetchAll();
    } catch (err) { onApiError(get, err, "Failed to transfer stock"); }
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

  // The New Purchase form lets you enter several items from one vendor visit
  // in one sitting, but the Purchase schema is still one-item-per-record (see
  // the comment in Purchase.js), so this creates one record per line — same
  // vendor/date/notes on each — via the existing single-item endpoint, one
  // at a time so two lines for the same item never race on the same
  // item's stock update.
  savePurchaseBatch: async (v) => {
    const { showToast, closeModal, refreshReorderSuggestions } = get();
    try {
      const created: any[] = [];
      let currentItems = get().items;
      for (const line of v.lines) {
        const { purchase, item } = await api.purchases.create({
          vendorId: v.vendorId,
          itemId: line.itemId,
          qty: Number(line.qty),
          qtyKg: line.qtyKg !== undefined ? Number(line.qtyKg) : undefined,
          rate: Number(line.rate),
          date: v.date || today(),
          paymentStatus: line.paymentStatus || "unpaid",
          amountPaid: line.amountPaid ? Number(line.amountPaid) : undefined,
          notes: v.notes,
          godownId: line.godownId || v.godownId || undefined,
        });
        created.push(purchase);
        if (item) currentItems = currentItems.map((x) => (x.id === item.id ? item : x));
      }
      set({ purchases: [...created.slice().reverse(), ...get().purchases], items: currentItems });
      showToast(created.length > 1 ? `${created.length} purchases recorded` : "Purchase recorded");
      closeModal();
      refreshReorderSuggestions();
      return created;
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
    let payload: any;
    try {
      payload = { customerId: v.customerId, date: v.date, dueDate: v.dueDate, lines: v.lines, notes: v.notes, total: v.total };
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
        const { doc, lowStock, portalAccess } = await api.documents(type as any).update(v.id, payload);
        set((state) => ({ [key]: state[key].map((x: any) => (x.id === v.id ? doc : x)) } as any));

        if (type === "estimate") {
          // editing an estimate can re-deduct/restock items server-side — pull fresh numbers
          const freshItems = await api.items.list();
          set({ items: freshItems });
        }

        // this edit just turned the estimate into an advance booking for a customer
        // who didn't already have Booking Portal access — surface the new PIN once,
        // with a one-tap way to send it, so it isn't silently lost after this toast.
        if (portalAccess?.pin) {
          announcePortalAccess(get, doc, portalAccess);
        } else if (lowStock && lowStock.length > 0) {
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
      const { doc, lowStock, portalAccess } = await api.documents(type as any).create(payload, idempotencyKey);
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
        if (portalAccess?.pin) {
          announcePortalAccess(get, doc, portalAccess);
        } else if (partialPaymentFailed) {
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
    } catch (err: any) {
      // Offline branch is deliberately scoped to *creating* a brand-new
      // estimate — editing one offline is excluded: an edit can re-deduct
      // or restock items and carries an expectedUpdatedAt concurrency
      // check against the server's current copy, both of which assume
      // they're running against live data. Same reasoning that already
      // kept editing out of the Challan/Stock Take/Payment offline paths.
      if (err?.status === 0 && type === "estimate" && !v.id && payload) {
        const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const placeholderId = `offline-${idempotencyKey}`;
        enqueueOfflineAction("estimate", {
          payload, idempotencyKey, placeholderId,
          partialAmountPaid: v.partialAmountPaid, customerId: v.customerId, date: v.date,
        });

        const placeholder = {
          id: placeholderId,
          number: "Pending sync",
          customerId: v.customerId,
          date: v.date,
          dueDate: v.dueDate,
          lines: v.lines,
          notes: v.notes,
          total: v.total,
          status: payload.status || "Due",
          freightCost: payload.freightCost,
          labourCost: payload.labourCost,
          previousDue: payload.previousDue,
          _offlinePending: true,
        };
        set((state) => {
          let estimates = [placeholder, ...state.estimates];
          if (v.rolledEstimateIds && v.rolledEstimateIds.length) {
            // Mirrors the online path's optimistic update so the rolled-in
            // estimates don't keep showing as due while this one is queued.
            // Stock itself is deliberately left untouched here (unlike Stock
            // Take's optimistic numbers) — estimate lines mix weight/piece
            // units in a way that's easy to get subtly wrong client-side;
            // safer to show the last-known real stock until sync corrects it.
            estimates = estimates.map((e: any) => (v.rolledEstimateIds.includes(e.id) ? { ...e, status: "Paid" } : e));
          }
          return { estimates };
        });
        showToast("You're offline — estimate saved and will sync automatically once you're back online. Stock won't update until then.");
        closeModal();
        return placeholder;
      }
      onApiError(get, err, "Failed to save document");
    }
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
    } catch (err: any) {
      if (err?.status === 0) {
        enqueueOfflineAction("payment", v);
        // Optimistic placeholder so the collection shows up in the Payments
        // list right away — a collector needs to see "yes, that's logged"
        // before walking into the next customer's shop with no signal.
        // Marked _offlinePending so it's visually distinguishable until the
        // full refresh after sync replaces it with the real record; doesn't
        // touch the estimate's due/paid status locally since that requires
        // the server's ledger logic — it'll catch up once synced.
        const optimistic = {
          id: `offline-${Date.now()}`,
          ...v,
          amount: Number(v.amount),
          _offlinePending: true,
        };
        set((state) => ({ payments: [optimistic, ...state.payments] }));
        showToast("You're offline — payment saved and will sync automatically once you're back online.");
        closeModal();
        return optimistic;
      }
      onApiError(get, err, "Failed to record payment");
    }
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

  saveScoreRule: async (v) => {
    const { showToast } = get();
    try {
      const doc = v.id ? await api.scoreRules.update(v.id, v) : await api.scoreRules.create(v);
      set((state) => {
        const idx = state.scoreRules.findIndex((x) => x.id === doc.id);
        const scoreRules = idx === -1 ? [doc, ...state.scoreRules] : (() => { const copy = [...state.scoreRules]; copy[idx] = doc; return copy; })();
        return { scoreRules };
      });
      showToast(v.id ? "Points rule updated" : "Points rule added");
    } catch (err) { onApiError(get, err, "Failed to save points rule"); }
  },

  removeScoreRule: (id) => {
    scheduleDelete(set, get, "Points rule", "scoreRules", id, () => api.scoreRules.remove(id));
  },

  // Applies a reviewed stock-take batch. Each successfully-changed line comes
  // back with the full updated item doc, which we splice into state directly
  // — no need to refetch the whole item list. Partial failures are normal
  // here (one bad line shouldn't block the rest), so this returns the raw
  // per-line results for the Stock Take screen to render, rather than
  // treating anything less than 100% success as an error.
  applyStockAdjustments: async (lines, reason, godownId) => {
    const { showToast, refreshReorderSuggestions } = get();
    try {
      const result = await api.stockAdjustments.bulk({ lines, reason, godownId });
      const updatedById = new Map<string, any>();
      for (const r of result.results) {
        if (r.ok && r.changed && r.item) updatedById.set(r.item.id, r.item);
      }
      if (updatedById.size) {
        set((state) => ({
          items: state.items.map((it) => updatedById.get(it.id) || it),
        }));
      }
      showToast(
        result.failed > 0
          ? `Stock take applied: ${result.succeeded}/${result.total} lines (${result.failed} failed)`
          : `Stock take applied to ${result.succeeded} item${result.succeeded === 1 ? "" : "s"}`
      );
      refreshReorderSuggestions();
      return result;
    } catch (err: any) {
      if (err?.status === 0) {
        enqueueOfflineAction("stockTake", { lines, reason, godownId });
        // Reflect the counted stock locally right away — a godown manager
        // doing a physical count needs to see it take effect immediately,
        // even though the real write hasn't reached the server yet. Synced
        // for real (and corrected if anything drifted) once back online.
        set((state) => ({
          items: state.items.map((it) => {
            const line = lines.find((l) => l.itemId === it.id);
            if (!line) return it;
            return { ...it, stock: line.newStock, stockKg: line.newStockKg ?? it.stockKg };
          }),
        }));
        showToast("You're offline — stock take saved and will sync automatically once you're back online.");
        return {
          succeeded: lines.length,
          total: lines.length,
          failed: 0,
          results: lines.map((l) => ({ ok: true, changed: true, itemId: l.itemId })),
          offline: true,
        };
      }
      onApiError(get, err, "Failed to apply stock take");
      return null;
    }
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
 * Surfaces a freshly-generated Booking Portal PIN after saving an advance-booking
 * estimate — the PIN only ever comes back from the server once (see
 * customerPortalService.ensurePortalPin), so this is the only chance to hand it to
 * the owner. A longer-than-usual toast, plus a one-tap WhatsApp send so it doesn't
 * just get missed if the owner is mid-sale with a customer waiting.
 */
function announcePortalAccess(get: () => AppState, doc: any, portalAccess: { phone?: string; pin: string }) {
  const { showToast, customers } = get();
  const customer = customers.find((c: any) => c.id === doc.customerId);
  const phone = portalAccess.phone || customer?.phone;
  const portalUrl = `${window.location.origin}/booking-status`;
  const message = `Hi ${customer?.name || ""}, you can check your booking with us anytime here: ${portalUrl}\nLog in with your phone number and this PIN: ${portalAccess.pin}`;

  showToast(`${doc.number}: Booking Portal PIN for ${customer?.name || "this customer"} is ${portalAccess.pin} — share it with them`, {
    duration: 15000,
    actionLabel: "Send on WhatsApp",
    undo: () => { if (phone) window.open(waLink(phone, message), "_blank"); },
  });
}

/**
 * Shared by saveCustomer and quickAddCustomer's offline branches: queues the
 * create, mints a temp id usable immediately as a customerId elsewhere (an
 * estimate, a payment), and drops an optimistic placeholder into `customers`
 * so it's visible right away. See lib/offlineQueue.ts's remap mechanism for
 * how that temp id resolves to the real one once this customer syncs.
 */
function queueOfflineCustomer(set: (fn: (state: AppState) => Partial<AppState>) => void, v: any) {
  const tempId = `offline-cust-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  enqueueOfflineAction("customer", { payload: v, tempId });
  const placeholder = { id: tempId, ...v, _offlinePending: true };
  set((state) => ({ customers: [placeholder, ...state.customers] }));
  return placeholder;
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