import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { FormLogin } from "./form";

export const metadata: Metadata = { title: "Área da equipe" };

// Login por telefone + código é só da Gisele e das profissionais. A cliente
// não passa por aqui: agenda direto em /cliente, sem login.

function destinoSeguro(proximo: string | undefined) {
  // só caminho interno — evita open redirect via ?proximo=https://...
  return proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : null;
}

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const { proximo } = await searchParams;
  const destino = destinoSeguro(typeof proximo === "string" ? proximo : undefined);

  const sessao = await obterSessao();
  // sessão anônima é de cliente: mostra o login (uma profissional pode ter
  // agendado como cliente neste mesmo aparelho)
  if (sessao.userId && !sessao.anonimo) {
    redirect(destino ?? (sessao.papel?.profissional_id ? "/painel" : "/cliente"));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-12 pb-10">
      <Link href="/" className="mx-auto" aria-label="Voltar ao início">
        <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={220} height={80} className="h-auto w-44" priority />
      </Link>
      <h1 className="mt-10 text-[30px] leading-tight font-semibold tracking-tight">Área da equipe</h1>
      <p className="mt-3 text-[15px] text-ink-muted">
        Acesso ao painel do studio, para a Gisele e as profissionais cadastradas. Entre com o celular cadastrado no painel.
      </p>
      <FormLogin destino={destino ?? "/painel"} />
      <p className="mt-8 text-center text-[14px] text-ink-muted">
        É cliente?{" "}
        <Link href="/cliente/agendar" className="text-accent">
          Agende aqui, sem login
        </Link>
      </p>
    </main>
  );
}
