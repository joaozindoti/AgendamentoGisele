import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PassosInstalar } from "./passos";

export const metadata: Metadata = {
  title: "Instalar o app",
  description: "Como colocar o app do Studio Gisele Lima na tela inicial do celular, no Android e no iPhone.",
};

// Link que dá pra mandar pela cliente no WhatsApp. O Android oferece a
// instalação sozinho (banner do Chrome); o iPhone não tem banner, só o passo
// manual pelo Compartilhar do Safari. A página mostra a instrução do
// aparelho de quem abriu.
export default function PaginaInstalar() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-12 pb-10">
      <Link href="/" className="mx-auto" aria-label="Voltar ao início">
        <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={220} height={80} className="h-auto w-44" priority />
      </Link>
      <h1 className="mt-10 text-[28px] leading-tight font-semibold tracking-tight">Instale o app do Studio</h1>
      <p className="mt-3 text-[15px] text-ink-muted">
        Fica na tela inicial como um app: abre com um toque, sem senha e sem código, e mostra seu próximo horário mesmo sem
        internet.
      </p>
      <PassosInstalar />
      <Link href="/cliente/agendar" className="mt-8 text-center text-[15px] text-accent">
        Agendar agora pelo navegador →
      </Link>
    </main>
  );
}
