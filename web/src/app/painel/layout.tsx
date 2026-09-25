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
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/painel" className="flex items-center gap-3">
            <Image src="/fotos/logo.webp" alt="" width={90} height={32} className="h-8 w-auto" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Painel</span>
          </Link>
          <span className="text-[13px] text-ink-muted">{papel?.nome_profissional}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-5">{children}</main>
      <TabBar itens={itens} />
    </div>
  );
}
