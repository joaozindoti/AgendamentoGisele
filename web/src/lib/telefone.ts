// Mesma regra do precadastro.html atual (commit 393e3fe): a cliente pode
// digitar com ou sem o 55; o 55 só é removido quando sobra número demais,
// ANTES de qualquer corte — cortar primeiro fazia perder os dois últimos
// dígitos de quem digitava o 55.
export function soDddENumero(valor: string) {
  let d = valor.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

export function mascaraTelefone(valor: string) {
  const d = soDddENumero(valor);
  if (d.length > 7) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d;
}

/** DDD + número (10 ou 11 dígitos) -> E.164 brasileiro, ou null se inválido. */
export function paraE164(valor: string) {
  const d = soDddENumero(valor);
  return d.length === 10 || d.length === 11 ? `+55${d}` : null;
}

/** +5599988887777 -> (99) 98888-7777 */
export function exibirTelefone(e164: string | null | undefined) {
  if (!e164) return "";
  return e164.startsWith("+55") ? mascaraTelefone(e164.slice(3)) : e164;
}

export const linkWhatsApp = (e164: string, texto?: string) =>
  `https://wa.me/${e164.replace(/\D/g, "")}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
