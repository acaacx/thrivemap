// Measures satori + resvg on the real assets, at the worst case the card can
// reach: full outline, 400 pins (get_map_clinics caps there), three fonts.
// Run: node scripts/bench-og-render.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// Plain `node` needs the explicit extension here — Next's package.json has
// no "exports" map remapping "next/og" the way the bundler resolver does, so
// bare "next/og" 404s under Node's ESM resolution. Application code (e.g.
// the route handler) imports plain "next/og" and resolves fine through
// Next's own bundler.
import { ImageResponse } from "next/og.js";

const root = process.cwd();
const geo = JSON.parse(
  await readFile(join(root, "assets/geo/ph-outline.geojson"), "utf8"),
);

// Crude equirectangular projection — the bench measures rasterisation cost,
// not projection accuracy, and real Mercator lands in Task 2.
const W = 1200,
  H = 630;
const project = ([lng, lat]) => [
  ((lng - 116.7) / (127.0 - 116.7)) * W,
  ((21.5 - lat) / (21.5 - 4.2)) * H,
];

const paths = [];
for (const feature of geo.features) {
  const polys =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(project);
      paths.push(
        "M" +
          pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") +
          "Z",
      );
    }
  }
}
const points = paths.reduce((n, d) => n + d.split("L").length, 0);
console.log(`${paths.length} rings, ~${points} points`);

const fonts = [
  { name: "Fraunces", file: "fraunces-display.ttf", weight: 600 },
  { name: "Nunito Sans", file: "nunito-sans-regular.ttf", weight: 400 },
  { name: "Nunito Sans", file: "nunito-sans-semibold.ttf", weight: 600 },
];
const loaded = await Promise.all(
  fonts.map(async (f) => ({
    name: f.name,
    weight: f.weight,
    style: "normal",
    data: await readFile(join(root, "assets/fonts", f.file)),
  })),
);

const pins = Array.from({ length: 400 }, (_, i) => ({
  x: 200 + ((i * 37) % 800),
  y: 100 + ((i * 53) % 400),
}));

function scene() {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        width: W,
        height: H,
        background: "#fdfaf4",
        position: "relative",
      },
      children: [
        {
          type: "svg",
          props: {
            width: W,
            height: H,
            viewBox: `0 0 ${W} ${H}`,
            style: { position: "absolute", top: 0, left: 0 },
            children: [
              ...paths.map((d, i) => ({
                type: "path",
                key: `p${i}`,
                props: { d, fill: "#f0ebdc", stroke: "#e5dfd5" },
              })),
              ...pins.map((p, i) => ({
                type: "circle",
                key: `c${i}`,
                props: {
                  cx: p.x,
                  cy: p.y,
                  r: 7,
                  fill: "#dc855d",
                  stroke: "#fdfaf4",
                  strokeWidth: 2,
                },
              })),
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 56,
              bottom: 56,
              display: "flex",
              flexDirection: "column",
            },
            children: [
              {
                type: "div",
                props: {
                  style: { fontFamily: "Fraunces", fontSize: 56 },
                  children: "Occupational therapy in Davao City",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontFamily: "Nunito Sans", fontSize: 28 },
                  children: "400+ clinics on this map",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

for (let i = 0; i < 5; i++) {
  const t = performance.now();
  const res = new ImageResponse(scene(), {
    width: W,
    height: H,
    fonts: loaded,
  });
  const buf = await res.arrayBuffer();
  console.log(
    `run ${i + 1}: ${Math.round(performance.now() - t)}ms, ${(buf.byteLength / 1024).toFixed(0)}KB`,
  );
}
