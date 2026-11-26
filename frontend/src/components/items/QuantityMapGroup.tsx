import { ItemQuantityMap } from "./ItemQuantityMap";
import { FoldedGroup } from "./FoldedGroup";

/** The quantity map, folded away until asked for, so a list screen opens on the list. */
export function QuantityMapGroup({ items, onSelectItem, className }: { items: any[]; onSelectItem: (it: any) => void; className?: string }) {
  if (!items.some((it) => !it.deleted && (Number(it.stock) > 0 || Number(it.stockKg) > 0))) return null;
  return (
    <FoldedGroup title="Quantity map" className={className}>
      <div className="px-4 py-3"><ItemQuantityMap items={items} onSelectItem={onSelectItem} /></div>
    </FoldedGroup>
  );
}
