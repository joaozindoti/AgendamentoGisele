import Image from "next/image";
import Link from "next/link";
import { Eyebrow, LinkBotao } from "@/components/ui";
import { preco, duracao } from "@/lib/formato";
import { ENDERECO, LINK_MAPS, resumoHorarios, statusAgora } from "@/lib/studio";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Disponibilidade, Servico } from "@/lib/tipos";

// Horário e "aberto agora" vêm do banco a cada request (o client de servidor
// lê cookies, então a rota já é dinâmica).
export default async function Home() {
  const supabase = await criarClienteServidor();

  const [{ data: owner }, { data: destaques }] = await Promise.all([
    supabase.from("profissionais").select("id").eq("papel", "owner").eq("ativo", true).limit(1).maybeSingle(),
    supabase
      .from("servicos")
      .select("id, nome, descricao, preco, duracao_min, destaque")
      .eq("destaque", true)
      .order("nome")
      .limit(3),
  ]);

  const { data: disp } = owner
    ? await supabase.from("disponibilidade_profissional").select("*").eq("profissional_id", owner.id)
    : { data: [] };

  const horarios = resumoHorarios((disp ?? []) as Disponibilidade[]);
  const agora = statusAgora((disp ?? []) as Disponibilidade[]);

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Image
          src="/fotos/hero-nova.webp"
          alt="Resultado de design de sobrancelha no Studio Gisele Lima"
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/80 via-ink/40 to-ink/10" />
        <div className="mx-auto flex min-h-[78svh] max-w-5xl flex-col justify-end px-4 pb-14 text-white">
          <p className="mb-3 inline-flex w-fit items-center gap-2 border border-gold-soft/60 bg-ink/30 px-3 py-1 text-[12px] font-medium text-gold-soft">
            Top of Mind Excelência Brasil 2025
          </p>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-soft">Lindeza Premium</p>
          <h1 className="mt-2 text-[40px] leading-[1.05] font-semibold tracking-tight sm:text-[56px]">Studio Gisele Lima</h1>
          <p className="mt-3 text-[18px] text-white/90">
            Seja uma <em className="italic">Lindeza Premium</em>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkBotao href="/cliente/agendar">Agendar agora</LinkBotao>
            <LinkBotao href="/servicos" variante="secundario">
              Ver serviços
            </LinkBotao>
          </div>
        </div>
      </section>

      <p className="mx-auto max-w-5xl px-4 pt-4 text-center text-[13px] text-ink-muted">
        Atendimento exclusivo para o público feminino.
      </p>

      <section className="mx-4 mt-8 grid max-w-5xl gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 xl:mx-auto">
        <div className="bg-surface px-5 py-6">
          <Eyebrow>Horários</Eyebrow>
          {agora && (
            <p className={`mt-2 flex items-center gap-2 text-[14px] font-medium ${agora.aberto ? "text-ok" : "text-ink-muted"}`}>
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
        </div>
        <div className="bg-surface px-5 py-6">
          <Eyebrow>Localização</Eyebrow>
          <p className="mt-2 text-[15px] text-ink">{ENDERECO}</p>
          <LinkBotao href={LINK_MAPS} target="_blank" rel="noopener" variante="secundario" className="mt-3">
            Ver no mapa
          </LinkBotao>
        </div>
      </section>

      {destaques && destaques.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl px-4">
          <div className="flex items-end justify-between">
            <div>
              <Eyebrow>Menu exclusivo</Eyebrow>
              <h2 className="mt-1 text-[24px] font-semibold tracking-tight">Experiências do Studio</h2>
            </div>
            <Link href="/servicos" className="text-[14px] text-accent">
              Ver catálogo →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(destaques as Pick<Servico, "id" | "nome" | "descricao" | "preco" | "duracao_min">[]).map((s) => (
              <Link key={s.id} href={`/cliente/agendar?servico=${s.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-accent">
                <p className="text-[17px] font-semibold text-ink">{s.nome}</p>
                <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{s.descricao}</p>
                <p className="mt-3 flex justify-between text-[13px]">
                  <span className="text-ink-muted">{duracao(s.duracao_min)}</span>
                  <span className="font-semibold text-gold-ink">{preco(s.preco)}</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-14 max-w-5xl px-4 text-center">
        <p className="text-[18px] text-ink">Escolha o serviço, o horário e pronto — a confirmação chega no seu WhatsApp.</p>
        <LinkBotao href="/cliente/agendar" className="mt-5">
          Agendar agora
        </LinkBotao>
      </section>
    </>
  );
}
