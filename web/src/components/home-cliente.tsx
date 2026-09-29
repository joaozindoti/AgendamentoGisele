import Image from "next/image";
import type { ReactNode } from "react";
import { CATEGORIAS } from "@/lib/tipos";
import { LinkBotao } from "./ui";

// Blocos da home da cliente (redesign "Lindeza Premium", 30/09/2026).
// Tudo aqui é Server Component e lê só dado público: nome, bio e foto de
// profissional ativa, e a categoria dos serviços que cada uma faz.

// Foto do hero: a da Gisele (perfil dela em Mais → Meu perfil). Enquanto ela
// não tiver foto, usa a foto dela do hero do site antigo.
const FOTO_HERO_PADRAO = "/fotos/hero-nova.webp";

export function HeroStudio({
  fotoGisele,
  saudacao,
  children,
}: {
  fotoGisele: string | null;
  saudacao: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-card bg-ink">
      <div className="relative aspect-[5/6] w-full sm:aspect-[16/11]">
        <Image
          src={fotoGisele ?? FOTO_HERO_PADRAO}
          alt="Gisele Lima, fundadora do Studio"
          fill
          priority
          sizes="(max-width: 640px) 100vw, 576px"
          className="object-cover object-top"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/35 to-ink/5" />
        <SeloTopOfMind className="absolute top-4 right-4" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft">Lindeza Premium</p>
          <h1 className="mt-1.5 text-[30px] leading-[1.1] font-bold tracking-tight">{saudacao}</h1>
          <p className="mt-2 max-w-sm text-[15px] leading-snug text-white/85">
            Estética feminina em Pedreiras - MA. Sobrancelha, pele e epilação com o cuidado da Gisele e da equipe.
          </p>
          {children}
          <LinkBotao href="/cliente/agendar" variante="secundario" className="mt-4">
            Agendar horário
          </LinkBotao>
        </div>
      </div>
    </section>
  );
}

// PLACEHOLDER: selo desenhado em CSS com o texto do prêmio (o mesmo do site
// antigo, "Top of Mind Excelência Brasil 2025"). Trocar pela imagem oficial
// do selo quando a Gisele mandar: um <Image> no lugar deste <div>.
export function SeloTopOfMind({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Top of Mind Excelência Brasil 2025"
      className={`flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full border-2 border-gold bg-surface/95 text-center shadow-[0_6px_20px_rgba(43,26,31,0.25)] ring-4 ring-gold-soft/35 ${className}`}
    >
      <span className="font-display text-[10px] leading-none font-extrabold tracking-[0.12em] text-gold-ink">TOP OF</span>
      <span className="font-display text-[10px] leading-tight font-extrabold tracking-[0.12em] text-gold-ink">MIND</span>
      <span className="mt-0.5 text-[8px] leading-tight font-medium text-ink-muted">Excelência Brasil</span>
      <span className="font-display text-[15px] leading-none font-bold text-accent">2025</span>
    </div>
  );
}

export interface ProfissionalHome {
  id: string;
  papel: "owner" | "staff";
  nome: string;
  bio: string | null;
  foto_url: string | null;
  categorias: string[];
}

/** Bio curta, se ela escreveu; senão as áreas dos serviços que ela faz. */
function especialidade(p: ProfissionalHome) {
  const bio = p.bio?.trim();
  if (bio) return bio;
  const rotulos = p.categorias.map((c) => CATEGORIAS.find((x) => x.chave === c)?.rotulo ?? c);
  return rotulos.join(" · ");
}

function FotoProfissional({ p, tamanho }: { p: ProfissionalHome; tamanho: string }) {
  // Gisele sem foto de perfil: a foto dela do site antigo (a mesma do hero)
  const foto = p.foto_url ?? (p.papel === "owner" ? FOTO_HERO_PADRAO : null);
  return foto ? (
    <Image src={foto} alt={p.nome} fill sizes={tamanho} className="object-cover object-top" />
  ) : (
    <span className="flex h-full w-full items-center justify-center font-display text-[36px] font-bold text-accent/70">
      {p.nome.charAt(0)}
    </span>
  );
}

// Carrossel horizontal (scroll nativo com snap, sem JS). Com uma
// profissional só, vira um cartão largo — carrossel de um item fica estranho.
export function EquipeStudio({ profissionais }: { profissionais: ProfissionalHome[] }) {
  if (profissionais.length === 0) return null;

  return (
    <section>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-gold-ink">Nossa equipe</p>
      <h2 className="mt-1 mb-3 text-[20px] font-bold tracking-tight">Quem cuida de você</h2>

      {profissionais.length === 1 ? (
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-3">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-input bg-base">
            <FotoProfissional p={profissionais[0]} tamanho="96px" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[17px] font-bold">{profissionais[0].nome}</p>
            {especialidade(profissionais[0]) && (
              <p className="mt-0.5 line-clamp-3 text-[14px] text-ink-muted">{especialidade(profissionais[0])}</p>
            )}
          </div>
        </div>
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {profissionais.map((p) => (
            <li key={p.id} className="w-[62%] max-w-56 shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface">
              <div className="relative aspect-[4/5] bg-base">
                <FotoProfissional p={p} tamanho="224px" />
              </div>
              <div className="p-3">
                <p className="font-display text-[16px] font-bold leading-tight">{p.nome}</p>
                {especialidade(p) && <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{especialidade(p)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
