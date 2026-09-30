import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconeCalendario, IconeToque, IconeWifi } from "@/components/icones";
import { PassosInstalar } from "./passos";

export const metadata: Metadata = {
  title: "Instalar o app",
  description: "Como colocar o app do Studio Gisele Lima na tela inicial do celular, no Android e no iPhone.",
};

const BENEFICIOS: { icone: ReactNode; titulo: string; texto: string }[] = [
  { icone: <IconeToque />, titulo: "Abre com um toque", texto: "Fica na tela inicial, sem senha e sem código." },
  { icone: <IconeWifi />, titulo: "Funciona sem internet", texto: "Seu próximo horário aparece mesmo offline." },
  { icone: <IconeCalendario />, titulo: "Agende e remarque na hora", texto: "Horários livres de verdade, confirmação no WhatsApp." },
];

// Link que dá pra mandar pela cliente no WhatsApp. O Android oferece a
// instalação sozinho (banner do Chrome); o iPhone não tem banner, só o passo
// manual pelo Compartilhar do Safari. A página mostra a instrução do
// aparelho de quem abriu.
export default function PaginaInstalar() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-6 pb-12">
      <Link href="/" className="mx-auto" aria-label="Voltar ao início">
        <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={160} height={58} className="logo-marca h-12 w-auto" priority />
      </Link>

      <section className="relative -mx-4 mt-6 overflow-hidden px-4 pb-2 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(244,225,229,0.95),rgba(247,245,244,0))]"
        />
        {/* o ícone que vai ficar na tela do celular, com o contorno dourado deslocado do hero */}
        <div className="relative mx-auto mt-6 h-24 w-24">
          <div aria-hidden className="absolute inset-0 translate-x-2 -translate-y-2 rounded-[26px] border border-gold/70" />
          <Image
            src="/icons/apple-touch-icon.png"
            alt="Ícone do app Studio Gisele Lima"
            width={96}
            height={96}
            className="relative rounded-[26px] shadow-soft"
            priority
          />
        </div>
        <p className="relative mt-7 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-ink">App do Studio</p>
        <h1 className="relative mt-2 text-[36px] leading-[1.04] tracking-[-0.04em] text-ink">
          <span className="block font-extralight">Seu studio</span>
          <span className="block font-extrabold">na tela inicial.</span>
        </h1>
        <p className="relative mx-auto mt-3 max-w-[20rem] text-[15px] leading-relaxed text-ink-muted">
          Instale o app do Studio Gisele Lima e agende seus horários com um toque, sem baixar nada da loja.
        </p>
      </section>

      <PassosInstalar
        beneficios={
          <ul className="space-y-3">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo} className="flex items-start gap-4 rounded-card bg-surface p-4 shadow-soft">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">{b.icone}</span>
                <div className="min-w-0">
                  <p className="font-display text-[16px] font-bold tracking-[-0.01em]">{b.titulo}</p>
                  <p className="mt-0.5 text-[14px] text-ink-muted">{b.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        }
      />

      <Link href="/cliente/agendar" className="mt-10 text-center text-[14px] text-ink-muted hover:text-accent">
        Prefiro agendar pelo navegador →
      </Link>
    </main>
  );
}
