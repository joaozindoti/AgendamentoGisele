import Image from "next/image";
import Link from "next/link";
import { IconeCalendario, IconeHistorico, IconeInicio, IconePerfil } from "@/components/icones";
import { AvisoInstalar } from "@/components/pwa";
import { TabBar } from "@/components/tabbar";
import { obterAreaCliente } from "@/lib/auth";

export default async function LayoutCliente({ children }: { children: React.ReactNode }) {
  // aberta pra quem ainda não se cadastrou; só redireciona profissional pro painel
  await obterAreaCliente();

  return (
    <div className="pb-tabbar">
      <header className="navbar-blur sticky top-0 z-20 border-b border-line/60">
        <div className="mx-auto flex h-[72px] max-w-xl items-center justify-between px-4">
          <Link href="/cliente" aria-label="Início">
            <Image src="/fotos/logo.webp" alt="Studio Gisele Lima" width={160} height={58} className="logo-marca h-12 w-auto" priority />
          </Link>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">Lindeza Premium</p>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-5">
        <AvisoInstalar />
        {children}
      </main>
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
