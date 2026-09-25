import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Primitivos do design system (seção 9). Regras:
// - radius: rounded-card em card/painel, rounded-input em campo, rounded-pill em botão
// - accent (bordô) = ação; gold = preço/selo/"Lindeza Premium"; nunca os dois no mesmo elemento
// - card sem sombra; a única sombra (overlay) é pra elemento flutuante

type Variante = "primario" | "secundario" | "fantasma" | "perigo";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-accent text-white hover:bg-accent-hover disabled:bg-accent/40",
  secundario: "bg-base text-accent hover:bg-line disabled:text-accent/40",
  fantasma: "bg-transparent text-ink-muted hover:text-accent disabled:text-ink-muted/40",
  perigo: "bg-transparent text-alerta border border-alerta/40 hover:bg-alerta/5 disabled:opacity-40",
};

const BASE_BOTAO =
  "inline-flex items-center justify-center gap-2 rounded-pill px-5 min-h-11 text-[15px] font-medium transition-colors disabled:cursor-not-allowed";

export function Botao({
  variante = "primario",
  largo,
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: Variante; largo?: boolean }) {
  return (
    <button {...props} className={`${BASE_BOTAO} ${VARIANTES[variante]} ${largo ? "w-full" : ""} ${className}`} />
  );
}

export function LinkBotao({
  variante = "primario",
  largo,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; largo?: boolean }) {
  return (
    <Link {...props} className={`${BASE_BOTAO} ${VARIANTES[variante]} ${largo ? "w-full" : ""} ${className}`} />
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`bg-surface rounded-card border border-line ${className}`} />;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[12px] font-semibold uppercase tracking-[0.14em] text-gold-ink ${className}`}>{children}</p>;
}

export function Titulo({
  eyebrow,
  children,
  sub,
  className = "",
}: {
  eyebrow?: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-5 ${className}`}>
      {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink">{children}</h1>
      {sub && <p className="mt-1 text-[15px] text-ink-muted">{sub}</p>}
    </header>
  );
}

export function Selo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block bg-gold-soft/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-ink">
      {children}
    </span>
  );
}

const CAMPO =
  "w-full rounded-input border border-line bg-surface px-3 min-h-11 text-[16px] text-ink placeholder:text-ink-muted/60 focus:border-accent focus:outline-none disabled:bg-base";

export function Campo({
  rotulo,
  dica,
  erro,
  className = "",
  ...props
}: ComponentProps<"input"> & { rotulo: string; dica?: string; erro?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{rotulo}</span>
      <input {...props} className={CAMPO} />
      {dica && !erro && <span className="mt-1 block text-[12px] text-ink-muted">{dica}</span>}
      {erro && <span className="mt-1 block text-[12px] text-alerta">{erro}</span>}
    </label>
  );
}

export function AreaTexto({ rotulo, className = "", ...props }: ComponentProps<"textarea"> & { rotulo: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{rotulo}</span>
      <textarea {...props} className={`${CAMPO} py-2 min-h-24`} />
    </label>
  );
}

export function Selecao({
  rotulo,
  className = "",
  children,
  ...props
}: ComponentProps<"select"> & { rotulo: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{rotulo}</span>
      <select {...props} className={CAMPO}>
        {children}
      </select>
    </label>
  );
}

export function Caixa({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok"; children: ReactNode }) {
  const estilo = {
    info: "border-line bg-surface text-ink",
    erro: "border-alerta/30 bg-alerta/5 text-alerta",
    ok: "border-ok/30 bg-ok/5 text-ok",
  }[tipo];
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-input border px-4 py-3 text-[14px] ${estilo}`}>
      {children}
    </p>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-[14px] text-ink-muted">{children}</p>;
}

const COR_STATUS: Record<string, string> = {
  confirmado: "text-accent",
  concluido: "text-ok",
  cancelado: "text-ink-muted line-through",
  no_show: "text-alerta",
};

export function PontoStatus({ status, rotulo }: { status: string; rotulo: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${COR_STATUS[status] ?? ""}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {rotulo}
    </span>
  );
}
