"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface ItemTab {
  href: string;
  rotulo: string;
  icone: ReactNode;
  exato?: boolean;
}

export function TabBar({ itens }: { itens: ItemTab[] }) {
  const caminho = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-xl" aria-label="Navegação principal">
      <ul className="mx-auto flex max-w-xl">
        {itens.map((item) => {
          const ativo = item.exato ? caminho === item.href : caminho === item.href || caminho.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium transition-colors ${ativo ? "font-semibold text-accent" : "text-ink-muted hover:text-ink"}`}
              >
                {/* pílula rosa só na aba ativa: o rosa como acento, não como fundo */}
                <span aria-hidden className={`flex h-7 w-14 items-center justify-center rounded-pill transition-colors ${ativo ? "bg-blush" : ""}`}>
                  <span className="h-[22px] w-[22px]">{item.icone}</span>
                </span>
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
