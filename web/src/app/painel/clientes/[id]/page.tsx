import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, LinkBotao, PontoStatus, Titulo } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { SELECT_AGENDAMENTO_PAINEL, type AgendamentoComDetalhes } from "@/lib/consultas";
import { dataCompleta, hora, inicioDoDia, lerPeriodo } from "@/lib/formato";
import { exibirTelefone, linkWhatsApp } from "@/lib/telefone";
import { ROTULO_STATUS, type Cliente } from "@/lib/tipos";
import { FormCliente } from "../form-cliente";

export default async function DetalheCliente({ params }: PageProps<"/painel/clientes/[id]">) {
  const { id } = await params;
  const { supabase, ehOwner } = await exigirProfissional();

  const [{ data }, { data: historico }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome, whatsapp, endereco, data_nascimento, consentimento, consentimento_em, consentimento_versao, user_id, criado_em")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("agendamentos").select(SELECT_AGENDAMENTO_PAINEL).eq("cliente_id", id).order("periodo", { ascending: false }).limit(50),
  ]);
  if (!data) notFound();
  const cliente = data as Cliente;
  const itens = ((historico ?? []) as unknown as AgendamentoComDetalhes[]).map((a) => ({ ...a, ...lerPeriodo(a.periodo) }));
  const atendidos = itens.filter((a) => a.status === "concluido").length;

  return (
    <div className="space-y-5">
      <Link href="/painel/clientes" className="text-[14px] text-accent">
        ‹ Clientes
      </Link>
      <Titulo sub={`${atendidos} atendimento${atendidos === 1 ? "" : "s"} concluído${atendidos === 1 ? "" : "s"}`}>{cliente.nome}</Titulo>

      <Card className="space-y-1 p-4 text-[14px]">
        <p>
          <a href={linkWhatsApp(cliente.whatsapp)} target="_blank" rel="noopener" className="text-accent">
            WhatsApp {exibirTelefone(cliente.whatsapp)}
          </a>
        </p>
        {cliente.data_nascimento && <p>Aniversário: {dataCompleta(inicioDoDia(cliente.data_nascimento)).slice(0, 5)}</p>}
        {cliente.endereco && <p className="text-ink-muted">{cliente.endereco}</p>}
        <p className="text-ink-muted">
          {cliente.consentimento
            ? `Aceita promoções por WhatsApp${cliente.consentimento_em ? ` desde ${dataCompleta(new Date(cliente.consentimento_em))}` : ""}${
                cliente.consentimento_versao ? ` (${cliente.consentimento_versao})` : ""
              }`
            : "Não aceitou receber promoções"}
        </p>
        <p className="text-ink-muted">{cliente.user_id ? "Usa o app" : "Ainda não entrou no app"}</p>
      </Card>

      <LinkBotao href={`/painel/novo?cliente=${cliente.id}`} largo>
        Agendar para {cliente.nome.split(" ")[0]}
      </LinkBotao>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Histórico</h2>
        {itens.length === 0 ? (
          <p className="text-[14px] text-ink-muted">Sem atendimentos ainda.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {itens.map((a) => (
              <li key={a.id}>
                <Link href={`/painel/agendamentos/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-base">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{a.servico?.nome}</span>
                    <span className="block text-[13px] text-ink-muted">
                      {dataCompleta(a.inicio)} · {hora(a.inicio)} · {a.profissional?.nome}
                    </span>
                  </span>
                  <PontoStatus status={a.status} rotulo={ROTULO_STATUS[a.status]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ehOwner && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Editar cadastro</h2>
          <FormCliente cliente={cliente} />
        </section>
      )}
    </div>
  );
}
