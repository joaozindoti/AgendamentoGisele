import Link from "next/link";
import { AcoesAgendamentoCliente } from "@/components/acoes-agendamento";
import { CartaoServico } from "@/components/catalogo";
import { BotaoInstalar } from "@/components/pwa";
import { Caixa, Card, Eyebrow, LinkBotao } from "@/components/ui";
import { exigirCliente } from "@/lib/auth";
import { SELECT_AGENDAMENTO_CLIENTE, lerConfigNumero, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, dataLonga, hora, lerPeriodo, saudacao } from "@/lib/formato";
import { WHATSAPP_STUDIO } from "@/lib/studio";
import type { Servico } from "@/lib/tipos";

export default async function InicioCliente({ searchParams }: PageProps<"/cliente">) {
  const { supabase, clienteId } = await exigirCliente();
  const { aviso } = await searchParams;

  const [{ data: cliente }, { data: agendamentos }, { data: destaques }, horasMinimas] = await Promise.all([
    supabase.from("clientes").select("nome, consentimento, data_nascimento").eq("id", clienteId).single(),
    supabase
      .from("agendamentos")
      .select(SELECT_AGENDAMENTO_CLIENTE)
      .eq("cliente_id", clienteId)
      .eq("status", "confirmado")
      .order("periodo"),
    supabase
      .from("servicos")
      .select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque")
      .eq("destaque", true)
      .order("nome")
      .limit(3),
    lerConfigNumero(supabase, "horas_minimas_remarcacao", 2),
  ]);

  const agora = agoraMs();
  const proximo = ((agendamentos ?? []) as unknown as AgendamentoComDetalhes[])
    .map((a) => ({ ...a, ...lerPeriodo(a.periodo) }))
    .find((a) => a.inicio.getTime() > agora);

  const primeiroNome = cliente?.nome && cliente.nome !== "Cliente" ? cliente.nome.split(" ")[0] : null;
  const perfilIncompleto = !cliente || cliente.nome === "Cliente" || !cliente.data_nascimento;
  const podeAlterar = proximo ? proximo.inicio.getTime() - agora > horasMinimas * 3600_000 : false;

  const avisos: Record<string, string> = {
    agendado: "Agendamento confirmado! A confirmação também chega no seu WhatsApp.",
    remarcado: "Horário remarcado! O novo horário também chega no seu WhatsApp.",
  };

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Studio VIP</Eyebrow>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">
          {saudacao()}
          {primeiroNome ? (
            <>
              , <em className="italic font-normal text-accent">{primeiroNome}</em>
            </>
          ) : (
            "!"
          )}
        </h1>
        <p className="mt-1 text-[15px] text-ink-muted">Que bom ter você de volta ao seu momento de cuidado.</p>
      </header>

      {typeof aviso === "string" && avisos[aviso] && <Caixa tipo="ok">{avisos[aviso]}</Caixa>}

      {perfilIncompleto && (
        <Link href="/cliente/perfil" className="block rounded-card border border-gold-soft bg-surface px-4 py-3 text-[14px] text-ink hover:border-gold">
          Complete seu perfil com nome e data de nascimento — no mês do seu aniversário tem presente. <span className="text-accent">Completar →</span>
        </Link>
      )}

      {proximo ? (
        <Card className="p-5">
          <Eyebrow>Seu próximo momento VIP</Eyebrow>
          <p className="mt-2 text-[22px] leading-snug font-semibold">{proximo.servico?.nome}</p>
          <p className="mt-2 text-[15px] text-ink">com {proximo.profissional?.nome}</p>
          <p className="text-[15px] text-ink">
            {dataLonga(proximo.inicio)} · {hora(proximo.inicio)}
          </p>
          <AcoesAgendamentoCliente
            agendamentoId={proximo.id}
            podeAlterar={podeAlterar}
            horasMinimas={horasMinimas}
            whatsappStudio={WHATSAPP_STUDIO}
          />
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-[16px] font-medium">Você não tem nenhum horário marcado.</p>
          <p className="mt-1 text-[14px] text-ink-muted">Que tal reservar seu próximo momento de cuidado?</p>
        </Card>
      )}

      <LinkBotao href="/cliente/agendar" largo>
        Agendar novo horário
      </LinkBotao>

      {destaques && destaques.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <Eyebrow>Menu exclusivo</Eyebrow>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight">Experiências do Studio</h2>
            </div>
            <Link href="/cliente/agendar" className="text-[14px] text-accent">
              Ver catálogo →
            </Link>
          </div>
          <div className="space-y-3">
            {(destaques as Servico[]).map((s) => (
              <CartaoServico key={s.id} servico={s} href={`/cliente/agendar?servico=${s.id}`} />
            ))}
          </div>
        </section>
      )}

      <BotaoInstalar nomeApp="o app do Studio" />
    </div>
  );
}
