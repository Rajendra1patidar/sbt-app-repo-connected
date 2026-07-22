/* ---- Points helpers (1 cement bag = 1 pt, 1kg saria = 0.1 pt i.e. 10kg saria = 1 pt) ---- */

export const isCementItemName = (name: string) => /cement/i.test(name || "");

export const isSariaItemName = (name: string) => /saria/i.test(name || "");

export const sariaToPoints = (qty: number) => qty * 0.1;

// Points for a single estimate only (cement + saria lines on that one doc).
// Any other item on the estimate (CPVC, UPVC, Kasta, etc.) is ignored.
// We check the item's category first (this is the authoritative field set
// via the Cement/Saria/CPVC/UPVC/Kasta/Others dropdown); if an item has no
// category for some reason, we fall back to matching on its name.

export function estimatePoints(doc: any, items: any[]) {
  let cementQty = 0;
  let sariaQty = 0;
  (doc?.lines || []).forEach((ln: any) => {
    const it = items.find((i: any) => i.id === ln.itemId);
    const itemName = it?.name || ln.name || "";
    const category = it?.category || "";
    const qty = Number(ln.qty || 0);
    const isCement = category ? category === "Cement" : isCementItemName(itemName);
    const isSaria = category ? category === "Saria" : isSariaItemName(itemName);
    if (isCement) cementQty += qty;
    if (isSaria) sariaQty += qty;
  });
  return { cementQty, sariaQty, points: cementQty + sariaToPoints(sariaQty) };
}
