import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { RegistraServiceWorker } from "@/components/pwa";
import "./globals.css";

// Fontes do design system (tokens em globals.css): Manrope nos títulos,
// botões e selos (--font-display); Inter no corpo (--font-sans). next/font
// hospeda os arquivos junto do app — nenhuma requisição ao Google no
// navegador da cliente, e funciona offline no PWA.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Studio Gisele Lima | Estética Feminina — Lindeza Premium",
    template: "%s | Studio Gisele Lima",
  },
  description:
    "Studio Gisele Lima — estética feminina premium em Pedreiras - MA. Design de sobrancelha, brow lamination, limpeza de pele e epilação. Agende pelo app.",
  appleWebApp: { capable: true, title: "Gisele Lima", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        {children}
        <RegistraServiceWorker />
      </body>
    </html>
  );
}
