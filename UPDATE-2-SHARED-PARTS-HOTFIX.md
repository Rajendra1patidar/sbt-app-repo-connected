# Hotfix for the shared-parts zip: Netlify type error

Netlify's `tsc` step failed with:

    src/components/ui/kit.tsx(382,20): error TS2345: Argument of type 'RefObject<HTMLDivElement | null>' is not assignable to parameter of type 'RefObject<HTMLElement>'.

Cause: `useSheetBehavior` asked for a ref that is never null, but React 19's `useRef<HTMLDivElement>(null)` gives one that is null until the element mounts.
Fix: one line in `frontend/src/components/ui/useSheetBehavior.ts`, `panelRef: RefObject<HTMLElement>` becomes `panelRef: RefObject<HTMLElement | null>`. Nothing else changed.

If you would rather not extract a zip, make that edit by hand: it is the only line that changes.
Extract over your repo folder, then commit and push.
