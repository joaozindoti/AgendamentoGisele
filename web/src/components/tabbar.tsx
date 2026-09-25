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
    <nav className="navbar-blur safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line" aria-label="Navegação principal">
      <ul className="mx-auto flex max-w-xl">
        {itens.map((item) => {
          const ativo = item.exato ? caminho === item.href : caminho === item.href || caminho.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${ativo ? "text-accent" : "text-ink-muted"}`}
              >
                <span aria-hidden className="h-6 w-6">
                  {item.icone}
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
