import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThriveMap",
    short_name: "ThriveMap",
    description:
      "A community directory of therapy and developmental-care centers across the Philippines.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdfaf4",
    theme_color: "#1b5e5e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
