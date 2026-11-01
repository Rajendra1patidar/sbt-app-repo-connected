import React from "react";
import { Lock } from "lucide-react";
import { Card } from "./UIPrimitives";

/** Shown instead of an owner-only screen when a staff login opens it (e.g. from a saved link). */
export function OwnerOnlyNotice({ onHome }: { onHome: () => void }) {
  return (
    <div className="px-5 pb-28 pt-6">
      <Card className="mx-auto max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-paper">
          <Lock size={18} className="text-ink/60" />
        </div>
        <h3 className="text-sm font-bold text-ink">Only the business owner can open this</h3>
        <p className="text-xs text-ink/60">
          Your login can create estimates, record payments and manage stock. Ask the owner if you need something from this screen.
        </p>
        <button onClick={onHome} className="rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          Back to Home
        </button>
      </Card>
    </div>
  );
}
