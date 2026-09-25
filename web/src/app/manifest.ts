import type { MetadataRoute } from "next";

// App da cliente. O painel tem manifest próprio (public/painel.webmanifest)
// pra instalar como app separado, abrindo direto na agenda.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/cliente",
    name: "Studio Gisele Lima",
    short_name: "Gisele Lima",
    description: "Agende e acompanhe seus horários no Studio Gisele Lima.",
    start_url: "/cliente",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbeaec",
    theme_color: "#fbeaec",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
