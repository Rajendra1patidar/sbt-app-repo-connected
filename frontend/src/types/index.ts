export interface InvoiceLine {
  itemId: string;
  qty: number;
  rate: number;
  discountAmount?: number;
}
