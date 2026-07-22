import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Phone } from "lucide-react";
import { api } from "../lib/api";
import { BottomNav } from "./layout/BottomNav";
import { GlobalSearchOverlay } from "./layout/GlobalSearchOverlay";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import { ChallanModal } from "./modals/ChallanModal";
import { DeliveryModal } from "./modals/DeliveryModal";
import { DocumentModal } from "./modals/DocumentModal";
import { FieldModal } from "./modals/FieldModal";
import { InvoiceShareModal } from "./modals/InvoiceShareModal";
import { OrderModal } from "./modals/OrderModal";
import { ReturnModal } from "./modals/ReturnModal";
import { ViewEstimateModal } from "./modals/ViewEstimateModal";
import { AdvancedBillingView } from "./views/AdvancedBillingView";
import { ContractorScorecardView } from "./views/ContractorScorecardView";
import { CustomerDetailView } from "./views/CustomerDetailView";
import { CustomersView } from "./views/CustomersView";
import { Dashboard } from "./views/Dashboard";
import { DocumentList } from "./views/DocumentList";
import { ExpensesView } from "./views/ExpensesView";
import { ToDoTrackingView } from "./views/InventoryView";
import { ItemsView } from "./views/ItemsView";
import { LabourTrackingView } from "./views/LabourTrackingView";
import { OrdersView } from "./views/OrdersView";
import { PaymentsView } from "./views/PaymentsView";
import { ReportsView } from "./views/ReportsView";
import { SettingsView } from "./views/SettingsView";
import { ShareReportView } from "./views/ShareReportView";
import { ITEM_CATEGORIES, LOW_STOCK_DEFAULT, WHATSAPP_GREEN } from "../lib/constants";
import { waLink } from "../lib/contactLinks";
import { fmtDate, fmtMoney, fmtNum, today } from "../lib/format";

/* ---- Main App ---- */

export function InvoiceApp({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<any>(null);
  const [shareInvoice, setShareInvoice] = useState<any>(null);
  const [printSide, setPrintSide] = useState<"left" | "right">(() => (localStorage.getItem("sbt_print_side") === "right" ? "right" : "left"));
  const togglePrintSide = () => setPrintSide((s) => { const next = s === "left" ? "right" : "left"; localStorage.setItem("sbt_print_side", next); return next; });
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [autoReminder, setAutoReminder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [settings, setSettings] = useState({
    orgName: "SHREE BALAJI TRADERS", ownerName: "SBT", email: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI", currency: "₹", businessWhatsApp: "",
  });

  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [labourSessions, setLabourSessions] = useState<any[]>([]);
  const [labourWorkers, setLabourWorkers] = useState<string[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);

  const pendingDeletes = useRef<Record<string, () => void>>({});

  const showToast = (msg: string, opts?: { undo?: () => void; duration?: number }) => {
    setToast({ message: msg, undo: opts?.undo });
    setTimeout(() => setToast((t) => (t && t.message === msg ? null : t)), opts?.duration ?? 3000);
  };

  const closeModal = () => setModal(null);
  const nextNumber = (list: any[], prefix: string) => `${prefix}-${String(list.length + 1).padStart(4, "0")}`;

  /**
   * Generic optimistic delete with a 5s undo window, used by every "trash can" button in the app.
   * Removes the item from local state immediately; the actual API call only fires after the window
   * elapses, unless the user taps Undo (which restores the item to its original position and cancels
   * the pending API call).
   */
  const scheduleDelete = <T extends { id: string }>(
    label: string,
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    commit: () => Promise<void>
  ) => {
    const index = list.findIndex((x) => x.id === id);
    if (index === -1) return;
    const item = list[index];
    const key = `${label}-${id}-${Date.now()}`;
    const restore = () => setList((c) => { const copy = [...c]; copy.splice(Math.min(index, copy.length), 0, item); return copy; });

    setList((c) => c.filter((x) => x.id !== id));

    const timer = setTimeout(async () => {
      delete pendingDeletes.current[key];
      try { await commit(); }
      catch (err: any) { restore(); onApiError(err, `Failed to delete ${label}`); }
    }, 5000);

    pendingDeletes.current[key] = () => { clearTimeout(timer); restore(); };
    showToast(`${label} deleted`, { duration: 5000, undo: () => { pendingDeletes.current[key]?.(); delete pendingDeletes.current[key]; } });
  };

  /* ---- initial load from backend ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, it, o, est, ch, ex, pay, st, ls, lw, ct] = await Promise.all([
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
        ]);
        if (cancelled) return;
        setCustomers(c); setItems(it); setOrders(o); setEstimates(est);
        setChallans(ch); setExpenses(ex); setPayments(pay);
        setLabourSessions(ls); setLabourWorkers(lw);
        setContractors(ct);
        setSettings((prev) => ({ ...prev, ...st }));
      } catch (err: any) {
        if (!cancelled) {
          
          if (err?.status === 401) { onSignOut(); return; }
          setLoadError(err.message || "Failed to load your data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- handlers (all persist to the backend, then sync local state from the response) ---- */

  const onApiError = (err: any, fallback: string) => {
    if (err?.status === 401) { onSignOut(); return; }
    showToast(err?.message || fallback);
  };

  const saveCustomer = async (v: any) => {
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const normPhone = (s: string) => (s || "").replace(/\D/g, "");
    const isDuplicate = customers.some((c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone));
    if (isDuplicate) { showToast("A customer with this name and phone number already exists"); return; }
    try {
      const { locationLat, locationLng, ...rest } = v;
      const payload = { ...rest, ...(locationLat != null ? { lat: locationLat } : {}), ...(locationLng != null ? { lng: locationLng } : {}) };
      const doc = await api.customers.create(payload);
      setCustomers((c) => [doc, ...c]);
      showToast("Customer added");
      closeModal();
    } catch (err) { onApiError(err, "Failed to add customer"); }
  };

  const removeCustomer = (id: string) => {
    scheduleDelete("Customer", customers, setCustomers, id, () => api.customers.remove(id));
  };

  const saveChallan = async (v: any) => {
    try {
      const { doc } = await api.documents("challan").create(v);
      setChallans((c) => [doc, ...c]);
      showToast("Challan saved");
      closeModal();
    } catch (err) { onApiError(err, "Failed to save challan"); }
  };

  const saveItem = async (v: any) => {
    const normName = (s: string) => (s || "").trim().toLowerCase();
    const isDuplicate = items.some((it) => it.id !== v.id && normName(it.name) === normName(v.name));
    if (isDuplicate) { showToast("An item with this name already exists"); return; }
    try {
      if (v.id) {
        const { id, ...rest } = v;
        const doc = await api.items.update(id, rest);
        setItems((c) => c.map((x) => (x.id === id ? doc : x)));
        showToast("Item updated");
      } else {
        const doc = await api.items.create(v);
        setItems((c) => [doc, ...c]);
        showToast("Item added");
      }
      closeModal();
    } catch (err) { onApiError(err, "Failed to save item"); }
  };

  const removeItem = (id: string) => {
    scheduleDelete("Item", items, setItems, id, () => api.items.remove(id));
  };

  const saveExpense = async (v: any) => {
    try {
      const doc = await api.expenses.create({ category: v.category, vendor: v.vendor, amount: Number(v.amount), date: v.date || today() });
      setExpenses((c) => [doc, ...c]);
      showToast("Expense recorded");
      closeModal();
    } catch (err) { onApiError(err, "Failed to record expense"); }
  };

  const removeExpense = (id: string) => {
    scheduleDelete("Expense", expenses, setExpenses, id, () => api.expenses.remove(id));
  };

  const docSetter = (type: string) => (type === "estimate" ? setEstimates : setChallans);

  const saveDocument = async (type: string, v: any) => {
    try {
      const payload: any = { customerId: v.customerId, date: v.date, dueDate: v.dueDate, lines: v.lines, notes: v.notes, total: v.total };
      if (type === "estimate") {
        payload.freightCost = v.freightCost || 0;
        payload.labourCost = v.labourCost || 0;
        payload.previousDue = v.previousDue || 0;
        payload.rolledEstimateIds = v.rolledEstimateIds || [];
        payload.contractorName = v.contractorName || "";
        payload.destination = v.destination || "";
        if (v.status) payload.status = v.status; // Due/Paid choice from the confirmation popup, create-only
        if (v.isAdvanceBooking) payload.isAdvanceBooking = true; // only true when "Advance Booking" was picked in that popup
      }

      if (v.id) {
        // editing an existing document — update in place, don't touch stock or status
        const doc = await api.documents(type as any).update(v.id, payload);
        docSetter(type)((l: any[]) => l.map((x: any) => (x.id === v.id ? doc : x)));
        showToast(`${doc.number} updated`);
        closeModal();
        return;
      }

      const { doc, lowStock } = await api.documents(type as any).create(payload);
      docSetter(type)((l: any[]) => [doc, ...l]);

      if (type === "estimate") {
        if (v.rolledEstimateIds && v.rolledEstimateIds.length) {
          setEstimates((l) => l.map((e) => (v.rolledEstimateIds.includes(e.id) ? { ...e, status: "Paid" } : e)));
        }
        /* stock was deducted server-side — pull the fresh numbers */
        const freshItems = await api.items.list();
        setItems(freshItems);
        if (lowStock && lowStock.length > 0) {
          showToast(`⚠️ Low stock: ${lowStock.map((i: any) => `${i.name} (${fmtNum(i.stock)} left)`).join(", ")}`);
        } else {
          showToast(`${doc.number} created`);
        }
      } else {
        showToast(`${doc.number} created`);
      }
      closeModal();
    } catch (err) { onApiError(err, "Failed to save document"); }
  };

  const removeDoc = (type: string) => (id: string) => {
    const list = type === "estimate" ? estimates : challans;
    scheduleDelete(type === "estimate" ? "Estimate" : "Challan", list, docSetter(type), id, () => api.documents(type as any).remove(id));
  };

  const updateDocStatus = (type: string) => async (id: string, s: string) => {
    try {
      const doc = await api.documents(type as any).updateStatus(id, s);
      docSetter(type)((list: any[]) => list.map((x) => (x.id === id ? doc : x)));
    } catch (err) { onApiError(err, "Failed to update status"); }
  };

  const savePayment = async (v: any) => {
    try {
      const { payment, invoice } = await api.payments.create(v);
      setPayments((p) => [payment, ...p]);
      if (invoice) setEstimates((list) => list.map((i) => (i.id === invoice.id ? invoice : i)));
      showToast(invoice?.status === "Paid" ? "Payment recorded — estimate fully paid" : invoice?.status === "Partially Paid" ? "Partial payment recorded" : "Payment recorded");
      closeModal();
    } catch (err) { onApiError(err, "Failed to record payment"); }
  };

  const saveReturn = async (docId: string, lines: { itemId: string; qty: number }[]) => {
    try {
      const { doc, payment, items: freshItems } = await api.documents("estimate").addReturn(docId, lines);
      setEstimates((list) => list.map((e) => (e.id === docId ? doc : e)));
      setItems(freshItems);
      setPayments((p) => [payment, ...p]);
      showToast(`Refund of ${fmtMoney(Math.abs(payment.amount), settings.currency)} recorded, stock updated`);
      closeModal();
    } catch (err) { onApiError(err, "Failed to record return"); }
  };

  const saveDelivery = async (docId: string, lines: { itemId: string; qty: number }[]) => {
    try {
      const { doc } = await api.documents("estimate").addDelivery(docId, lines);
      setEstimates((list) => list.map((e) => (e.id === docId ? doc : e)));
      const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
      showToast(`Collection recorded: ${fmtNum(totalQty)} item${totalQty !== 1 ? "s" : ""} taken`);
      closeModal();
    } catch (err) { onApiError(err, "Failed to record collection"); }
  };

  const removePayment = (id: string) => {
    scheduleDelete("Payment", payments, setPayments, id, async () => {
      const { invoice } = await api.payments.remove(id);
      if (invoice) setEstimates((list) => list.map((i) => (i.id === invoice.id ? invoice : i)));
    });
  };

  const saveOrder = async (v: any) => {
    try {
      const doc = await api.orders.create({ itemId: v.itemId, qty: v.qty, date: v.date, notes: v.notes });
      setOrders((o) => [doc, ...o]);
      showToast("Order placed");
      closeModal();
    } catch (err) { onApiError(err, "Failed to place order"); }
  };

  const removeOrder = (id: string) => {
    scheduleDelete("Order", orders, setOrders, id, () => api.orders.remove(id));
  };

  const markOrderReceived = async (orderId: string) => {
    try {
      const { order, item } = await api.orders.receive(orderId);
      setOrders((list) => list.map((o) => (o.id === orderId ? order : o)));
      setItems((list) => list.map((it) => (it.id === item.id ? item : it)));
      showToast(`Stock updated: +${fmtNum(order.qty)} added`);
    } catch (err) { onApiError(err, "Failed to update order"); }
  };

  const openModal = (type: string, payload?: any) => setModal({ type, payload });
  const recordPaymentFor = (invoice: any) => openModal("payment", { invoiceId: invoice.id, customerId: invoice.customerId, amount: Number(invoice.total || 0) - Number(invoice.amountPaid || 0) });

  const saveLabourSession = async (v: any) => {
    try {
      const session = await api.labourSessions.create(v);
      setLabourSessions((l) => [session, ...l]);
      const newNames = (v.workers || []).filter((n: string) => !labourWorkers.includes(n));
      if (newNames.length) setLabourWorkers((w) => [...w, ...newNames].sort());
      showToast("Session saved");
    } catch (err) { onApiError(err, "Failed to save session"); }
  };
  const removeLabourSession = (id: string) => {
    scheduleDelete("Session", labourSessions, setLabourSessions, id, () => api.labourSessions.remove(id));
  };

  const saveContractorPhone = async (name: string, phone: string) => {
    try {
      const doc = await api.contractors.create({ name, phone });
      setContractors((c) => {
        const idx = c.findIndex((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (idx === -1) return [doc, ...c];
        const copy = [...c]; copy[idx] = doc; return copy;
      });
      showToast("Contractor number saved");
    } catch (err) { onApiError(err, "Failed to save contractor number"); }
  };

  const printEstimate = (invoice: any) => {
    const customer = customers.find((c) => c.id === invoice.customerId);
    const lines = invoice.lines || [];
    const COMPACT_MAX_LINES = 12; // beyond this, a quarter-strip can't stay readable — use a fresh full page instead
    const compact = lines.length <= COMPACT_MAX_LINES;
    const rowFont = lines.length <= 4 ? 8.5 : lines.length <= 8 ? 7.5 : 6.5;

    const rowsHtml = lines.map((ln: any) => {
      const it = items.find((i) => i.id === ln.itemId);
      const name = it?.name || "Item";
      const qty = Number(ln.qty || 0);
      const rate = ln.rate ?? it?.price ?? 0;
      const amount = qty * rate;
      return `<div class="ln"><span class="ln-name">${name} × ${qty} @ ${fmtMoney(rate, settings.currency)}</span><span class="ln-amt">${fmtMoney(amount, settings.currency)}</span></div>`;
    }).join("");

    const extrasHtml = [
      Number(invoice.freightCost || 0) > 0 ? `<div class="ln"><span>Freight</span><span>${fmtMoney(invoice.freightCost, settings.currency)}</span></div>` : "",
      Number(invoice.labourCost || 0) > 0 ? `<div class="ln"><span>Labour</span><span>${fmtMoney(invoice.labourCost, settings.currency)}</span></div>` : "",
      Number(invoice.previousDue || 0) > 0 ? `<div class="ln"><span>Previous due</span><span>${fmtMoney(invoice.previousDue, settings.currency)}</span></div>` : "",
    ].join("");

    const statusNote = invoice.isAdvanceBooking
      ? "Advance Booked"
      : invoice.status === "Paid"
      ? "Paid"
      : "Due";

    const notesHtml = invoice.notes ? `<div class="notes">${invoice.notes}</div>` : "";

    const bodyHtml = `
      <div class="hd"><span class="name">${customer?.name || "Customer"}</span><span class="doc">${fmtDate(invoice.date)}</span></div>
      <div class="place">${customer?.location || ""}</div>
      <div class="divider"></div>
      <div class="lines">${rowsHtml}${extrasHtml}</div>
      <div class="tot"><span>Total</span><span>${fmtMoney(invoice.total, settings.currency)}</span></div>
      ${notesHtml}
      <div class="stat">${statusNote}</div>
    `;

    const w = window.open("", "_blank", "width=480,height=680");
    if (!w) { showToast("Please allow pop-ups to print."); return; }
    w.document.write(`<!doctype html><html><head><title>${invoice.number}</title><style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
      .box {
        position: absolute; top: 6mm; ${compact ? (printSide === "left" ? "left: 6mm;" : "left: 111mm;") : "left: 10mm; right: 10mm;"}
        width: ${compact ? "93mm" : "auto"};
        padding: ${compact ? "3mm" : "8mm"};
        border: 0.25mm dashed #cbd5e1;
      }
      .hd { display: flex; justify-content: space-between; align-items: baseline; }
      .name { font-weight: 700; font-size: ${compact ? "8px" : "13px"}; }
      .doc { font-weight: 700; font-size: ${compact ? "8px" : "13px"}; }
      .place { font-size: ${compact ? "8px" : "13px"}; color: #64748b; margin-top: ${compact ? "0.3mm" : "0.5mm"}; }
      .divider { border-bottom: 0.3mm solid #0f172a; margin: ${compact ? "1.5mm 0" : "3mm 0"}; }
      .lines { }
      .ln { display: flex; justify-content: space-between; font-size: ${compact ? rowFont + "px" : "12px"}; padding: ${compact ? "0.4mm 0" : "1.5mm 0"}; border-bottom: 0.15mm dotted #e2e8f0; }
      .tot { display: flex; justify-content: space-between; font-weight: 700; font-size: ${compact ? "8.5px" : "14px"}; border-top: 0.3mm solid #0f172a; margin-top: ${compact ? "1mm" : "2mm"}; padding-top: ${compact ? "1mm" : "2mm"}; }
      .notes { font-size: ${compact ? "6.5px" : "10px"}; color: #475569; margin-top: ${compact ? "1mm" : "2mm"}; font-style: italic; word-break: break-word; }
      .stat { text-align: right; font-size: ${compact ? "6.5px" : "10px"}; color: #d97706; margin-top: ${compact ? "0.5mm" : "1.5mm"}; font-weight: 700; }
    </style></head><body><div class="box">${bodyHtml}</div></body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    if (compact) togglePrintSide();
  };

  const saveSettings = async (s: any) => {
    try {
      const doc = await api.settings.update(s);
      setSettings((prev) => ({ ...prev, ...doc }));
      showToast("Settings saved");
    } catch (err) { onApiError(err, "Failed to save settings"); }
  };

  const overdueCount = estimates.filter((i) => i.status === "Due" && i.dueDate && new Date(i.dueDate) < new Date()).length;
  const data = { customers, items, orders, estimates, invoices: estimates, challans, expenses, payments, labourSessions };

  /* ---- view renderer ---- */
  const renderView = () => {
    switch (view) {
      case "dashboard": return <Dashboard data={data} settings={settings} openModal={openModal} go={setView} />;
      case "customers": return <CustomersView customers={customers} estimates={estimates} openModal={openModal} removeCustomer={removeCustomer}
        onSelectCustomer={(id: string) => { setSelectedCustomerId(id); setView("customerDetail"); }} />;
      case "customerDetail": return <CustomerDetailView
        customer={customers.find((c: any) => c.id === selectedCustomerId)}
        estimates={estimates} payments={payments} items={items} openModal={openModal} currency={settings.currency}
        onBack={() => setView("customers")} />;
      case "items":     return <ItemsView items={items} openModal={openModal} currency={settings.currency} removeItem={removeItem} />;
      case "orders":    return <OrdersView orders={orders} items={items} openModal={openModal} markOrderReceived={markOrderReceived} removeOrder={removeOrder} />;
      case "challans":  return <DocumentList type="challan" docs={challans} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={removeDoc("challan")} updateStatus={updateDocStatus("challan")} />;
      case "estimates":  return (
        <div className="px-5 pt-1">
          {autoReminder && overdueCount > 0 && <div className="mb-3 rounded-2xl bg-warn-50 px-4 py-3 text-sm font-semibold text-warn-700 flex items-center gap-2"><AlertCircle size={16} /> {overdueCount} estimate{overdueCount !== 1 ? "s" : ""} overdue.</div>}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-paper px-4 py-2.5 text-xs text-ink/50">
            <span>Next print → <b className="text-ink/80">top-{printSide}</b> corner</span>
            <button onClick={togglePrintSide} className="font-semibold text-brand-600">Switch side ⇄</button>
          </div>
          <div className="-mx-5">
            <DocumentList type="estimate" docs={estimates} customers={customers} items={items} currency={settings.currency} openModal={openModal}
              removeDoc={removeDoc("estimate")}
              updateStatus={updateDocStatus("estimate")}
              recordPayment={recordPaymentFor} onReturn={(doc: any) => openModal("return", { doc })} onDeliver={(doc: any) => openModal("delivery", { doc })} onShareInvoice={(inv: any) => setShareInvoice(inv)}
              onPrint={printEstimate}
              onView={(doc: any) => openModal("viewEstimate", { doc })} />
          </div>
        </div>
      );
      case "payments":  return <PaymentsView payments={payments} customers={customers} currency={settings.currency} openModal={openModal} removePayment={removePayment} />;
      case "expenses":  return <ExpensesView expenses={expenses} currency={settings.currency} openModal={openModal} removeExpense={removeExpense} />;
      case "todo":      return <ToDoTrackingView items={items} settings={settings} openModal={openModal} />;
      case "labour":    return <LabourTrackingView sessions={labourSessions} knownWorkers={labourWorkers} onSave={saveLabourSession} onRemove={removeLabourSession} currency={settings.currency} />;
      case "contractors": return <ContractorScorecardView estimates={estimates} items={items} currency={settings.currency} contractors={contractors} onSavePhone={saveContractorPhone} showToast={showToast} />;
      case "reports":      return <ReportsView data={data} currency={settings.currency} settings={settings} />;
      case "sharereport":  return <ShareReportView invoices={estimates} items={items} customers={customers} currency={settings.currency} settings={settings} />;
      case "billing":      return <AdvancedBillingView autoReminder={autoReminder} setAutoReminder={setAutoReminder} overdueCount={overdueCount} settings={settings} />;
      case "settings":  return <SettingsView settings={settings} setSettings={saveSettings} />;
      default: return null;
    }
  };

  /* ---- modal renderer ---- */
  const renderModal = () => {
    if (!modal) return null;
    const { type, payload } = modal;
    if (type === "viewEstimate") return <ViewEstimateModal doc={payload?.doc} customers={customers} items={items} currency={settings.currency} onClose={closeModal}
      onMarkPaid={(doc: any) => { updateDocStatus("estimate")(doc.id, "Paid"); closeModal(); }}
      onShareInvoice={(doc: any) => { closeModal(); setShareInvoice(doc); }} />;

    if (type === "customer") return <FieldModal title="New Customer" fields={[
      { key: "name",     label: "Customer name",                     required: true, placeholder: "Acme Co." },
      { key: "email",    label: "Email",                             placeholder: "name@example.com" },
      { key: "phone",    label: "Phone (with country code)",         placeholder: "+91 98765 43210" },
      { key: "location", label: "Location / Address",                type: "location", placeholder: "City, area or full address" },
    ]} onClose={closeModal} onSave={saveCustomer} />;

    if (type === "item") {
      const editingItem = payload?.editingItem;
      return <FieldModal title={editingItem ? "Edit Item" : "New Item"} fields={[
        { key: "name",          label: "Item name",           required: true, placeholder: "Web design service" },
        { key: "category",      label: "Category",            type: "select", options: ITEM_CATEGORIES.map((c) => ({ value: c, label: c })), required: true },
        { key: "sellingPrice",  label: "Selling price",       type: "number", required: true, placeholder: "0.00" },
        { key: "purchasePrice", label: "Purchase price",      type: "number", placeholder: "0.00" },
        { key: "unit",          label: "Unit",                placeholder: "hr / pc / job" },
        { key: "stock",         label: editingItem ? "Stock (qty)" : "Opening stock (qty)", type: "number", placeholder: "0" },
        { key: "lowStock",      label: "Low stock alert at",  type: "number", placeholder: `${LOW_STOCK_DEFAULT}` },
      ]} initial={editingItem ? {
        id: editingItem.id, name: editingItem.name, category: editingItem.category || "Others",
        sellingPrice: editingItem.sellingPrice ?? editingItem.price, purchasePrice: editingItem.purchasePrice,
        unit: editingItem.unit, stock: editingItem.stock, lowStock: editingItem.lowStock ?? LOW_STOCK_DEFAULT,
      } : { category: "Others" }} onClose={closeModal} onSave={saveItem} />;
    }

    if (type === "expense") return <FieldModal title="Record Expense" fields={[
      { key: "category", label: "Category", required: true, placeholder: "Travel, Software..." },
      { key: "vendor",   label: "Vendor",   placeholder: "Optional" },
      { key: "amount",   label: "Amount",   type: "number", required: true, placeholder: "0.00" },
      { key: "date",     label: "Date",     type: "date" },
    ]} initial={{ date: today() }} onClose={closeModal} onSave={saveExpense} />;

    if (type === "order") return <OrderModal items={items} onClose={closeModal} onSave={saveOrder} prefill={payload} />;

    if (type === "challan")
      return <ChallanModal onClose={closeModal} onSave={saveChallan} />;

    if (type === "estimate")
      return <DocumentModal type={type} customers={customers} items={items} estimates={estimates} editingDoc={payload?.editingDoc} onClose={closeModal} onSave={(v: any) => saveDocument(type, v)} />;

    if (type === "payment") {
      const invoiceOptions = estimates.filter((i) => i.status !== "Paid").map((i) => ({ value: i.id, label: `${i.number} — ${fmtMoney(Number(i.total || 0) - Number(i.amountPaid || 0), settings.currency)} due` }));
      const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
      return <FieldModal title="Record Payment" fields={[
        { key: "customerId", label: "Customer", type: "select", options: customerOptions, required: true },
        { key: "invoiceId",  label: "Against estimate", type: "select", options: [{ value: "", label: "No specific estimate" }, ...invoiceOptions] },
        { key: "amount",     label: "Amount",  type: "number", required: true },
        { key: "method",     label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",       label: "Date",    type: "date" },
      ]} initial={{ date: today(), customerId: payload?.customerId || "", invoiceId: payload?.invoiceId || "", amount: payload?.amount || "" }} onClose={closeModal} onSave={savePayment} />;
    }

    if (type === "return") {
      return <ReturnModal doc={payload?.doc} items={items} currency={settings.currency} onClose={closeModal}
        onSave={(lines: { itemId: string; qty: number }[]) => saveReturn(payload?.doc?.id, lines)} />;
    }
    if (type === "delivery") {
      return <DeliveryModal doc={payload?.doc} items={items} onClose={closeModal}
        onSave={(lines: { itemId: string; qty: number }[]) => saveDelivery(payload?.doc?.id, lines)} />;
    }
    return null;
  };

  const businessWa = settings.businessWhatsApp;
  const shareCustomer = shareInvoice ? customers.find((c) => c.id === shareInvoice.customerId) : null;
  const sharePayment = shareInvoice ? payments.find((p) => p.invoiceId === shareInvoice.id) : null;

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-paper text-ink/50">
        <Loader2 size={28} className="animate-spin text-brand-500" />
        <p className="text-sm font-medium">Loading your data…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
        <AlertCircle size={28} className="text-bad-500" />
        <p className="text-sm font-medium text-ink/70">{loadError}</p>
        <button onClick={() => window.location.reload()} className="rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          Try again
        </button>
        <button onClick={onSignOut} className="text-xs font-medium text-ink/50">Sign out</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-paper font-sans text-ink">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} active={view} onNav={setView} settings={settings} onSignOut={onSignOut} />
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        <Topbar onMenu={() => setSidebarOpen(true)} settings={settings} view={view} onOpenSearch={() => setGlobalSearchOpen(true)} />
        {renderView()}
      </div>

      <BottomNav
        active={view}
        onNav={setView}
        onMore={() => setSidebarOpen(true)}
        onQuickAction={(key: string) => openModal(key === "customer" ? "customer" : key === "expense" ? "expense" : "estimate")}
      />

      <a href={businessWa ? waLink(businessWa, "Hi, I have a question about my account.") : "#settings"}
        onClick={(e) => { if (!businessWa) { e.preventDefault(); setView("settings"); showToast("Add a WhatsApp number in Settings first"); } }}
        target={businessWa ? "_blank" : undefined} rel="noreferrer"
        className="fixed bottom-24 md:bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-card active:scale-95 transition"
        style={{ backgroundColor: businessWa ? WHATSAPP_GREEN : "#94a3b8" }}>
        <Phone size={24} />
      </a>

      {renderModal()}
      {globalSearchOpen && (
        <GlobalSearchOverlay
          customers={customers} items={items} estimates={estimates} currency={settings.currency}
          onClose={() => setGlobalSearchOpen(false)}
          onSelectCustomer={(id: string) => { setSelectedCustomerId(id); setView("customerDetail"); setGlobalSearchOpen(false); }}
          onSelectItem={() => { setView("items"); setGlobalSearchOpen(false); }}
          onSelectEstimate={(doc: any) => { openModal("viewEstimate", { doc }); setGlobalSearchOpen(false); }}
        />
      )}

      {shareInvoice && (
        <InvoiceShareModal invoice={shareInvoice} customer={shareCustomer} items={items} settings={settings} payment={sharePayment} onClose={() => setShareInvoice(null)} />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full bg-brand-600 pl-5 pr-2 py-2 text-sm font-semibold text-white shadow-lg max-w-sm">
          <span className="text-center">{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => { toast.undo?.(); setToast(null); }}
              className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
