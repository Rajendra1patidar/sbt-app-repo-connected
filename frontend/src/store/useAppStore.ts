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

  // ---- ephemeral UI state ----
  toast: Toast;
  modal: { type: string; payload?: any } | null;
  confirmDeleteFor: ConfirmDelete;
  shareInvoice: any;
  autoReminder: boolean;
  printSide: "left" | "right";

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
  togglePrintSide: () => void;
  setAutoReminder: (v: boolean) => void;
  setShareInvoice: (inv: any) => void;
  refreshReorderSuggestions: () => Promise<void>;

  saveCustomer: (v: any) => Promise<void>;
  removeCustomer: (id: string) => void;
  saveItem: (v: any) => Promise<void>;
  removeItem: (id: string) => void;
  saveExpense: (v: any) => Promise<void>;
  removeExpense: (id: string) => void;
  saveVendor: (v: any) => Promise<void>;
  removeVendor: (id: string) => void;
  savePurchase: (v: any) => Promise<void>;
  convertOrderToPurchase: (order: any) => void;
  removePurchase: (id: string) => void;
  saveVendorPayment: (v: any) => Promise<void>;
  savePurchasePayment: (v: any) => Promise<void>;
  saveDocument: (type: string, v: any) => Promise<void>;
  removeDoc: (type: string, id: string) => void;
  updateDocStatus: (type: string, id: string, s: string) => Promise<void>;
  savePayment: (v: any) => Promise<void>;
  savePaymentSplit: (v: { customerId: string; date?: string; method?: string; allocations: { invoiceId: string; amount: number }[]; advanceAmount?: number }) => Promise<void>;
  saveReturn: (docId: string, lines: { itemId: string; qty: number }[]) => Promise<void>;
  saveDelivery: (docId: string, lines: { itemId: string; qty: number }[]) => Promise<void>;
  removePayment: (id: string) => void;
  saveOrder: (v: any) => Promise<void>;
  removeOrder: (id: string) => void;
  markOrderReceived: (orderId: string) => Promise<void>;
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

  toast: null,
  modal: null,
  confirmDeleteFor: null,
  shareInvoice: null,
  autoReminder: false,
  printSide: typeof window !== "undefined" && localStorage.getItem("sbt_print_side") === "right" ? "right" : "left",

  onSignOut: null,
  setOnSignOut: (fn) => set({ onSignOut: fn }),

  fetchAll: async () => {
    set({ loading: true, loadError: "" });
    try {
      const [c, it, o, est, ch, ex, pay, st, ls, lw, ct, vd, pu, rs] = await Promise.all([
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

  togglePrintSide: () => {
    set((state) => {
      const next = state.printSide === "left" ? "right" : "left";
      localStorage.setItem("sbt_print_side", next);
      return { printSide: next };
    });
  },
  setAutoReminder: (v) => set({ autoReminder: v }),
  setShareInvoice: (inv) => set({ shareInvoice: inv }),

  refreshReorderSuggestions: async () => {
    try {
      const rs = await api.reports.reorderSuggestions();
      set({ reorderSuggestions: rs });
    } catch { /* non-critical */ }
  },

  // ---- internal helpers (not part of the public interface, but attached via closures below) ----

  saveCustomer: async (v) => {
    const { customers, showToast, closeModal } = get();
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const normPhone = (s: string) => (s || "").replace(/\D/g, "");
    const isDuplicate = customers.some((c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone));
    if (isDuplicate) { showToast("A customer with this name and phone number already exists"); return; }
    try {
      const { locationLat, locationLng, ...rest } = v;
      const payload = { ...rest, ...(locationLat != null ? { lat: locationLat } : {}), ...(locationLng != null ? { lng: locationLng } : {}) };
      const doc = await api.customers.create(payload);
      set((state) => ({ customers: [doc, ...state.customers] }));
      showToast("Customer added");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to add customer"); }
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
        purchases: [purchase, ...state.purchases],
        items: item ? state.items.map((x) => (x.id === item.id ? item : x)) : state.items,
      }));
      // Purchase already adds this qty to stock, so if this purchase was created
      // by converting a pending Order, that order is now redundant — remove it
      // quietly (no undo toast) rather than risk double-counting stock later.
      if (v.fromOrderId) {
        set((state) => ({ orders: state.orders.filter((o) => o.id !== v.fromOrderId) }));
        api.orders.remove(v.fromOrderId).catch(() => {});
      }
      showToast("Purchase recorded");
      closeModal();
      refreshReorderSuggestions();
    } catch (err) { onApiError(get, err, "Failed to record purchase"); }
  },

  convertOrderToPurchase: (order) =>
    get().openModal("purchase", { itemId: order.itemId, vendorId: order.vendorId, qty: order.qty, fromOrderId: order.id }),

  removePurchase: (id) => {
    scheduleDelete(set, get, "Purchase", "purchases", id, () => api.purchases.remove(id));
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
    const { showToast, closeModal } = get();
    try {
      const { purchase } = await api.purchases.recordPayment(v.purchaseId, {
        amount: Number(v.amount), date: v.date || today(), method: v.method, notes: v.notes,
      });
      set((state) => ({ purchases: state.purchases.map((x) => (x.id === purchase.id ? purchase : x)) }));
      showToast("Payment recorded");
      closeModal();
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
        const doc = await api.documents(type as any).update(v.id, payload);
        set((state) => ({ [key]: state[key].map((x: any) => (x.id === v.id ? doc : x)) } as any));
        showToast(`${doc.number} updated`);
        closeModal();
        return;
      }

      const { doc, lowStock } = await api.documents(type as any).create(payload);
      set((state) => ({ [key]: [doc, ...state[key]] } as any));

      if (type === "estimate") {
        if (v.rolledEstimateIds && v.rolledEstimateIds.length) {
          set((state) => ({
            estimates: state.estimates.map((e) => (v.rolledEstimateIds.includes(e.id) ? { ...e, status: "Paid" } : e)),
          }));
        }
        /* stock was deducted server-side — pull the fresh numbers */
        const freshItems = await api.items.list();
        set({ items: freshItems });
        if (lowStock && lowStock.length > 0) {
          showToast(`⚠️ Low stock: ${lowStock.map((i: any) => `${i.name} (${fmtNum(i.stock)} left)`).join(", ")}`);
        } else {
          showToast(`${doc.number} created`);
        }
      } else {
        showToast(`${doc.number} created`);
      }
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to save document"); }
  },

  removeDoc: (type, id) => {
    const key = docListKey(type);
    const list = get()[key];
    scheduleDelete(set, get, type === "estimate" ? "Estimate" : "Challan", key, id, () => api.documents(type as any).remove(id), list);
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
      const doc = await api.orders.create({ itemId: v.itemId, vendorId: v.vendorId, qty: v.qty, date: v.date, notes: v.notes });
      set((state) => ({ orders: [doc, ...state.orders] }));
      showToast("Order placed");
      closeModal();
    } catch (err) { onApiError(get, err, "Failed to place order"); }
  },

  removeOrder: (id) => {
    scheduleDelete(set, get, "Order", "orders", id, () => api.orders.remove(id));
  },

  markOrderReceived: async (orderId) => {
    const { showToast, refreshReorderSuggestions } = get();
    try {
      const { order, item } = await api.orders.receive(orderId);
      set((state) => ({
        orders: state.orders.map((o) => (o.id === orderId ? order : o)),
        items: state.items.map((it) => (it.id === item.id ? item : it)),
      }));
      showToast(`Stock updated: +${fmtNum(order.qty)} added`);
      refreshReorderSuggestions();
    } catch (err) { onApiError(get, err, "Failed to update order"); }
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
