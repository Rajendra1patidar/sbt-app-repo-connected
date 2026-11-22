import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { CloseIcon, PlusIcon } from "../ui/icons";
import { Field, Group, GroupLabel, GroupRow, IconButton, Switch, TextInput } from "../ui/kit";
import { MAX_ENTRY_ROWS } from "../../lib/constants";
import { today, round2 } from "../../lib/format";
import { inr } from "../../lib/money";

type Row = { label: string; amount: string };
const blankRow = (): Row => ({ label: "", amount: "" });

/** New delivery challan: the trip, who took it, what it cost, what it brought in, and the delivery fee. */
export function ChallanModal({ onClose, onSave, currency = "₹" }: any) {
  const [route, setRoute] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [byWhom, setByWhom] = useState("");
  const [transporter, setTransporter] = useState("");
  const [expenses, setExpenses] = useState<Row[]>([blankRow()]);
  const [incomes, setIncomes] = useState<Row[]>([blankRow()]);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [feeVerified, setFeeVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalExpenses = round2(expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const totalIncomes = round2(incomes.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const canSave = route.trim().length > 0;
  const dirty = !!(route || byWhom || transporter || deliveryFee || feeVerified
    || expenses.some((r) => r.label || r.amount) || incomes.some((r) => r.label || r.amount)
    || fromDate !== today() || toDate !== today());

  const save = () => {
    if (!canSave || saving) return;
    setSaving(true);
    // The store saves (and closes this sheet itself); the button only re-enables if it didn't.
    Promise.resolve(onSave({
      route, fromDate, toDate, byWhom, transporter, expenses, incomes,
      deliveryFee: Number(deliveryFee) || 0, feeVerified,
      total: totalIncomes - totalExpenses + (Number(deliveryFee) || 0),
    })).finally(() => setSaving(false));
  };

  const rowsEditor = (
    noun: string, rows: Row[], setRows: (r: Row[]) => void, labelHint: string, total: number,
  ) => (
    <>
      <GroupLabel right={<span className="tabular-nums">{total > 0 ? `Total ${inr(total, currency)}` : `${rows.length}/${MAX_ENTRY_ROWS}`}</span>}>{noun === "expense" ? "Expenses" : "Income"}</GroupLabel>
      <Group>
        {rows.map((r, i) => (
          <GroupRow key={i} className="!gap-2 py-2">
            <div className="min-w-0 flex-1">
              <TextInput value={r.label} aria-label={`${noun} ${i + 1} label`} placeholder={labelHint}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </div>
            <div className="w-28 shrink-0">
              <TextInput type="number" inputMode="decimal" step="any" min="0" value={r.amount} aria-label={`${noun} ${i + 1} amount`} placeholder="Amount"
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </div>
            {rows.length > 1 && (
              <IconButton label={`Remove ${noun} row ${i + 1}`} tone="danger" layout="compact" onClick={() => setRows(rows.filter((_, j) => j !== i))}><CloseIcon size={18} /></IconButton>
            )}
          </GroupRow>
        ))}
        {rows.length < MAX_ENTRY_ROWS && (
          <GroupRow onClick={() => setRows([...rows, blankRow()])} className="h-12">
            <span className="flex items-center gap-2 text-[16px] font-medium text-brand-600"><PlusIcon size={18} /> Add {noun}</span>
          </GroupRow>
        )}
      </Group>
    </>
  );

  return (
    <FormSheet title="New challan" onClose={onClose} dirty={dirty} onSave={save} saveLabel="Save challan" canSave={canSave} saving={saving} tall>
      <div className="space-y-3.5 pt-1">
        <Field label="Route *"><TextInput autoFocus value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Mumbai to Pune" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From date"><TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
          <Field label="To date"><TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
        </div>
        <Field label="By whom"><TextInput value={byWhom} onChange={(e) => setByWhom(e.target.value)} placeholder="Driver or person's name" /></Field>
        <Field label="Transporter"><TextInput value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="Transport company or vehicle" /></Field>
      </div>

      {rowsEditor("expense", expenses, setExpenses, "What for (e.g. Fuel)", totalExpenses)}
      {rowsEditor("income", incomes, setIncomes, "What from (e.g. Freight)", totalIncomes)}

      <GroupLabel>Delivery fee</GroupLabel>
      <Field label="Fee charged for the trip">
        <TextInput type="number" inputMode="decimal" step="any" min="0" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="0" />
      </Field>
      <Group className="mt-3">
        <GroupRow className="min-h-[56px] py-2">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] text-ink">Delivery fee verified</p>
              {deliveryFee && !feeVerified && <p className="text-caption text-warn-700">Not verified yet</p>}
            </div>
            <Switch checked={feeVerified} onChange={setFeeVerified} label="Delivery fee verified" />
          </div>
        </GroupRow>
      </Group>
    </FormSheet>
  );
}
