// Copies MapLibre's worker bundle into public/ so the app can serve it
// same-origin. Turbopack does not emit the worker chunk MapLibre's default
// `new URL("./maplibre-gl-worker.mjs", import.meta.url)` resolution expects,
// so the request 404s (an HTML response, hence the "non-JavaScript MIME type"
// console error) and vector tiles never parse. ClinicMap points MapLibre at
// these copies via setWorkerUrl(). Runs on postinstall; output is gitignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const dest = path.resolve(import.meta.dirname, "../public/maplibre");

mkdirSync(dest, { recursive: true });
// The worker imports ./maplibre-gl-shared.mjs relative to itself, so both
// files must live side by side.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
