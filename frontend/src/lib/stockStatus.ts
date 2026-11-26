import { LOW_STOCK_DEFAULT } from "./constants";
import { qtyText } from "./money";

/**
 * One definition of "how is this item doing", shared by Items, Inventory and the item sheet,
 * so a row and the sheet it opens can never disagree.
 *
 * The alert level is compared with the piece count (`stock`), the same as the server's reorder
 * check and the Home alerts. (The old item drawer compared weight items in kilograms, so the same
 * item could read "Healthy" there and "Low" in the list.)
 */
export type StockState = "out" | "low" | "watch" | "ok";

export const isWeightItem = (it: any) => it?.trackingMode === "weight";

export function alertLevel(it: any): number {
  return Number(it?.lowStock ?? LOW_STOCK_DEFAULT) || 0;
}

export function stockState(it: any): StockState {
  const pieces = Number(it?.stock) || 0;
  const kg = Number(it?.stockKg) || 0;
  const empty = isWeightItem(it) ? pieces <= 0 && kg <= 0 : pieces <= 0;
  if (empty) return "out";
  const level = alertLevel(it);
  if (pieces <= level) return "low";
  if (pieces <= level * 1.5) return "watch";
  return "ok";
}

/** The quantity a person thinks of as "how much": kilograms for weight items, pieces for the rest. */
export function onHand(it: any): number {
  return isWeightItem(it) ? Number(it?.stockKg) || 0 : Number(it?.stock) || 0;
}

/** "120 bags", "82.5 kg", "40 pc (3 box + 10 pc)". */
export function stockText(it: any, stock = Number(it?.stock) || 0, stockKg = Number(it?.stockKg) || 0): string {
  if (isWeightItem(it)) return `${qtyText(stockKg)} kg`;
  if (it?.trackingMode === "box" && Number(it?.piecesPerBox) > 0) {
    const boxes = Math.floor(stock / it.piecesPerBox);
    const loose = stock % it.piecesPerBox;
    return `${qtyText(boxes)} box${loose > 0 ? ` + ${qtyText(loose)} pc` : ""}`;
  }
  return `${qtyText(stock)} ${it?.unit || "unit"}`;
}

/** Cost value of what is on hand (weighted-average purchase price × quantity), as the server values stock. */
export function stockValue(it: any): number {
  return onHand(it) * (Number(it?.purchasePrice) || 0);
}

/** What one unit sells for, as a short phrase: "₹390 a bag", "₹62.5 a kg". */
export function unitName(it: any): string {
  return isWeightItem(it) ? "kg" : it?.unit || "unit";
}
