import type { NextConfig } from "next";

// Falta de env var vira erro de build explícito, não valor padrão silencioso
// nem "undefined" em link de produção. Lista completa em .env.example.
const OBRIGATORIAS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_WHATSAPP_STUDIO"];
const faltando = OBRIGATORIAS.filter((v) => !process.env[v]);
if (faltando.length) {
  throw new Error(`Variáveis de ambiente obrigatórias faltando: ${faltando.join(", ")}. Ver web/.env.example e PENDENCIAS.md (passo 7).`);
}
if (!/^55\d{10,11}$/.test(process.env.NEXT_PUBLIC_WHATSAPP_STUDIO!)) {
  throw new Error("NEXT_PUBLIC_WHATSAPP_STUDIO deve ter só dígitos, com 55 na frente (ex: 5599984183784).");
}

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : "pjbcgyzykvidbwdjlnvp.supabase.co";

const nextConfig: NextConfig = {
  images: {
    // fotos de serviço/profissional enviadas pelo painel (bucket público "fotos")
    remotePatterns: [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/fotos/**" }],
  },

  // URLs do site estático atual continuam funcionando depois da troca
  // (links antigos no Instagram, WhatsApp, Google).
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/servicos.html", destination: "/servicos", permanent: true },
      { source: "/precadastro.html", destination: "/pre-cadastro", permanent: true },
      { source: "/horario.html", destination: "/cliente/agendar", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // o navegador tem que buscar o service worker novo a cada deploy
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
