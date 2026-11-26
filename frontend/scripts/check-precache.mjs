// Runs after `vite build` (see the "build" script). Fails the build if the offline cache has
// quietly started to include the map library again.
//
// Why: mapbox-gl is ~1.9 MB. If it is in the service worker's precache, every phone downloads it
// when the app installs or updates, whether or not it ever opens a map. It is meant to be fetched
// only when a map opens. Reads dist/sw.js only; installs nothing.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sw = fileURLToPath(new URL("../dist/sw.js", import.meta.url));
if (!existsSync(sw)) {
  console.log("check:precache: dist/sw.js not found, nothing to check.");
  process.exit(0);
}
const urls = [...readFileSync(sw, "utf8").matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const bad = urls.filter((u) => /mapbox/i.test(u));
if (bad.length) {
  console.error("\ncheck:precache FAILED: the offline cache includes the map library:\n  " + bad.join("\n  "));
  console.error("It must stay out (about 1.9 MB). See globIgnores in vite.config.ts.\n");
  process.exit(1);
}
console.log(`check:precache OK: ${urls.length} files in the offline cache, none of them the map library.`);
