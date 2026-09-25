// tstzrange serializado pelo Postgres: ["2026-09-26 13:00:00+00","2026-09-26 13:30:00+00")
// "espaço + offset de 2 dígitos" não é ISO 8601, e new Date() não garante
// ler esse formato — normaliza pra "2026-09-26T13:00:00+00:00" antes.
export function inicioDoPeriodo(periodo: string): Date | null {
  const bruto = periodo.match(/^[\[(]"?([^,"]+)"?,/)?.[1];
  if (!bruto) return null;
  let iso = bruto.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
