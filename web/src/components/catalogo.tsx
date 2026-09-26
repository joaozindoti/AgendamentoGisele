"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { duracao, preco } from "@/lib/formato";
import { CATEGORIAS, type Servico } from "@/lib/tipos";
import { Selo, Vazio } from "./ui";

export function FiltroCategorias({
  categorias,
  ativa,
  aoTrocar,
}: {
  categorias: string[];
  ativa: string;
  aoTrocar: (c: string) => void;
}) {
  const opcoes = [{ chave: "todos", rotulo: "Todos" }, ...CATEGORIAS.filter((c) => categorias.includes(c.chave))];
  if (opcoes.length <= 2) return null;
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Categorias">
      {opcoes.map((c) => (
        <button
          key={c.chave}
          role="tab"
          aria-selected={ativa === c.chave}
          onClick={() => aoTrocar(c.chave)}
          className={`shrink-0 rounded-pill px-4 py-1.5 text-[13px] font-medium transition-colors ${
            ativa === c.chave ? "bg-accent text-white" : "bg-surface text-ink-muted hover:text-accent"
          }`}
        >
          {c.rotulo}
        </button>
      ))}
    </div>
  );
}

export function CartaoServico({ servico, href }: { servico: Servico; href: string }) {
  return (
    <Link href={href} className="flex gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-accent">
      {servico.foto_url && (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-input bg-base">
          <Image src={servico.foto_url} alt="" fill sizes="80px" className="object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[16px] font-semibold leading-snug text-ink">{servico.nome}</p>
          <p className="shrink-0 text-[14px] font-semibold text-gold-ink">{preco(servico.preco)}</p>
        </div>
        {servico.descricao && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{servico.descricao}</p>}
        <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted">
          <span>{duracao(servico.duracao_min)}</span>
          {servico.destaque && <Selo>Premium</Selo>}
        </p>
      </div>
    </Link>
  );
}

// hrefBase é texto, não função: este é um Client Component e o Next.js não
// deixa um Server Component passar função como prop pra ele.
export function CatalogoServicos({ servicos, hrefBase }: { servicos: Servico[]; hrefBase: string }) {
  const [ativa, setAtiva] = useState("todos");
  const categoriasPresentes = [...new Set(servicos.map((s) => s.categoria).filter(Boolean))] as string[];

  if (!servicos.length) return <Vazio>Catálogo em atualização. Volte em breve!</Vazio>;

  const grupos =
    ativa === "todos"
      ? [...CATEGORIAS.filter((c) => categoriasPresentes.includes(c.chave)), { chave: "", rotulo: "Outros", sub: "", foto: "", alt: "" }]
      : CATEGORIAS.filter((c) => c.chave === ativa);

  return (
    <>
      <FiltroCategorias categorias={categoriasPresentes} ativa={ativa} aoTrocar={setAtiva} />
      <div className="space-y-8">
        {grupos.map((g) => {
          const itens = servicos.filter((s) => (g.chave ? s.categoria === g.chave : !CATEGORIAS.some((c) => c.chave === s.categoria)));
          if (!itens.length) return null;
          return (
            <section key={g.chave || "outros"}>
              {g.foto ? (
                <div className="relative mb-3 h-28 overflow-hidden rounded-card">
                  <Image src={g.foto} alt={g.alt} fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-ink/70 to-transparent" />
                  <div className="absolute bottom-3 left-4 text-white">
                    <p className="text-[20px] font-semibold">{g.rotulo}</p>
                    <p className="text-[12px] text-white/80">{g.sub}</p>
                  </div>
                </div>
              ) : (
                categoriasPresentes.length > 0 && <p className="mb-3 text-[18px] font-semibold">{g.rotulo}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {itens.map((s) => (
                  <CartaoServico key={s.id} servico={s} href={`${hrefBase}${s.id}`} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
