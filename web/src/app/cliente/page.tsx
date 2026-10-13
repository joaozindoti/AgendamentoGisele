import { AcoesAgendamentoCliente } from "@/components/acoes-agendamento";
import {
  EquipeStudio,
  HeroStudio,
  LocalizacaoStudio,
  SeloExclusivoFeminino,
  type ProfissionalHome,
} from "@/components/home-cliente";
import { Caixa, Card, Eyebrow } from "@/components/ui";
import { obterAreaCliente } from "@/lib/auth";
import { SELECT_AGENDAMENTO_CLIENTE, lerConfigNumero, type AgendamentoComDetalhes } from "@/lib/consultas";
import { agoraMs, dataLonga, hora, lerPeriodo, saudacao } from "@/lib/formato";
import { WHATSAPP_STUDIO } from "@/lib/studio";

export default async function InicioCliente({ searchParams }: PageProps<"/cliente">) {
  const { supabase, clienteId } = await obterAreaCliente();
  const { aviso } = await searchParams;

  // Home enxuta (fase 16): faixa de exclusividade (no topo, visível sem
  // rolar), hero, próximo horário (se houver), equipe e localização.
  const [{ data: cliente }, { data: agendamentos }, horasMinimas, { data: equipe }, { data: vinculos }] = await Promise.all([
    clienteId
      ? supabase.from("clientes").select("nome").eq("id", clienteId).single()
      : Promise.resolve({ data: null }),
    clienteId
      ? supabase
          .from("agendamentos")
          .select(SELECT_AGENDAMENTO_CLIENTE)
          .eq("cliente_id", clienteId)
          .eq("status", "confirmado")
          .order("periodo")
      : Promise.resolve({ data: [] }),
    lerConfigNumero(supabase, "horas_minimas_remarcacao", 4),
    // leitura pública (sem telefone): mesma que a tela de escolher profissional usa
    supabase.from("profissionais").select("id, nome, bio, foto_url, papel, criado_em").eq("ativo", true).order("papel").order("criado_em"),
    supabase.from("profissional_servicos").select("profissional_id, servico:servicos(categoria)"),
  ]);

  const categoriasPorProfissional = new Map<string, Set<string>>();
  for (const v of (vinculos ?? []) as unknown as { profissional_id: string; servico: { categoria: string | null } | null }[]) {
    if (!v.servico) continue; // serviço inativo
    if (!categoriasPorProfissional.has(v.profissional_id)) categoriasPorProfissional.set(v.profissional_id, new Set());
    if (!v.servico.categoria) continue;
    const set = categoriasPorProfissional.get(v.profissional_id) ?? new Set<string>();
    set.add(v.servico.categoria);
    categoriasPorProfissional.set(v.profissional_id, set);
  }
  // Só quem atende algum serviço ativo aparece pra cliente (tira da vitrine
  // quem é só administração, como a conta de teste do João).
  const profissionais: ProfissionalHome[] = (equipe ?? []).filter((p) => categoriasPorProfissional.has(p.id)).map((p) => ({
    id: p.id,
    papel: p.papel,
    nome: p.nome,
    bio: p.bio,
    foto_url: p.foto_url,
    categorias: [...(categoriasPorProfissional.get(p.id) ?? [])],
  }));
  // a Gisele é a dona cadastrada primeiro (seed); a lista já vem por criado_em
  const fotoGisele = (equipe ?? []).find((p) => p.papel === "owner")?.foto_url ?? null;

  const agora = agoraMs();
  const proximo = ((agendamentos ?? []) as unknown as AgendamentoComDetalhes[])
    .map((a) => ({ ...a, ...lerPeriodo(a.periodo) }))
    .find((a) => a.inicio.getTime() > agora);

  const primeiroNome = cliente?.nome && cliente.nome !== "Cliente" ? cliente.nome.split(" ")[0] : null;
  const podeAlterar = proximo ? proximo.inicio.getTime() - agora > horasMinimas * 3600_000 : false;

  const avisos: Record<string, string> = {
    agendado: "Agendamento confirmado! A confirmação também chega no seu WhatsApp.",
    remarcado: "Horário remarcado! O novo horário também chega no seu WhatsApp.",
  };

  return (
    <div className="space-y-6">
      <SeloExclusivoFeminino />

      {primeiroNome ? (
        <HeroStudio fotoGisele={fotoGisele} chamada="Studio Gisele Lima" titulo={`${saudacao()},`} destaque={<>{primeiroNome}.</>} />
      ) : (
        <HeroStudio fotoGisele={fotoGisele} chamada={saudacao()} titulo="Seja uma" destaque="Lindeza Premium." />
      )}

      {typeof aviso === "string" && avisos[aviso] && <Caixa tipo="ok">{avisos[aviso]}</Caixa>}

      {proximo && (
        <Card className="overflow-hidden border-0 p-0 shadow-soft">
          <div className="flex items-stretch">
            {/* bloco da data: o que a cliente procura primeiro */}
            <div className="flex w-[84px] shrink-0 flex-col items-center justify-center bg-ink py-5 text-white">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-gold-soft">
                {dataLonga(proximo.inicio).split(",")[0].slice(0, 3)}
              </span>
              <span className="font-display text-[32px] leading-none font-extrabold tracking-[-0.03em]">
                {proximo.inicio.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Fortaleza" })}
              </span>
              <span className="mt-1 text-[13px] font-medium text-white/80">{hora(proximo.inicio)}</span>
            </div>
            <div className="min-w-0 flex-1 p-4">
              <Eyebrow>Seu próximo horário</Eyebrow>
              <p className="mt-1 font-display text-[19px] leading-snug font-bold tracking-[-0.02em]">{proximo.servico?.nome}</p>
              <p className="mt-0.5 text-[14px] text-ink-muted">
                com {proximo.profissional?.nome} · {dataLonga(proximo.inicio)}
              </p>
            </div>
          </div>
          <div className="border-t border-line px-4 pb-4">
          <AcoesAgendamentoCliente
            agendamentoId={proximo.id}
            podeAlterar={podeAlterar}
            horasMinimas={horasMinimas}
            whatsappStudio={WHATSAPP_STUDIO}
          />
          </div>
        </Card>
      )}

      <EquipeStudio profissionais={profissionais} />

      <LocalizacaoStudio />
    </div>
  );
}
