"use client";

import { useActionState } from "react";
import { Botao, Caixa, Campo, Selecao } from "@/components/ui";
import { NOMES_DIAS, chaveDia } from "@/lib/formato";
import { adicionarBloqueio, adicionarJanela } from "./actions";

export function FormJanela({ profissionalId }: { profissionalId: string }) {
  const [estado, acao, pendente] = useActionState(adicionarJanela.bind(null, profissionalId), null);
  return (
    <form action={acao} className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
      <Selecao rotulo="Dia" name="dia_semana" defaultValue="1" className="col-span-3 sm:col-span-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <option key={d} value={d}>
            {NOMES_DIAS[d]}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Início" name="hora_inicio" type="time" step={300} required />
      <Campo rotulo="Fim" name="hora_fim" type="time" step={300} required />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Adicionar
      </Botao>
      {estado?.erro && (
        <div className="col-span-full">
          <Caixa tipo="erro">{estado.erro}</Caixa>
        </div>
      )}
    </form>
  );
}

export function FormBloqueio({ profissionalId }: { profissionalId: string }) {
  const [estado, acao, pendente] = useActionState(adicionarBloqueio.bind(null, profissionalId), null);
  return (
    <form action={acao} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="De (dia)" name="dia_inicio" type="date" min={chaveDia()} required />
        <Campo rotulo="Até (dia)" name="dia_fim" type="date" min={chaveDia()} dica="Vazio = mesmo dia" />
        <Campo rotulo="Das (hora)" name="hora_inicio" type="time" step={300} dica="Vazio = dia todo" />
        <Campo rotulo="Às (hora)" name="hora_fim" type="time" step={300} />
      </div>
      <Campo rotulo="Motivo (opcional)" name="motivo" placeholder="Férias, curso, consulta…" />
      {estado?.erro && <Caixa tipo="erro">{estado.erro}</Caixa>}
      {estado?.ok && <Caixa tipo="ok">Bloqueio adicionado.</Caixa>}
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Bloquear período
      </Botao>
    </form>
  );
}
