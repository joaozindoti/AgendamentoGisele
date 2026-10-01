// Grade de horários (fase 22): na remarcação o banco ignora o próprio
// agendamento e devolve o horário atual da cliente como livre. A lógica pura
// de web/src/lib/grade-horarios.ts (o Node 22.6+ lê .ts direto) tem que
// marcá-lo como "atual", nunca como opção comum.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { montarSlots } from "../../web/src/lib/grade-horarios.ts";

const h = (hhmm) => new Date(`2026-10-05T${hhmm}:00-03:00`).toISOString();

describe("montarSlots", () => {
  const moldura = ["09:00", "09:30", "10:00", "10:30"].map(h);
  // banco: 09:00 e 10:00 livres; 10:00 é o horário que a cliente já tem
  const livres = [h("09:00"), h("10:00")];

  test("sem horário atual (agendar): livre = o que o banco devolveu", () => {
    assert.deepEqual(
      montarSlots(livres, moldura).map((s) => s.estado),
      ["livre", "indisponivel", "livre", "indisponivel"],
    );
  });

  test("remarcação: horário atual da cliente não aparece como opção comum", () => {
    const slots = montarSlots(livres, moldura, h("10:00"));
    const atual = slots.filter((s) => s.estado === "atual");
    assert.deepEqual(atual.map((s) => s.iso), [h("10:00")]);
    assert.ok(!slots.some((s) => s.iso === h("10:00") && s.estado === "livre"));
    assert.deepEqual(slots.filter((s) => s.estado === "livre").map((s) => s.iso), [h("09:00")]);
  });

  test("horário atual em outro dia não interfere na grade", () => {
    const slots = montarSlots(livres, moldura, new Date("2026-10-06T10:00:00-03:00").toISOString());
    assert.equal(slots.length, 4);
    assert.ok(!slots.some((s) => s.estado === "atual"));
  });
});
