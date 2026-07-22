/** Per-line advance-booking progress: how much of a booked qty has been collected/returned so far. */
export function bookingLineProgress(doc: any) {
  const deliveredByItem: Record<string, number> = {};
  for (const d of doc.deliveries || []) deliveredByItem[d.itemId] = (deliveredByItem[d.itemId] || 0) + d.qty;
  const returnedByItem: Record<string, number> = {};
  for (const r of doc.returns || []) returnedByItem[r.itemId] = (returnedByItem[r.itemId] || 0) + r.qty;

  return (doc.lines || []).map((l: any) => {
    const booked = Number(l.qty || 0);
    const delivered = deliveredByItem[l.itemId] || 0;
    const returned = returnedByItem[l.itemId] || 0;
    const remaining = Math.max(booked - delivered - returned, 0);
    return { itemId: l.itemId, rate: l.rate, booked, delivered, returned, remaining };
  });
}

/** True once every booked line on this estimate has been fully collected (or returned). */

export function isFullyCollected(doc: any) {
  const rows = bookingLineProgress(doc);
  return rows.length > 0 && rows.every((r: any) => r.remaining <= 0);
}
