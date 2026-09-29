import Link from "next/link";
import { AcoesAgendamentoCliente } from "@/components/acoes-agendamento";
import { CartaoServico } from "@/components/catalogo";
import { EquipeStudio, HeroStudio, type ProfissionalHome } from "@/components/home-cliente";
import { Caixa, Card, Eyebrow } from "@/components/ui";
import { obterAreaCliente } from "@/lib/auth";
import { SELECT_AGENDAMENTO_CLIENTE, lerConfigNumero, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, dataLonga, hora, lerPeriodo, saudacao } from "@/lib/formato";
import { WHATSAPP_STUDIO } from "@/lib/studio";
import type { Servico } from "@/lib/tipos";

export default async function InicioCliente({ searchParams }: PageProps<"/cliente">) {
  const { supabase, clienteId } = await obterAreaCliente();
  const { aviso } = await searchParams;

  const [{ data: cliente }, { data: agendamentos }, { data: destaques }, horasMinimas, { data: equipe }, { data: vinculos }] = await Promise.all([
    clienteId
      ? supabase.from("clientes").select("nome, consentimento, data_nascimento").eq("id", clienteId).single()
      : Promise.resolve({ data: null }),
    clienteId
      ? supabase
          .from("agendamentos")
          .select(SELECT_AGENDAMENTO_CLIENTE)
          .eq("cliente_id", clienteId)
          .eq("status", "confirmado")
          .order("periodo")
      : Promise.resolve({ data: [] }),
    supabase
      .from("servicos")
      .select("id, nome, descricao, foto_url, preco, duracao_min, ativo, categoria, destaque")
      .eq("destaque", true)
      .order("nome")
      .limit(3),
    lerConfigNumero(supabase, "horas_minimas_remarcacao", 2),
    // leitura pública (sem telefone): mesma que a tela de escolher profissional usa
    supabase.from("profissionais").select("id, nome, bio, foto_url, papel").eq("ativo", true).order("papel").order("nome"),
    supabase.from("profissional_servicos").select("profissional_id, servico:servicos(categoria)"),
  ]);

  const categoriasPorProfissional = new Map<string, Set<string>>();
  for (const v of (vinculos ?? []) as unknown as { profissional_id: string; servico: { categoria: string | null } | null }[]) {
    if (!v.servico?.categoria) continue;
    const set = categoriasPorProfissional.get(v.profissional_id) ?? new Set<string>();
    set.add(v.servico.categoria);
    categoriasPorProfissional.set(v.profissional_id, set);
  }
  const profissionais: ProfissionalHome[] = (equipe ?? []).map((p) => ({
    id: p.id,
    papel: p.papel,
    nome: p.nome,
    bio: p.bio,
    foto_url: p.foto_url,
    categorias: [...(categoriasPorProfissional.get(p.id) ?? [])],
  }));
  const fotoGisele = (equipe ?? []).find((p) => p.papel === "owner")?.foto_url ?? null;

  const agora = agoraMs();
  const proximo = ((agendamentos ?? []) as unknown as AgendamentoComDetalhes[])
    .map((a) => ({ ...a, ...lerPeriodo(a.periodo) }))
    .find((a) => a.inicio.getTime() > agora);

  const primeiroNome = cliente?.nome && cliente.nome !== "Cliente" ? cliente.nome.split(" ")[0] : null;
  const perfilIncompleto = Boolean(clienteId) && (!cliente || cliente.nome === "Cliente" || !cliente.data_nascimento);
  const podeAlterar = proximo ? proximo.inicio.getTime() - agora > horasMinimas * 3600_000 : false;

  const avisos: Record<string, string> = {
    agendado: "Agendamento confirmado! A confirmação também chega no seu WhatsApp.",
    remarcado: "Horário remarcado! O novo horário também chega no seu WhatsApp.",
  };

  return (
    <div className="space-y-6">
      <HeroStudio
        fotoGisele={fotoGisele}
        saudacao={
          primeiroNome ? (
            <>
              {saudacao()}, <span className="text-gold-soft">{primeiroNome}</span>
            </>
          ) : (
            `${saudacao()}!`
          )
        }
      />

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

      <EquipeStudio profissionais={profissionais} />

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

    </div>
  );
}
