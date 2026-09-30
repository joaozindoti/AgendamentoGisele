import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { IconeCalendario, IconeClientes, IconeEquipe, IconeMais, IconeServicos } from "@/components/icones";
import { TabBar, type ItemTab } from "@/components/tabbar";
import { exigirProfissional } from "@/lib/auth";

// Manifest próprio: o painel instala como app separado (start_url /painel),
// seção 14, fase 9 — "PWA nas duas superfícies".
export const metadata: Metadata = {
  title: { default: "Painel", template: "%s | Painel Studio Gisele Lima" },
  manifest: "/painel.webmanifest",
  robots: { index: false },
};

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const { ehOwner, papel } = await exigirProfissional();

  const itens: ItemTab[] = [
    { href: "/painel", rotulo: "Agenda", icone: <IconeCalendario />, exato: true },
    { href: "/painel/clientes", rotulo: "Clientes", icone: <IconeClientes /> },
    ...(ehOwner
      ? [
          { href: "/painel/equipe", rotulo: "Equipe", icone: <IconeEquipe /> },
          { href: "/painel/servicos", rotulo: "Serviços", icone: <IconeServicos /> },
        ]
      : [{ href: "/painel/disponibilidade", rotulo: "Horários", icone: <IconeEquipe /> }]),
    { href: "/painel/mais", rotulo: "Mais", icone: <IconeMais /> },
  ];

  return (
    <div className="pb-tabbar">
      <header className="navbar-blur sticky top-0 z-20 border-b border-line/60">
        <div className="mx-auto flex h-[68px] max-w-3xl items-center justify-between px-4">
          <Link href="/painel" className="flex items-center gap-3" aria-label="Painel — agenda">
            <Image src="/fotos/logo.webp" alt="" width={160} height={58} className="logo-marca h-11 w-auto" />
            <span aria-hidden className="h-6 w-px bg-line" />
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">Painel</span>
          </Link>
          <Link href="/painel/mais" className="flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink">
            <span className="hidden sm:inline">{papel?.nome_profissional}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush font-display text-[14px] font-bold text-accent">
              {papel?.nome_profissional?.charAt(0) ?? "·"}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-5">{children}</main>
      <TabBar itens={itens} />
    </div>
  );
}
