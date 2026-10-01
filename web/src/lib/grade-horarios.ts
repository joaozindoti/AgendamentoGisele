// Lógica pura da grade de horários do SeletorHorario, sem imports, pra ser
// testada direto no Node (supabase/tests/grade-horarios.test.mjs).

export type EstadoSlot = "livre" | "indisponivel" | "atual";

/**
 * Junta os livres que o banco devolveu com a moldura da grade de trabalho
 * (todos os inícios do dia) e ordena. Na remarcação o banco ignora o próprio
 * agendamento e devolve o horário atual da cliente como livre: esse vira
 * "atual" (destacado, não escolhível), nunca uma opção comum.
 */
export function montarSlots(livres: string[], moldura: string[], atual?: string | null) {
  const setLivres = new Set(livres);
  const todos = new Set([...livres, ...moldura]);
  return [...todos].sort().map((iso) => ({
    iso,
    estado: (iso === atual ? "atual" : setLivres.has(iso) ? "livre" : "indisponivel") as EstadoSlot,
  }));
}
