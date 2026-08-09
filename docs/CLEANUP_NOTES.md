# Cleanup / file arrangement pass — what changed

The codebase was already in good shape (no dead files, no unused
console.logs, no stray TODOs — checked by cross-referencing every source
file against the rest of the tree). This pass focused on naming
consistency, a couple of small broken references, and filling in
onboarding gaps rather than rewriting anything.

## Changes

1. **`frontend/src/Components/` → `frontend/src/components/`**
   Every other top-level folder under `src/` (`hooks/`, `lib/`, `store/`,
   `types/`) is lowercase; `Components` was the one outlier. Only
   `App.tsx` imported it by name (everything inside uses relative
   imports), so this was a one-file, two-line fix. Verified with
   `tsc --noEmit` and a full `vite build` — both clean.

2. **`backend/routes/reportRoutes.js` → `backend/routes/reportsRoutes.js`**
   Every other route file matches its controller's name exactly
   (`vendorController.js` ↔ `vendorRoutes.js`, etc.) except this one —
   the controller is `reportsController.js` (plural, matching the
   `/api/reports` mount point), the route file was singular. Renamed and
   updated the one `require()` in `server.js`.

3. **Fixed a broken `npm run seed`.** `backend/package.json` pointed it at
   `config/seed.js`, which doesn't exist. The actual seed script is
   `scripts/seed/seedDocumentCounters.js` (see `docs/scripts-notes.md`) —
   updated the script path to match.

4. **`docs/components-notes.md` → `docs/scripts-notes.md`.** The file is
   entirely about `backend/scripts/` (what each one does, whether it's
   safe to re-run) — the old name was misleading. Also removed a stray
   leftover `hi` line at the top.

5. **Added `backend/.env.example` and `frontend/.env.example`.** Neither
   existed; every env var actually read via `process.env.*` /
   `import.meta.env.*` in the codebase is listed, grouped, and commented
   (required vs. optional, with a one-line note on what each optional
   group is for).

6. **Rewrote the root `README.md`.** It was two lines ("Status: looking
   for improvement"). Replaced with: tech stack, an annotated map of
   `backend/` and `frontend/src/`, setup steps for both halves, how to
   run tests, and links to the deploy configs and the two docs above.

7. **`frontend/package.json`: added `"type": "module"`.** Both
   `postcss.config.js` and `tailwind.config.js` already use `export
   default` (ESM syntax) with no `package.json` declaring the package as
   a module — Vite was silently re-sniffing and reparsing them on every
   build (visible as a `MODULE_TYPELESS_PACKAGE_JSON` warning). No file
   in the frontend uses `require()`/`module.exports`, so this was safe;
   confirmed with a clean `vite build` afterward (warning gone).

## What did NOT change
- No component/controller/service logic — only file names, one require
  path, one npm script path, and documentation.
- No dependency versions changed.
- No routes, API contracts, or DB schemas changed.

## Verified before finishing
- `cd backend && npm test` — 112/112 tests passing.
- `cd frontend && npx tsc --noEmit` — no errors.
- `cd frontend && npx vite build` — succeeds, no warnings.
