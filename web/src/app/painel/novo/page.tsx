import type { Metadata } from "next";
import { Titulo } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { lerConfigNumero } from "@/lib/consultas";
import { chaveDia } from "@/lib/formato";
import { FormNovoAgendamento } from "./form";

export const metadata: Metadata = { title: "Novo agendamento" };

export default async function NovoAgendamento({ searchParams }: PageProps<"/painel/novo">) {
  const { supabase, ehOwner, profissionalId, papel } = await exigirProfissional();
  const { data: diaParam, cliente } = await searchParams;

  const [{ data: servicos }, { data: meusServicos }, diasMaximos] = await Promise.all([
    supabase.from("servicos").select("id, nome, duracao_min").eq("ativo", true).order("nome"),
    supabase.from("profissional_servicos").select("servico_id").eq("profissional_id", profissionalId),
    lerConfigNumero(supabase, "dias_maximos_agendamento", 60),
  ]);

  // staff só marca serviço que ela mesma faz (agendar() recusa o resto)
  const meus = new Set((meusServicos ?? []).map((s) => s.servico_id as string));
  const lista = (servicos ?? []).filter((s) => ehOwner || meus.has(s.id));

  let clienteInicial: { id: string; nome: string } | null = null;
  if (typeof cliente === "string") {
    const { data } = await supabase.from("clientes").select("id, nome").eq("id", cliente).maybeSingle();
    clienteInicial = data;
  }

  return (
    <>
      <Titulo eyebrow="Painel">Novo agendamento</Titulo>
      <FormNovoAgendamento
        servicos={lista as { id: string; nome: string; duracao_min: number }[]}
        ehOwner={ehOwner}
        meuProfissional={{ id: profissionalId, nome: papel?.nome_profissional ?? "" }}
        diaInicial={typeof diaParam === "string" ? diaParam : chaveDia()}
        diasMaximos={diasMaximos}
        clienteInicial={clienteInicial}
      />
    </>
  );
}
