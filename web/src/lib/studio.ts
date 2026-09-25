import type { Disponibilidade } from "./tipos";
import { FUSO, NOMES_DIAS } from "./formato";

// Dados fixos do studio, herdados de js/utils.js do site atual.
export const ENDERECO = "Av. Zeca Branco - Mutirão, Pedreiras - MA, 65725-000";
export const LINK_MAPS = "https://share.google/ZL5nk044N2o113GlP";
// Número do botão "Falar com o studio" — 5599984183784, o mesmo do site
// atual (decisão fechada em 25/09/2026). Vem obrigatoriamente da env var;
// o next.config.ts recusa o build se ela faltar.
export const WHATSAPP_STUDIO = `+${process.env.NEXT_PUBLIC_WHATSAPP_STUDIO}`;

const ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const paraMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const rotuloHora = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

function janelasPorDia(disp: Disponibilidade[]) {
  const dias: { inicio: number; fim: number }[][] = Array.from({ length: 7 }, () => []);
  for (const d of disp) dias[d.dia_semana].push({ inicio: paraMin(d.hora_inicio), fim: paraMin(d.hora_fim) });
  dias.forEach((j) => j.sort((a, b) => a.inicio - b.inicio));
  return dias;
}

function agrupa(rotulos: (string | null)[]) {
  // Dias seguidos (seg..sáb) com o mesmo rótulo viram "Ter–Sex".
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const grupos: { dias: number[]; rotulo: string }[] = [];
  for (const dia of ordem) {
    const r = rotulos[dia];
    if (!r) continue;
    const ultimo = grupos[grupos.length - 1];
    const anterior = ordem[ordem.indexOf(dia) - 1];
    if (ultimo && ultimo.rotulo === r && ultimo.dias[ultimo.dias.length - 1] === anterior) ultimo.dias.push(dia);
    else grupos.push({ dias: [dia], rotulo: r });
  }
  return grupos.map(({ dias, rotulo }) => ({
    dias: dias.length === 1 ? ABREV[dias[0]] : `${ABREV[dias[0]]}–${ABREV[dias[dias.length - 1]]}`,
    rotulo,
  }));
}

/** Resumo de horário derivado da disponibilidade real no banco — o site
 *  atual tinha isso duplicado à mão em três lugares (HTML, calendar.js e n8n). */
export function resumoHorarios(disp: Disponibilidade[]) {
  const dias = janelasPorDia(disp);
  const funcionamento = agrupa(
    dias.map((j) => (j.length ? `${rotuloHora(j[0].inicio)}–${rotuloHora(j[j.length - 1].fim)}` : null)),
  ).map((g) => `${g.dias} ${g.rotulo}`);
  const pausas = agrupa(
    dias.map((j) =>
      j.length > 1 ? j.slice(1).map((w, i) => `${rotuloHora(j[i].fim)}–${rotuloHora(w.inicio)}`).join(", ") : null,
    ),
  ).map((g) => `${g.dias} ${g.rotulo}`);
  // sem grade nenhuma (banco fora do ar, ou ainda sem cadastro) não é "tudo
  // fechado" — é "não sabemos"; a home mostra "Horários em atualização"
  const fechados = disp.length ? dias.map((j, i) => (j.length ? null : NOMES_DIAS[i])).filter(Boolean) : [];
  return { funcionamento, pausas, fechados };
}

export function statusAgora(disp: Disponibilidade[], agora = new Date()) {
  const dias = janelasPorDia(disp);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(agora);
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.find((p) => p.type === "weekday")!.value);
  const min = Number(partes.find((p) => p.type === "hour")!.value) * 60 + Number(partes.find((p) => p.type === "minute")!.value);

  for (const j of dias[dia]) {
    if (min >= j.inicio && min < j.fim) return { aberto: true, texto: `Aberto agora · até ${rotuloHora(j.fim)}` };
    if (min < j.inicio) return { aberto: false, texto: `Fechado no momento · abre hoje às ${rotuloHora(j.inicio)}` };
  }
  for (let d = 1; d <= 7; d++) {
    const proximo = dias[(dia + d) % 7];
    if (proximo.length) {
      const quando = d === 1 ? "amanhã" : NOMES_DIAS[(dia + d) % 7].toLowerCase();
      return { aberto: false, texto: `Fechado no momento · abre ${quando} às ${rotuloHora(proximo[0].inicio)}` };
    }
  }
  return null;
}
