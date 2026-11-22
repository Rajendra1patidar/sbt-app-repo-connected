// Guards the design rules that are easy to break by accident when a screen is edited:
//   1. no text smaller than 12px (use `text-micro`, 12px)
//   2. no text colour that is too light on a card in light or dark mode (use the 600 shade, or 700 for warn)
//   3. no pale `text-ink/NN` (below 70%); use text-mute or text-faint
//   4. white text only on the solid -500 fills: the -600 / -700 shades turn pale in dark mode
// Run it with `npm run check:design` (CI runs it too). It reads source files only and installs nothing.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// Old screens nothing imports any more; they are being deleted, so their leftovers don't count.
const UNUSED = new Set([
  "components/layout/Sidebar.tsx", "components/layout/Topbar.tsx", "components/layout/BottomNav.tsx",
  "components/modals/DocumentModal.tsx", "components/modals/StatusChoicePopup.tsx", "components/modals/ItemPickerSheet.tsx",
  "components/dashboard/AlertStrip.tsx", "components/dashboard/BalanceBeam.tsx", "components/dashboard/DueThisWeek.tsx",
  "components/dashboard/PositionBar.tsx", "components/dashboard/TodaySnapshot.tsx", "components/dashboard/UnderlineTabs.tsx",
  // Left behind when Challans moved to ChallansView (step 7); safe to `git rm`.
  "components/views/DocumentList.tsx", "components/modals/EstimateFilterSheet.tsx", "components/common/SwipeRow.tsx",
]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith(".d.ts")) yield p;
  }
}

// Quoted strings, and the fixed text of template strings (the parts outside ${...}).
function literals(src) {
  const out = [];
  for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) out.push({ text: m[1] ?? m[2], at: m.index });
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const body = m[1];
    let depth = 0, seg = "", start = 0;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (depth === 0 && c === "$" && body[i + 1] === "{") { out.push({ text: seg, at: m.index + 1 + start }); seg = ""; depth = 1; i++; continue; }
      if (depth > 0) { if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) start = i + 1; } continue; }
      seg += c;
    }
    out.push({ text: seg, at: m.index + 1 + start });
  }
  return out;
}

const problems = [];
const lineOf = (src, i) => src.slice(0, i).split("\n").length;
const add = (file, src, at, msg) => problems.push(`${file}:${lineOf(src, at)}  ${msg}`);

for (const full of walk(SRC)) {
  const file = relative(SRC, full).split(sep).join("/");
  if (UNUSED.has(file)) continue;
  const src = readFileSync(full, "utf8");

  for (const m of src.matchAll(/(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g)) {
    if (parseFloat(m[1]) < 12) add(file, src, m.index, `${m[0]} is under 12px: use text-micro`);
  }
  for (const m of src.matchAll(/(?<![\w-])text-(?:(?:brand|good|bad|insight|advance)-(?:300|400|500)|warn-(?:300|400|500|600))(?![\w/-])/g)) {
    add(file, src, m.index, `${m[0]} is too light as text in light or dark mode: use the 600 shade (700 for warn)`);
  }
  for (const m of src.matchAll(/(?<![\w-])text-ink\/(\d+)(?![\w-])/g)) {
    if (parseInt(m[1], 10) < 70) add(file, src, m.index, `${m[0]} is too pale: use text-mute or text-faint`);
  }
  for (const lit of literals(src)) {
    if (!/(?<![\w:-])text-white(?![\w/-])/.test(lit.text)) continue;
    const bad = lit.text.match(/(?<![\w-])(?:hover:)?bg-(?:(?:brand|bad|good|advance)-(?!500(?![\w-]))\d+|warn-\d+)(?![\w/-])/);
    if (bad) add(file, src, lit.at, `white text with ${bad[0]}: only the solid -500 fills keep white text readable in dark mode`);
  }
}

if (problems.length) {
  console.error(`Design rules: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("Design rules: OK (no text under 12px, no too-light text colours, no pale ink, white text only on -500 fills)");
