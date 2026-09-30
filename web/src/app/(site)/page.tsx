import Link from "next/link";
import { CabecalhoSecao, HeroStudio, LocalizacaoStudio, PAINEL } from "@/components/home-cliente";
import { LinkBotao } from "@/components/ui";
import { preco, duracao } from "@/lib/formato";
import { resumoHorarios, statusAgora } from "@/lib/studio";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Disponibilidade, Servico } from "@/lib/tipos";

// Horário e "aberto agora" vêm do banco a cada request (o client de servidor
// lê cookies, então a rota já é dinâmica).
export default async function Home() {
  const supabase = await criarClienteServidor();

  // Tudo em paralelo: a grade vem já filtrada pelas donas (join), em vez de
  // buscar a dona primeiro e só depois a grade dela.
  const [{ data: dispDonas }, { data: destaques }] = await Promise.all([
    supabase
      .from("disponibilidade_profissional")
      .select("*, dona:profissionais!inner(papel, ativo, criado_em, foto_url)")
      .eq("dona.papel", "owner")
      .eq("dona.ativo", true),
    supabase
      .from("servicos")
      .select("id, nome, descricao, preco, duracao_min, destaque")
      .eq("destaque", true)
      .order("nome")
      .limit(3),
  ]);

  // a Gisele é a dona cadastrada primeiro (pode haver outra dona, ex: conta de teste)
  const linhas = (dispDonas ?? []) as (Disponibilidade & { dona: { criado_em: string; foto_url: string | null } })[];
  const primeira = [...linhas].sort((a, b) => a.dona.criado_em.localeCompare(b.dona.criado_em))[0];
  const gisele = primeira?.profissional_id;
  const disp = linhas.filter((l) => l.profissional_id === gisele);

  const horarios = resumoHorarios((disp ?? []) as Disponibilidade[]);
  const agora = statusAgora((disp ?? []) as Disponibilidade[]);

  // Vitrine no mesmo desenho da home do app (fase 20): hero em arco,
  // faixa de exclusividade (no layout), painéis brancos com fio dourado.
  return (
    <>
      <div className="mx-auto max-w-xl px-4 pt-4">
        <HeroStudio
          fotoGisele={primeira?.dona.foto_url ?? null}
          chamada="Studio Gisele Lima"
          titulo="Seja uma"
          destaque="Lindeza Premium."
          secundario={{ href: "/servicos", rotulo: "Ver serviços" }}
        />
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4">
        <div className="grid gap-6 sm:grid-cols-2">
          <section className={PAINEL}>
            <CabecalhoSecao chamada="Horários" titulo="Quando atendemos" />
            {agora && (
              <p className={`flex items-center gap-2 text-[14px] font-medium ${agora.aberto ? "text-ok" : "text-ink-muted"}`}>
                <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
                {agora.texto}
              </p>
            )}
            <p className="mt-2 text-[15px] text-ink">{horarios.funcionamento.join(" · ") || "Horários em atualização"}</p>
            {(horarios.pausas.length > 0 || horarios.fechados.length > 0) && (
              <p className="mt-1 text-[13px] text-ink-muted">
                {horarios.pausas.length > 0 && <>Pausa para almoço: {horarios.pausas.join(" · ")}</>}
                {horarios.pausas.length > 0 && horarios.fechados.length > 0 && " · "}
                {horarios.fechados.length > 0 && <>{horarios.fechados.join(", ")} fechado</>}
              </p>
            )}
          </section>
          <LocalizacaoStudio />
        </div>

        {destaques && destaques.length > 0 && (
          <section className={PAINEL}>
            <div className="flex items-end justify-between gap-4">
              <CabecalhoSecao chamada="Menu exclusivo" titulo="Experiências do Studio" />
              <Link href="/servicos" className="mb-4 shrink-0 font-display text-[14px] font-bold text-accent">
                Ver catálogo →
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {(destaques as Pick<Servico, "id" | "nome" | "descricao" | "preco" | "duracao_min">[]).map((s) => (
                <li key={s.id}>
                  <Link href={`/cliente/agendar?servico=${s.id}`} className="group flex items-start justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink group-hover:text-accent">{s.nome}</p>
                      {s.descricao && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{s.descricao}</p>}
                      <p className="mt-1 text-[12px] text-ink-muted">{duracao(s.duracao_min)}</p>
                    </div>
                    <span className="shrink-0 font-display text-[15px] font-bold text-gold-ink">{preco(s.preco)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${PAINEL} text-center`}>
          <span aria-hidden className="mx-auto block h-px w-10 bg-gold/70" />
          <p className="mx-auto mt-4 max-w-md font-display text-[20px] leading-snug font-bold tracking-[-0.02em] text-ink">
            Escolha o serviço, o horário e pronto — a confirmação chega no seu WhatsApp.
          </p>
          <LinkBotao href="/cliente/agendar" className="mt-5 min-h-12 px-8 text-[16px]">
            Agendar agora
          </LinkBotao>
        </section>
      </div>
    </>
  );
}
