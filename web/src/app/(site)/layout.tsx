import Image from "next/image";
import Link from "next/link";
import { SeloExclusivoFeminino } from "@/components/home-cliente";
import { LinkBotao } from "@/components/ui";

export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="navbar-blur fixed inset-x-0 top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between px-4">
          <Link href="/" aria-label="Studio Gisele Lima — início">
            <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={160} height={58} className="logo-marca h-12 w-auto" priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/servicos" className="hidden font-display text-[14px] font-semibold text-ink-muted hover:text-accent sm:inline">
              Serviços
            </Link>
            <LinkBotao href="/cliente/agendar" variante="secundario" className="min-h-9 px-4 text-[14px]">
              Agendar
            </LinkBotao>
          </div>
        </div>
      </nav>
      <main className="pt-[72px]">
        {/* Mesma faixa da home do app: em toda página pública, logo abaixo
            do menu, visível sem rolar (fase 20). */}
        <div className="mx-auto max-w-xl px-4 pt-4">
          <SeloExclusivoFeminino />
        </div>
        {children}
      </main>
      <footer className="mt-16 border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-10 text-center">
          <span aria-hidden className="mx-auto block h-px w-10 bg-gold/70" />
          <p className="mt-5 font-display text-[20px] font-extrabold tracking-[-0.02em] text-ink">Studio Gisele Lima</p>
          <p className="mt-1 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-ink">Estética Feminina · Lindeza Premium</p>
          <Link href="/pre-cadastro" className="mt-5 inline-block text-[14px] text-accent underline-offset-4 hover:underline">
            Cadastre-se uma vez e receba descontos especiais direto no seu WhatsApp
          </Link>
          <p className="mt-4 text-[13px]">
            <Link href="/instalar" className="text-accent underline-offset-4 hover:underline">
              Instalar o app no celular
            </Link>
            <span className="mx-2 text-ink-muted">·</span>
            <Link href="/entrar" className="text-ink-muted underline-offset-4 hover:underline">
              Área da equipe
            </Link>
          </p>
          <p className="mt-6 text-[12px] text-ink-muted">© {new Date().getFullYear()} Studio Gisele Lima. Todos os direitos reservados.</p>
        </div>
      </footer>
    </>
  );
}
