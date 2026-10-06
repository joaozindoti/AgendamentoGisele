import Image from "next/image";
import type { ReactNode } from "react";
import { ENDERECO, LINK_MAPS } from "@/lib/studio";
import { rotuloCategoria } from "@/lib/tipos";
import { IconeLocal } from "./icones";
import { LinkBotao } from "./ui";

// Blocos da home da cliente (redesign "Lindeza Premium", 30/09/2026), também
// usados na vitrine pública (app/(site)) desde a fase 20.
// Tudo aqui é Server Component e lê só dado público: nome, bio e foto de
// profissional ativa, e a categoria dos serviços que cada uma faz.
//
// Assinatura visual: foto em ARCO (o espelho do salão), com um contorno
// dourado deslocado atrás pra dar profundidade. O mesmo arco se repete,
// pequeno, nas fotos da equipe.

// Foto do hero: a da Gisele (perfil dela em Mais → Meu perfil). Enquanto ela
// não tiver foto, usa a foto dela do hero do site antigo.
const FOTO_HERO_PADRAO = "/fotos/hero-nova.webp";

export function HeroStudio({
  fotoGisele,
  chamada,
  titulo,
  destaque,
  secundario,
}: {
  fotoGisele: string | null;
  /** linha pequena acima do título (saudação ou "Lindeza Premium") */
  chamada: string;
  /** primeira linha do título, em peso leve */
  titulo: string;
  /** segunda linha do título, em peso forte */
  destaque: ReactNode;
  /** botão ao lado do "Agendar horário" (a vitrine pública usa pra "Ver serviços") */
  secundario?: { href: string; rotulo: string };
}) {
  return (
    <section className="relative -mx-4 overflow-hidden px-4 pt-3 pb-8">
      {/* brilho rosado bem suave atrás do arco: único rosa "de área" da tela */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-[340px] w-[340px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(244,225,229,0.95),rgba(247,245,244,0))]"
      />

      <div className="relative mx-auto w-[64%] max-w-[250px]">
        {/* contorno dourado deslocado: a camada de trás */}
        <div aria-hidden className="absolute inset-0 translate-x-3 -translate-y-3 rounded-t-full rounded-b-[22px] border border-gold/70" />
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-[22px] bg-ink shadow-soft">
          <Image
            src={fotoGisele ?? FOTO_HERO_PADRAO}
            alt="Gisele Lima, fundadora do Studio"
            fill
            loading="eager"
            fetchPriority="high"
            sizes="250px"
            className="object-cover object-[50%_18%]"
          />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/35 to-transparent" />
        </div>
        <SeloTopOfMind className="absolute -bottom-3 -left-9 -rotate-[8deg]" />
      </div>

      <div className="relative mt-9 text-center">
        <p className="flex items-center justify-center gap-3 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-ink">
          <span aria-hidden className="h-px w-8 bg-gradient-to-l from-gold/70 to-transparent" />
          {chamada}
          <span aria-hidden className="h-px w-8 bg-gradient-to-r from-gold/70 to-transparent" />
        </p>
        <h1 className="mt-2 text-[40px] leading-[1.02] tracking-[-0.04em] text-ink">
          <span className="block font-extralight">{titulo}</span>
          <span className="block font-extrabold">{destaque}</span>
        </h1>
        <p className="mx-auto mt-3 max-w-[19rem] text-[15px] leading-relaxed text-ink-muted">
          Sobrancelha, pele e epilação em Pedreiras&nbsp;-&nbsp;MA, com o cuidado da Gisele e da equipe.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <LinkBotao href="/cliente/agendar" className="min-h-12 px-8 text-[16px]">
            Agendar horário
          </LinkBotao>
          {secundario && (
            <LinkBotao href={secundario.href} variante="secundario" className="min-h-12 px-6 text-[16px]">
              {secundario.rotulo}
            </LinkBotao>
          )}
        </div>
      </div>
    </section>
  );
}

// Faixa de exclusividade no TOPO da home, antes do hero: é regra do studio,
// não detalhe, e o hero sozinho já ocupa a primeira tela do celular. Chega
// como uma notificação (entra deslizando) e é o único bloco escuro da home.
export function SeloExclusivoFeminino() {
  return (
    <aside className="flex animate-[faixa-entra_420ms_cubic-bezier(0.2,0.8,0.2,1)_both] items-center gap-3 rounded-card bg-ink py-2.5 pr-4 pl-2.5 text-white shadow-soft motion-reduce:animate-none">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-soft/80 bg-white/5 font-display text-[18px] leading-none text-gold-soft"
      >
        ♀
      </span>
      <p className="min-w-0 font-display text-[14px] leading-snug font-bold tracking-[-0.005em] text-balance">
        Atendimento exclusivo para o <span className="text-gold-soft">público feminino</span>
      </p>
    </aside>
  );
}

// Cabeçalho das seções da home: fio dourado + chamada + título, o mesmo
// acabamento em todas, pra nenhum título ficar "solto" no fundo liso.
export function CabecalhoSecao({ chamada, titulo }: { chamada: string; titulo: string }) {
  return (
    <header className="mb-4">
      <p className="flex items-center gap-2.5 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-ink">
        <span aria-hidden className="h-px w-6 bg-gold/70" />
        {chamada}
      </p>
      <h2 className="mt-1.5 text-[24px] leading-tight font-extrabold tracking-[-0.03em]">{titulo}</h2>
    </header>
  );
}

// Painel branco com sombra suave que embrulha cada seção da home.
export const PAINEL = "rounded-card bg-surface p-5 shadow-soft";

export function LocalizacaoStudio() {
  return (
    <section className={PAINEL}>
      <CabecalhoSecao chamada="Localização" titulo="Onde estamos" />
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
          <IconeLocal />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[16px] font-bold tracking-[-0.01em]">Studio Gisele Lima</p>
          <p className="mt-0.5 text-[14px] text-ink-muted">{ENDERECO}</p>
          <LinkBotao href={LINK_MAPS} target="_blank" rel="noopener" variante="secundario" className="mt-3">
            Ver no mapa
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
      className={`flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface shadow-soft ${className}`}
    >
      <div className="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full border border-gold text-center">
        <span className="font-display text-[9px] leading-none font-extrabold tracking-[0.16em] text-gold-ink">TOP OF MIND</span>
        <span className="mt-1 font-display text-[18px] leading-none font-extrabold tracking-[-0.02em] text-accent">2025</span>
        <span className="mt-1 text-[7.5px] leading-tight font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Excelência
          <br />
          Brasil
        </span>
      </div>
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
  const rotulos = p.categorias.map(rotuloCategoria);
  return rotulos.join(" · ");
}

function FotoArco({ p, tamanho, className = "" }: { p: ProfissionalHome; tamanho: string; className?: string }) {
  // Gisele sem foto de perfil: a foto dela do site antigo (a mesma do hero)
  const foto = p.foto_url ?? (p.papel === "owner" ? FOTO_HERO_PADRAO : null);
  return (
    <div className={`relative overflow-hidden rounded-t-full rounded-b-[14px] bg-blush ${className}`}>
      {foto ? (
        <Image src={foto} alt={p.nome} fill sizes={tamanho} className="object-cover object-[50%_18%]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-display text-[34px] font-extralight text-accent">
          {p.nome.charAt(0)}
        </span>
      )}
    </div>
  );
}

// Carrossel horizontal (scroll nativo com snap, sem JS). Com uma
// profissional só, vira um cartão largo — carrossel de um item fica estranho.
export function EquipeStudio({ profissionais }: { profissionais: ProfissionalHome[] }) {
  if (profissionais.length === 0) return null;

  return (
    <section className={PAINEL}>
      <CabecalhoSecao chamada="Nossa equipe" titulo="Quem cuida de você" />

      {profissionais.length === 1 ? (
        <div className="flex items-center gap-4">
          <FotoArco p={profissionais[0]} tamanho="88px" className="h-[110px] w-[88px] shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-[18px] font-bold tracking-[-0.02em]">{profissionais[0].nome}</p>
            {especialidade(profissionais[0]) && (
              <p className="mt-1 line-clamp-3 text-[14px] text-ink-muted">{especialidade(profissionais[0])}</p>
            )}
          </div>
        </div>
      ) : (
        <ul className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {profissionais.map((p) => (
            <li key={p.id} className="w-[44%] max-w-44 shrink-0 snap-start">
              <FotoArco p={p} tamanho="176px" className="aspect-[4/5] w-full shadow-soft" />
              <p className="mt-3 font-display text-[16px] leading-tight font-bold tracking-[-0.02em]">{p.nome}</p>
              {especialidade(p) && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-muted">{especialidade(p)}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
