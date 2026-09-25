import Image from "next/image";
import Link from "next/link";
import { IconeCalendario, IconeHistorico, IconeInicio, IconePerfil } from "@/components/icones";
import { TabBar } from "@/components/tabbar";
import { exigirCliente } from "@/lib/auth";

export default async function LayoutCliente({ children }: { children: React.ReactNode }) {
  await exigirCliente();

  return (
    <div className="pb-tabbar">
      <header className="navbar-blur sticky top-0 z-20 border-b border-line/60">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/cliente" aria-label="Início">
            <Image src="/fotos/logo.webp" alt="Studio Gisele Lima" width={100} height={36} className="h-8 w-auto" />
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Lindeza Premium</p>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-5">{children}</main>
      <TabBar
        itens={[
          { href: "/cliente", rotulo: "Início", icone: <IconeInicio />, exato: true },
          { href: "/cliente/agendar", rotulo: "Agendar", icone: <IconeCalendario /> },
          { href: "/cliente/historico", rotulo: "Histórico", icone: <IconeHistorico /> },
          { href: "/cliente/perfil", rotulo: "Perfil", icone: <IconePerfil /> },
        ]}
      />
    </div>
  );
}
