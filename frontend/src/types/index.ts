export interface InvoiceLine {
  itemId: string;
  qty: number;
  rate: number;
  discountAmount?: number;
  // Weight-mode items only: pieces physically removed, captured independently
  // of `qty` (which holds the weighed kg for these items).
  piecesQty?: number;
  // Which godown this line dispatches from. Omitted falls back to the
  // owner's default godown on the backend.
  godownId?: string;
}
