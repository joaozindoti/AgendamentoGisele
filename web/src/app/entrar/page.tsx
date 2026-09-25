import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { FormLogin } from "./form";

export const metadata: Metadata = { title: "Entrar" };

function destinoSeguro(proximo: string | undefined) {
  // só caminho interno — evita open redirect via ?proximo=https://...
  return proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : null;
}

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const { proximo } = await searchParams;
  const destino = destinoSeguro(typeof proximo === "string" ? proximo : undefined);

  const sessao = await obterSessao();
  if (sessao.userId) {
    redirect(destino ?? (sessao.papel?.profissional_id ? "/painel" : "/cliente"));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-12 pb-10">
      <Link href="/" className="mx-auto" aria-label="Voltar ao início">
        <Image src="/fotos/logo.webp" alt="Gisele Lima — Estética Feminina" width={220} height={80} className="h-auto w-44" priority />
      </Link>
      <h1 className="mt-10 text-[30px] leading-tight font-semibold tracking-tight">
        Bem-vinda de volta, <em className="italic font-normal">Lindeza!</em>
      </h1>
      <p className="mt-3 text-[15px] text-ink-muted">
        Entre com seu WhatsApp para agendar e acompanhar seus horários no Studio Gisele Lima.
      </p>
      <FormLogin destino={destino} />
    </main>
  );
}
