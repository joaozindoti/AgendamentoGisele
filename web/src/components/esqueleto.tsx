// Esqueleto mostrado na hora do toque, enquanto o servidor monta a página
// (loading.tsx da área da cliente e do painel). Sem ele, o app ficava parado
// na tela anterior até a resposta chegar e parecia travado.
export function Esqueleto() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-5 motion-reduce:animate-none">
      <span className="sr-only">Carregando…</span>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded-pill bg-line/70" />
        <div className="h-8 w-48 rounded-input bg-line/70" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-16 rounded-card bg-surface shadow-soft" />
      ))}
    </div>
  );
}
