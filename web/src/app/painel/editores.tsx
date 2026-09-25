import { NOMES_DIAS, agoraMs, dataCompleta, faixa, hora, lerPeriodo } from "@/lib/formato";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bloqueio, Disponibilidade } from "@/lib/tipos";
import { removerBloqueio, removerJanela } from "./actions";
import { FormBloqueio, FormJanela } from "./editores-form";

// Grade semanal e bloqueios de uma profissional. Usado tanto na tela da
// própria profissional (/painel/disponibilidade) quanto pelo owner na ficha
// de cada uma (/painel/equipe/[id]). Quem pode editar é a RLS que decide.
export async function EditorDisponibilidade({ supabase, profissionalId }: { supabase: SupabaseClient; profissionalId: string }) {
  const { data } = await supabase
    .from("disponibilidade_profissional")
    .select("*")
    .eq("profissional_id", profissionalId)
    .order("dia_semana")
    .order("hora_inicio");
  const janelas = (data ?? []) as Disponibilidade[];
  const ordem = [1, 2, 3, 4, 5, 6, 0];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold">Grade semanal</h2>
        <p className="text-[13px] text-ink-muted">
          Janelas em que a cliente pode marcar. Pausa de almoço = duas janelas no mesmo dia (ex: 09:30–12:30 e 14:00–20:00).
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {ordem.map((dia) => {
          const doDia = janelas.filter((j) => j.dia_semana === dia);
          return (
            <li key={dia} className="flex items-start gap-3 px-4 py-2.5">
              <span className="w-20 shrink-0 pt-1 text-[14px] font-medium">{NOMES_DIAS[dia]}</span>
              <span className="flex flex-1 flex-wrap gap-2">
                {doDia.length === 0 && <span className="pt-1 text-[13px] text-ink-muted">Fechado</span>}
                {doDia.map((j) => (
                  <form key={j.id} action={removerJanela.bind(null, j.id)} className="flex items-center border border-line text-[13px]">
                    <span className="px-2 py-1 tabular-nums">
                      {j.hora_inicio.slice(0, 5)}–{j.hora_fim.slice(0, 5)}
                    </span>
                    <button type="submit" aria-label="Remover janela" className="border-l border-line px-2 py-1 text-ink-muted hover:text-alerta">
                      ×
                    </button>
                  </form>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <FormJanela profissionalId={profissionalId} />
    </section>
  );
}

export async function EditorBloqueios({ supabase, profissionalId }: { supabase: SupabaseClient; profissionalId: string }) {
  const { data } = await supabase
    .from("bloqueios_agenda")
    .select("*")
    .eq("profissional_id", profissionalId)
    // só os que ainda não terminaram (inclui férias já em andamento)
    .not("periodo", "sl", faixa(new Date(agoraMs()), new Date(agoraMs() + 1)))
    .order("periodo");
  const bloqueios = ((data ?? []) as Bloqueio[]).map((b) => ({ ...b, ...lerPeriodo(b.periodo) }));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold">Folgas e bloqueios</h2>
        <p className="text-[13px] text-ink-muted">Férias, folga ou compromisso: o horário some da agenda da cliente.</p>
      </div>
      {bloqueios.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {bloqueios.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
              <span>
                {dataCompleta(b.inicio)} {hora(b.inicio)} → {dataCompleta(b.fim)} {hora(b.fim)}
                {b.motivo && <span className="block text-[12px] text-ink-muted">{b.motivo}</span>}
              </span>
              <form action={removerBloqueio.bind(null, b.id)}>
                <button type="submit" className="text-[13px] text-ink-muted hover:text-alerta">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <FormBloqueio profissionalId={profissionalId} />
    </section>
  );
}
