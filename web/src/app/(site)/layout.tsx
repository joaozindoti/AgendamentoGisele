import Image from "next/image";
import Link from "next/link";
import { LinkBotao } from "@/components/ui";

export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="navbar-blur fixed inset-x-0 top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" aria-label="Studio Gisele Lima — início">
            <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={120} height={44} className="h-10 w-auto" priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/servicos" className="hidden text-[14px] text-ink-muted hover:text-accent sm:inline">
              Serviços
            </Link>
            <LinkBotao href="/entrar" variante="secundario" className="min-h-9 px-4 text-[14px]">
              Entrar
            </LinkBotao>
          </div>
        </div>
      </nav>
      <main className="pt-16">{children}</main>
      <footer className="mt-16 border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-10 text-center">
          <p className="text-[18px] font-semibold text-ink">Studio Gisele Lima</p>
          <p className="mt-1 text-[13px] text-ink-muted">Estética Feminina · Lindeza Premium</p>
          <Link href="/pre-cadastro" className="mt-4 inline-block text-[14px] text-accent underline-offset-4 hover:underline">
            Cadastre-se uma vez e receba descontos especiais direto no seu WhatsApp
          </Link>
          <p className="mt-6 text-[12px] text-ink-muted">© {new Date().getFullYear()} Studio Gisele Lima. Todos os direitos reservados.</p>
        </div>
      </footer>
    </>
  );
}
