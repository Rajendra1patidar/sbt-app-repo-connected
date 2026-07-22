import React, { useState } from "react";
import { AlertTriangle, Check, Trash2, X } from "lucide-react";
import { MAX_ENTRY_ROWS } from "../../lib/constants";
import { today } from "../../lib/format";

export function ChallanModal({ onClose, onSave }: any) {
  const [route, setRoute] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [byWhom, setByWhom] = useState("");
  const [transporter, setTransporter] = useState("");
  const [expenses, setExpenses] = useState([{ label: "", amount: "" }]);
  const [incomes, setIncomes] = useState([{ label: "", amount: "" }]);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [feeVerified, setFeeVerified] = useState(false);

  const addRow = (setter: any, list: any[]) => {
    if (list.length < MAX_ENTRY_ROWS) setter((r: any[]) => [...r, { label: "", amount: "" }]);
  };
  const updateRow = (setter: any, list: any[], idx: number, field: string, val: string) => {
    setter(list.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRow = (setter: any, list: any[], idx: number) => {
    if (list.length > 1) setter(list.filter((_, i) => i !== idx));
  };

  const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalIncomes = incomes.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const canSave = route.trim().length > 0;

  const inputCls = "w-full rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300";
  const labelCls = "mb-1 block text-xs font-semibold text-ink/50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[93vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">New Delivery Challan</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        {/* Row 1: Route | From Date | To Date */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Route *</label>
            <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Mumbai → Pune" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>From date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* By Whom | Transporter */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>By Whom</label>
            <input value={byWhom} onChange={(e) => setByWhom(e.target.value)} placeholder="Driver / person name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Transporter</label>
            <input value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="Transport company / vehicle" className={inputCls} />
          </div>
        </div>

        {/* Expense Types */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Expense Types</label>
            {expenses.length < MAX_ENTRY_ROWS && (
              <button onClick={() => addRow(setExpenses, expenses)} className="text-xs font-semibold text-brand-600">+ Add ({expenses.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {expenses.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setExpenses, expenses, i, "label", e.target.value)} placeholder="Expense label (e.g. Fuel)" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setExpenses, expenses, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-line px-3 py-2 text-sm" />
                {expenses.length > 1 && <button onClick={() => removeRow(setExpenses, expenses, i)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalExpenses > 0 && <p className="mt-1 text-right text-xs text-ink/40">Total: <span className="font-semibold text-bad-600">₹{totalExpenses.toFixed(2)}</span></p>}
        </div>

        {/* Income Types */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Income Types</label>
            {incomes.length < MAX_ENTRY_ROWS && (
              <button onClick={() => addRow(setIncomes, incomes)} className="text-xs font-semibold text-brand-600">+ Add ({incomes.length}/{MAX_ENTRY_ROWS})</button>
            )}
          </div>
          <div className="space-y-2">
            {incomes.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} onChange={(e) => updateRow(setIncomes, incomes, i, "label", e.target.value)} placeholder="Income label (e.g. Freight)" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
                <input type="number" value={r.amount} onChange={(e) => updateRow(setIncomes, incomes, i, "amount", e.target.value)} placeholder="Amount" className="w-28 rounded-xl border border-line px-3 py-2 text-sm" />
                {incomes.length > 1 && <button onClick={() => removeRow(setIncomes, incomes, i)} className="rounded-full p-1.5 text-bad-400 hover:bg-bad-50"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {totalIncomes > 0 && <p className="mt-1 text-right text-xs text-ink/40">Total: <span className="font-semibold text-good-600">₹{totalIncomes.toFixed(2)}</span></p>}
        </div>

        {/* Delivery Fee */}
        <div className={`rounded-2xl border p-4 space-y-3 ${!feeVerified && deliveryFee ? "border-warn-400 bg-warn-50" : "border-line bg-paper"}`}>
          <div>
            <label className={labelCls}>Delivery Fee</label>
            <input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="0.00" className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white ${!feeVerified && deliveryFee ? "border-warn-400" : "border-line"}`} />
          </div>
          <button
            type="button"
            onClick={() => setFeeVerified((v) => !v)}
            className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 transition select-none"
          >
            <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition ${feeVerified ? "border-good-500 bg-good-500" : "border-line bg-white"}`}>
              {feeVerified && <Check size={11} className="text-white" />}
            </span>
            <span className={`text-sm font-medium ${feeVerified ? "text-good-700" : "text-ink/70"}`}>Verify delivery fee</span>
            {!feeVerified && deliveryFee && <span className="ml-auto text-xs font-semibold text-warn-600 flex items-center gap-1"><AlertTriangle size={12} /> Not verified</span>}
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ route, fromDate, toDate, byWhom, transporter, expenses, incomes, deliveryFee: Number(deliveryFee) || 0, feeVerified, total: totalIncomes - totalExpenses + (Number(deliveryFee) || 0) })}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">Save Challan</button>
        </div>
      </div>
    </div>
  );
}
