import type { Metadata } from "next";
import { exigirCliente } from "@/lib/auth";
import { lerConfigNumero } from "@/lib/consultas";
import type { Servico } from "@/lib/tipos";
import { FluxoAgendar } from "./fluxo";

export const metadata: Metadata = { title: "Agendar" };

export default async function PaginaAgendar({ searchParams }: PageProps<"/cliente/agendar">) {
  const { supabase } = await exigirCliente();
  const { servico } = await searchParams;

  const [{ data: servicos }, diasMaximos] = await Promise.all([
    supabase
      .from("servicos")
      .select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque")
      .eq("ativo", true)
      .order("categoria")
      .order("nome"),
    lerConfigNumero(supabase, "dias_maximos_agendamento", 60),
  ]);

  return (
    <FluxoAgendar
      servicos={(servicos ?? []) as Servico[]}
      servicoInicial={typeof servico === "string" ? servico : null}
      diasMaximos={diasMaximos}
    />
  );
}
