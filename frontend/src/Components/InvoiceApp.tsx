import React, { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, Phone } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { pathForView, viewForPath } from "../lib/routes";
import { BottomNav } from "./layout/BottomNav";
import { GlobalSearchOverlay } from "./layout/GlobalSearchOverlay";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import { ChallanModal } from "./modals/ChallanModal";
import { ConfirmDeletePopup } from "./modals/ConfirmDeletePopup";
import { DeliveryModal } from "./modals/DeliveryModal";
import { DocumentModal } from "./modals/DocumentModal";
import { FieldModal } from "./modals/FieldModal";
import { InvoiceShareModal } from "./modals/InvoiceShareModal";
import { OrderModal } from "./modals/OrderModal";
import { PaymentAllocationModal } from "./modals/PaymentAllocationModal";
import { ReturnModal } from "./modals/ReturnModal";
import { ViewEstimateModal } from "./modals/ViewEstimateModal";
import { AdvancedBillingView } from "./views/AdvancedBillingView";
import { ApprovalsView } from "./views/ApprovalsView";
import { ContractorScorecardView } from "./views/ContractorScorecardView";
import { CustomerCreditView } from "./views/CustomerCreditView";
import { CashFlowForecastView } from "./views/CashFlowForecastView";
import { CustomerDetailView } from "./views/CustomerDetailView";
import { CustomersView } from "./views/CustomersView";
import { Dashboard } from "./views/Dashboard";
import { DocumentList } from "./views/DocumentList";
import { ExpensesView } from "./views/ExpensesView";
import { FinancialYearView } from "./views/FinancialYearView";
import { ToDoTrackingView } from "./views/InventoryView";
import { ItemsView } from "./views/ItemsView";
import { LabourTrackingView } from "./views/LabourTrackingView";
import { LedgerReportsView } from "./views/LedgerReportsView";
import { BankReconciliationView } from "./views/BankReconciliationView";
import { OrdersView } from "./views/OrdersView";
import { PaymentsView } from "./views/PaymentsView";
import { PurchasesView } from "./views/PurchasesView";
import { ReportsView } from "./views/ReportsView";
import { SettingsView } from "./views/SettingsView";
import { ShareReportView } from "./views/ShareReportView";
import { VendorsView } from "./views/VendorsView";
import { VendorScorecardView } from "./views/VendorScorecardView";
import { ITEM_BRANDS, ITEM_CATEGORIES, ITEM_UNITS, LOW_STOCK_DEFAULT, WHATSAPP_GREEN } from "../lib/constants";
import { waLink } from "../lib/contactLinks";
import { fmtDate, fmtMoney, today } from "../lib/format";

/* ---- Main App shell: layout + router. All domain data/handlers live in useAppStore now. ---- */

export function InvoiceApp({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const view = viewForPath(location.pathname);
  const goToView = (id: string, query?: string) => navigate(pathForView(id) + (query ? `?${query}` : ""));

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const {
    loading, loadError, settings, customers, items, orders, estimates, challans,
    expenses, payments, labourSessions, labourWorkers, contractors, vendors, purchases,
    reorderSuggestions, toast, modal, confirmDeleteFor, shareInvoice, autoReminder, printSide,
    fetchAll, setOnSignOut, showToast, openModal, closeModal, cancelConfirmDelete,
    togglePrintSide, setAutoReminder, setShareInvoice,
    saveCustomer, removeCustomer, saveItem, removeItem, saveExpense, removeExpense,
    saveVendor, removeVendor, savePurchase, removePurchase,
    saveVendorPayment, savePurchasePayment, saveDocument, removeDoc, restoreDoc, updateDocStatus,
    savePayment, savePaymentSplit, saveReturn, saveDelivery, removePayment, saveOrder, removeOrder,
    payOrder, saveOrderPayment, saveLabourSession, removeLabourSession, saveContractorPhone,
    saveSettings, saveChallan, recordPaymentFor,
  } = useAppStore();

  useEffect(() => {
    setOnSignOut(onSignOut);
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const rate = ln.rate ?? it?.sellingPrice ?? 0;
      const discount = Number(ln.discountAmount || 0);
      const discountHtml = discount > 0 ? `<div class="ln" style="opacity:.65"><span class="ln-name">Discount</span><span class="ln-amt">-${fmtMoney(discount, settings.currency)}</span></div>` : "";
      return `<div class="ln"><span class="ln-name">${name} × ${qty} @ ${fmtMoney(rate, settings.currency)}</span><span class="ln-amt">${fmtMoney(qty * rate, settings.currency)}</span></div>${discountHtml}`;
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

  // deleted estimates are soft-deleted and voided — they stay in `estimates` for the
  // list view (greyed out behind a toggle) but must never feed reports, dashboards,
  // counts, or any other aggregate/lookup surface
  const activeEstimates = estimates.filter((i: any) => !i.deleted);
  const overdueCount = activeEstimates.filter((i: any) => i.status === "Due" && i.dueDate && new Date(i.dueDate) < new Date()).length;
  const data = { customers, items, orders, estimates: activeEstimates, invoices: activeEstimates, challans, expenses, payments, labourSessions, purchases, vendors };
  const itemCategories = settings.itemCategories?.length ? settings.itemCategories : ITEM_CATEGORIES;
  const itemBrands = settings.itemBrands?.length ? settings.itemBrands : ITEM_BRANDS;

  /* ---- route table (replaces the old `switch (view)` in renderView) ---- */
  const routes = (
    <Routes>
      <Route path="/" element={<Dashboard data={data} settings={settings} openModal={openModal} go={goToView} reorderSuggestions={reorderSuggestions} saveDocument={saveDocument} savePayment={savePayment} savePurchase={savePurchase} saveCustomer={saveCustomer} saveExpense={saveExpense} saveReturn={saveReturn} showToast={showToast} />} />
      <Route path="/customers" element={
        <CustomersView customers={customers} estimates={activeEstimates} openModal={openModal} removeCustomer={removeCustomer}
          onSelectCustomer={(id: string) => navigate(`/customers/${id}`)} />
      } />
      <Route path="/customers/:customerId" element={<CustomerDetailRoute />} />
      <Route path="/items" element={<ItemsView items={items} categories={itemCategories} brands={itemBrands} openModal={openModal} currency={settings.currency} removeItem={removeItem} purchases={purchases} estimates={activeEstimates} />} />
      <Route path="/orders" element={<OrdersView orders={orders} items={items} vendors={vendors} categories={itemCategories} currency={settings.currency} openModal={openModal} payOrder={payOrder} removeOrder={removeOrder} />} />
      <Route path="/vendors" element={<VendorsView vendors={vendors} purchases={purchases} currency={settings.currency} openModal={openModal} removeVendor={removeVendor} />} />
      <Route path="/purchases" element={<PurchasesView purchases={purchases} vendors={vendors} items={items} currency={settings.currency} openModal={openModal} removePurchase={removePurchase} />} />
      <Route path="/approvals" element={<ApprovalsView currency={settings.currency} />} />
      <Route path="/ledger" element={<LedgerReportsView currency={settings.currency} />} />
      <Route path="/bank-reconciliation" element={<BankReconciliationView currency={settings.currency} />} />
      <Route path="/financial-years" element={<FinancialYearView currency={settings.currency} />} />
      <Route path="/challans" element={<DocumentList type="challan" docs={challans} customers={customers} currency={settings.currency} openModal={openModal} removeDoc={(id: string) => removeDoc("challan", id)} updateStatus={(id: string, s: string) => updateDocStatus("challan", id, s)} />} />
      <Route path="/estimates" element={
        <div className="px-5 pt-1">
          {autoReminder && overdueCount > 0 && <div className="mb-3 rounded-2xl bg-warn-50 px-4 py-3 text-sm font-semibold text-warn-700 flex items-center gap-2"><AlertCircle size={16} /> {overdueCount} estimate{overdueCount !== 1 ? "s" : ""} overdue.</div>}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-paper px-4 py-2.5 text-xs text-ink/50">
            <span>Next print → <b className="text-ink/80">top-{printSide}</b> corner</span>
            <button onClick={togglePrintSide} className="font-semibold text-brand-600">Switch side ⇄</button>
          </div>
          <div className="-mx-5">
            <DocumentList type="estimate" docs={estimates} customers={customers} items={items} currency={settings.currency} openModal={openModal}
              initialStatusFilter={searchParams.get("filter") || undefined}
              removeDoc={(id: string) => removeDoc("estimate", id)}
              restoreDoc={restoreDoc}
              updateStatus={(id: string, s: string) => updateDocStatus("estimate", id, s)}
              recordPayment={recordPaymentFor} onReturn={(doc: any) => openModal("return", { doc })} onDeliver={(doc: any) => openModal("delivery", { doc })} onShareInvoice={(inv: any) => setShareInvoice(inv)}
              onPrint={printEstimate}
              onView={(doc: any) => openModal("viewEstimate", { doc })} />
          </div>
        </div>
      } />
      <Route path="/payments" element={<PaymentsView payments={payments} customers={customers} currency={settings.currency} openModal={openModal} removePayment={removePayment} estimates={activeEstimates} />} />
      <Route path="/expenses" element={<ExpensesView expenses={expenses} currency={settings.currency} openModal={openModal} removeExpense={removeExpense} />} />
      <Route path="/inventory" element={<ToDoTrackingView items={items} settings={settings} categories={itemCategories} orders={orders} openModal={openModal} reorderSuggestions={reorderSuggestions} />} />
      <Route path="/labour" element={<LabourTrackingView sessions={labourSessions} knownWorkers={labourWorkers} onSave={saveLabourSession} onRemove={removeLabourSession} currency={settings.currency} estimates={activeEstimates} items={items} customers={customers} />} />
      <Route path="/contractors" element={<ContractorScorecardView estimates={activeEstimates} items={items} currency={settings.currency} contractors={contractors} onSavePhone={saveContractorPhone} showToast={showToast} />} />
      <Route path="/vendor-scorecard" element={<VendorScorecardView currency={settings.currency} />} />
      <Route path="/customer-credit" element={<CustomerCreditView currency={settings.currency} />} />
      <Route path="/cash-flow-forecast" element={<CashFlowForecastView currency={settings.currency} />} />
      <Route path="/reports" element={<ReportsView data={data} currency={settings.currency} settings={settings} />} />
      <Route path="/share-report" element={<ShareReportView invoices={activeEstimates} items={items} customers={customers} currency={settings.currency} settings={settings} />} />
      <Route path="/billing" element={<AdvancedBillingView autoReminder={autoReminder} setAutoReminder={setAutoReminder} overdueCount={overdueCount} settings={settings} />} />
      <Route path="/settings" element={<SettingsView settings={settings} setSettings={saveSettings} />} />
      <Route path="*" element={<Dashboard data={data} settings={settings} openModal={openModal} go={goToView} reorderSuggestions={reorderSuggestions} saveDocument={saveDocument} savePayment={savePayment} savePurchase={savePurchase} saveCustomer={saveCustomer} saveExpense={saveExpense} saveReturn={saveReturn} showToast={showToast} />} />
    </Routes>
  );

  /* ---- modal renderer (unchanged from before, just sourced from the store) ---- */
  const renderModal = () => {
    if (!modal) return null;
    const { type, payload } = modal;
    if (type === "viewEstimate") return <ViewEstimateModal doc={payload?.doc} customers={customers} items={items} currency={settings.currency} onClose={closeModal}
      onMarkPaid={(doc: any) => { updateDocStatus("estimate", doc.id, "Paid"); closeModal(); }}
      onShareInvoice={(doc: any) => { closeModal(); setShareInvoice(doc); }} />;

    if (type === "customer") {
      const editingCustomer = payload?.editingCustomer;
      return <FieldModal title={editingCustomer ? "Edit Customer" : "New Customer"} fields={[
        { key: "name",         label: "Customer name",                     required: true, placeholder: "Acme Co." },
        { key: "email",        label: "Email",                             placeholder: "name@example.com" },
        { key: "phone",        label: "Phone (with country code)",         placeholder: "+91 98765 43210" },
        { key: "location",     label: "Location / Address",                type: "location", placeholder: "City, area or full address" },
        { key: "creditLimit",  label: "Credit limit",                      type: "number", placeholder: "No limit", helpText: "Optional. Warns (doesn't block) when a new estimate would push this customer's outstanding balance past it." },
      ]} initial={editingCustomer ? {
        id: editingCustomer.id, name: editingCustomer.name, email: editingCustomer.email,
        phone: editingCustomer.phone, location: editingCustomer.location,
        locationLat: editingCustomer.lat, locationLng: editingCustomer.lng,
        creditLimit: editingCustomer.creditLimit,
      } : undefined} onClose={closeModal} onSave={saveCustomer} />;
    }

    if (type === "item") {
      const editingItem = payload?.editingItem;
      const vendorOptions = vendors.map((v: any) => ({ value: v.id, label: v.name }));
      return <FieldModal title={editingItem ? "Edit Item" : "New Item"} fields={[
        { key: "name",          label: "Item name",           required: true, placeholder: "Web design service" },
        { key: "category",      label: "Category",            type: "select", options: itemCategories.map((c: string) => ({ value: c, label: c })), required: true },
        { key: "brand",         label: "Brand",                type: "select", options: [{ value: "", label: "No brand" }, ...itemBrands.map((b: string) => ({ value: b, label: b }))] },
        { key: "sellingPrice",  label: "Selling price",       type: "number", required: true, placeholder: "0.00" },
        editingItem
          ? { key: "purchasePrice", label: "Avg. purchase cost", type: "number", readOnly: true, helpText: "Auto-calculated from your Purchases — record a Purchase to update it." }
          : { key: "purchasePrice", label: "Opening purchase price", type: "number", placeholder: "0.00", helpText: "Starting cost estimate — future Purchases will roll this forward automatically." },
        { key: "unit",          label: "Unit",                type: "datalist", options: ITEM_UNITS, placeholder: "kg / pc / bundle" },
        { key: "stock",         label: editingItem ? "Stock (qty)" : "Opening stock (qty)", type: "number", placeholder: "0" },
        { key: "lowStock",      label: "Low stock alert at",  type: "number", placeholder: `${LOW_STOCK_DEFAULT}` },
        { key: "trackingMode",  label: "Track by",            type: "toggle", options: [{ value: "unit", label: "Units" }, { value: "box", label: "Box" }] },
        { key: "piecesPerBox",  label: "Pieces per box",      type: "number", placeholder: "e.g. 30", required: true, showIf: (v: any) => v.trackingMode === "box" },
        { key: "vendorId",      label: "Preferred vendor (for reorder suggestions)", type: "select", options: vendorOptions },
      ]} initial={editingItem ? {
        id: editingItem.id, name: editingItem.name, category: editingItem.category || "Others",
        brand: editingItem.brand || "",
        sellingPrice: editingItem.sellingPrice ?? editingItem.price ?? 0, purchasePrice: editingItem.purchasePrice,
        unit: editingItem.unit, stock: editingItem.stock, lowStock: editingItem.lowStock ?? LOW_STOCK_DEFAULT,
        trackingMode: editingItem.trackingMode || "unit", piecesPerBox: editingItem.piecesPerBox || 0,
        vendorId: editingItem.vendorId || "",
      } : { category: "Others", brand: "", trackingMode: "unit", piecesPerBox: 0 }} onClose={closeModal} onSave={saveItem} />;
    }

    if (type === "expense") return <FieldModal title="Record Expense" fields={[
      { key: "category", label: "Category", required: true, placeholder: "Travel, Software..." },
      { key: "vendor",   label: "Vendor",   placeholder: "Optional" },
      { key: "amount",   label: "Amount",   type: "number", required: true, placeholder: "0.00" },
      { key: "date",     label: "Date",     type: "date" },
    ]} initial={{ date: today() }} onClose={closeModal} onSave={saveExpense} />;

    if (type === "vendor") return <FieldModal title="New Vendor" fields={[
      { key: "name",     label: "Vendor name",        required: true, placeholder: "Ambuja Cement Distributor" },
      { key: "phone",    label: "Phone",               placeholder: "+91 98765 43210" },
      { key: "location", label: "Location / Address",  type: "location", placeholder: "City, area or full address" },
      { key: "notes",    label: "Notes",               type: "textarea", placeholder: "Optional" },
    ]} onClose={closeModal} onSave={saveVendor} />;

    if (type === "purchase") {
      const vendorOptions = vendors.map((v: any) => ({ value: v.id, label: v.name }));
      const itemOptions = items.map((i: any) => ({ value: i.id, label: i.name }));
      return <FieldModal title="New Purchase" fields={[
        { key: "vendorId",      label: "Vendor",              type: "select", options: vendorOptions, required: true },
        { key: "itemId",        label: "Item",                type: "select", options: itemOptions, required: true },
        { key: "qty",           label: "Quantity",            type: "number", required: true, placeholder: "0" },
        { key: "rate",          label: "Rate per unit",       type: "number", required: true, placeholder: "0.00" },
        { key: "date",          label: "Date",                type: "date" },
        { key: "paymentStatus", label: "Payment status",      type: "toggle", options: [{ value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" }] },
        { key: "amountPaid",    label: "Amount paid now",     type: "number", placeholder: "0.00", showIf: (v: any) => v.paymentStatus === "partial" },
        { key: "notes",         label: "Notes",               type: "textarea", placeholder: "Optional" },
      ]} initial={{ date: today(), paymentStatus: "unpaid", itemId: payload?.itemId, vendorId: payload?.vendorId, qty: payload?.qty }} onClose={closeModal}
        onSave={(v: any) => savePurchase(v)} />;
    }

    if (type === "vendorPayment") {
      return <FieldModal title={`Pay ${payload?.vendorName || "Vendor"} (unallocated)`} fields={[
        { key: "amount", label: "Amount",  type: "number", required: true, placeholder: "0.00" },
        { key: "method", label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",   label: "Date",    type: "date" },
        { key: "notes",  label: "Notes",   placeholder: "Optional" },
      ]} initial={{ date: today(), vendorId: payload?.vendorId, amount: payload?.amount || "" }} onClose={closeModal}
        onSave={(v: any) => saveVendorPayment({ ...v, vendorId: payload?.vendorId })} />;
    }

    if (type === "purchasePayment") {
      return <FieldModal title={`Pay ${payload?.vendorName || "Purchase"}`} fields={[
        { key: "amount", label: `Amount (${fmtMoney(payload?.remaining || 0, settings.currency)} remaining)`, type: "number", required: true, placeholder: "0.00" },
        { key: "method", label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",   label: "Date",    type: "date" },
        { key: "notes",  label: "Notes",   placeholder: "Optional" },
      ]} initial={{ date: today(), amount: payload?.remaining || "" }} onClose={closeModal}
        onSave={(v: any) => savePurchasePayment({ ...v, purchaseId: payload?.purchaseId })} />;
    }

    if (type === "order") return <OrderModal items={items} vendors={vendors} currency={settings.currency} onClose={closeModal} onSave={saveOrder} prefill={payload} />;

    if (type === "orderPayment") {
      return <FieldModal title={`Pay ${payload?.itemName || "Order"}`} fields={[
        { key: "amount", label: `Amount (${fmtMoney(payload?.remaining || 0, settings.currency)} remaining)`, type: "number", required: true, placeholder: "0.00" },
        { key: "method", label: "Method",  type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }] },
        { key: "date",   label: "Date",    type: "date" },
        { key: "notes",  label: "Notes",   placeholder: "Optional" },
      ]} initial={{ date: today(), amount: payload?.remaining || "" }} onClose={closeModal}
        onSave={(v: any) => saveOrderPayment({ ...v, orderId: payload?.orderId })} />;
    }

    if (type === "challan")
      return <ChallanModal onClose={closeModal} onSave={saveChallan} />;

    if (type === "estimate")
      return <DocumentModal type={type} customers={customers} items={items} estimates={activeEstimates} editingDoc={payload?.editingDoc} prefillCustomerId={payload?.customerId} onClose={closeModal} onSave={(v: any) => saveDocument(type, v)} />;

    if (type === "payment") {
      return <PaymentAllocationModal
        customers={customers}
        estimates={activeEstimates}
        currency={settings.currency}
        initialCustomerId={payload?.customerId || ""}
        initialInvoiceId={payload?.invoiceId || ""}
        onClose={closeModal}
        onSave={savePaymentSplit}
      />;
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
  const shareCustomer = shareInvoice ? customers.find((c: any) => c.id === shareInvoice.customerId) : null;
  const sharePayment = shareInvoice ? payments.find((p: any) => p.invoiceId === shareInvoice.id) : null;

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
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} active={view} onNav={goToView} settings={settings} onSignOut={onSignOut}
        estimates={activeEstimates} items={items} overdueCount={overdueCount} />
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        <Topbar onMenu={() => setSidebarOpen(true)} settings={settings} view={view} onOpenSearch={() => setGlobalSearchOpen(true)} />
        {routes}
      </div>

      <BottomNav
        active={view}
        onNav={goToView}
        onMore={() => setSidebarOpen(true)}
        onQuickAction={(key: string) => openModal(key === "customer" ? "customer" : key === "expense" ? "expense" : "estimate")}
      />

      <a href={businessWa ? waLink(businessWa, "Hi, I have a question about my account.") : "#settings"}
        onClick={(e) => { if (!businessWa) { e.preventDefault(); goToView("settings"); showToast("Add a WhatsApp number in Settings first"); } }}
        target={businessWa ? "_blank" : undefined} rel="noreferrer"
        className="fixed bottom-24 md:bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-card active:scale-95 transition"
        style={{ backgroundColor: businessWa ? WHATSAPP_GREEN : "#94a3b8" }}>
        <Phone size={24} />
      </a>

      {renderModal()}
      {confirmDeleteFor && (
        <ConfirmDeletePopup
          label={confirmDeleteFor.label}
          description={confirmDeleteFor.description}
          onConfirm={confirmDeleteFor.onConfirm}
          onCancel={cancelConfirmDelete}
        />
      )}
      {globalSearchOpen && (
        <GlobalSearchOverlay
          customers={customers} items={items} estimates={activeEstimates} currency={settings.currency}
          onClose={() => setGlobalSearchOpen(false)}
          onSelectCustomer={(id: string) => { navigate(`/customers/${id}`); setGlobalSearchOpen(false); }}
          onSelectItem={() => { goToView("items"); setGlobalSearchOpen(false); }}
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
              onClick={() => { toast.undo?.(); useAppStore.getState().clearToast(); }}
              className="shrink-0 rounded-full bg-card/15 px-3 py-1.5 text-xs font-bold hover:bg-card/25"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Wraps CustomerDetailView so /customers/:customerId can drive it directly from the URL. */
function CustomerDetailRoute() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { customers, estimates, payments, items, openModal, settings } = useAppStore();
  const customer = customers.find((c: any) => c.id === customerId);
  const activeEstimates = estimates.filter((i: any) => !i.deleted);
  return (
    <CustomerDetailView
      customer={customer}
      estimates={activeEstimates} payments={payments} items={items} openModal={openModal} currency={settings.currency}
      onBack={() => navigate("/customers")}
    />
  );
}
