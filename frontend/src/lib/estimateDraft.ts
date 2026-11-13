import { useEffect, useState } from "react";
import { ESTIMATE_DRAFT_KEY } from "./account";

const DRAFT_EVENT = "sbt-estimate-draft";
const announce = () => { try { window.dispatchEvent(new Event(DRAFT_EVENT)); } catch { /* ignore */ } };

/**
 * The estimate form saves itself as you type. A half-made bill is kept on this
 * device only (not sent anywhere) until it is saved or discarded.
 */
export interface EstimateDraft {
  savedAt: number;
  customerId: string;
  date: string;
  dueDate: string;
  lines: any[];
  freight: string;
  labour: string;
  contractorName: string;
  destination: string;
  notes: string;
  showPreviousBalance: boolean;
  /** Which optional fields the person opened (Freight, Labour, ...). */
  opened: string[];
}

export function loadDraft(): EstimateDraft | null {
  try {
    const raw = window.localStorage.getItem(ESTIMATE_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as EstimateDraft;
    return d && typeof d === "object" ? d : null;
  } catch { return null; }
}

export function saveDraft(d: EstimateDraft) {
  try { window.localStorage.setItem(ESTIMATE_DRAFT_KEY, JSON.stringify(d)); } catch { /* storage full or unavailable */ }
  announce();
}

export function clearDraft() {
  try { window.localStorage.removeItem(ESTIMATE_DRAFT_KEY); } catch { /* ignore */ }
  announce();
}

/** A draft is only worth keeping if the person has put something in it. */
export function draftHasContent(d: Pick<EstimateDraft, "customerId" | "lines" | "freight" | "labour" | "notes">): boolean {
  return !!d.customerId || (d.lines || []).some((l) => l.itemId) || !!d.freight || !!d.labour || !!d.notes;
}

/** The saved draft, kept fresh as the form writes and clears it. */
export function useEstimateDraft(): EstimateDraft | null {
  const [draft, setDraft] = useState<EstimateDraft | null>(() => (draftExists() ? loadDraft() : null));
  useEffect(() => {
    const sync = () => setDraft(draftExists() ? loadDraft() : null);
    window.addEventListener(DRAFT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(DRAFT_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return draft && draftHasContent(draft) ? draft : null;
}

function draftExists(): boolean {
  try { return !!window.localStorage.getItem(ESTIMATE_DRAFT_KEY); } catch { return false; }
}
