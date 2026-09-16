import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Harbor", short_name: "Harbor",
    description: "Plan ahead. Stay ahead.", start_url: "/budget", scope: "/",
    display: "standalone", theme_color: "#1B3A5C", background_color: "#1B3A5C",
    icons: [
      { src: "/harbor-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/harbor-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/harbor-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
