"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Botao } from "./ui";

export function RegistraServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

// As páginas logadas ficam em cache pro modo offline (seção 7). Ao sair, esse
// cache precisa ir embora junto com a sessão — senão o próximo a usar o
// aparelho abre o app offline e vê o agendamento de outra pessoa.
export async function limparCacheDePaginas() {
  if (!("caches" in window)) return;
  const nomes = await caches.keys();
  await Promise.all(nomes.filter((n) => n.startsWith("paginas-")).map((n) => caches.delete(n)));
}

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Prompt de "adicionar à tela inicial" (seção 7). Android/Chrome dispara
// beforeinstallprompt; iOS não tem API, então mostra o passo a passo.
const nadaAssinar = () => () => {};
const lerStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const lerIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPad com iPadOS se apresenta como Mac

/** Plataforma pra escolher as instruções de instalação. */
export function usePlataforma() {
  const standalone = useSyncExternalStore(nadaAssinar, lerStandalone, () => true);
  const ios = useSyncExternalStore(nadaAssinar, lerIos, () => false);
  const android = useSyncExternalStore(nadaAssinar, () => /android/i.test(navigator.userAgent), () => false);
  return { standalone, ios, android };
}

const CHAVE_AVISO = "aviso-instalar-fechado";
const lerAvisoFechado = () => {
  try {
    return localStorage.getItem(CHAVE_AVISO) === "1";
  } catch {
    return false;
  }
};

// Faixa discreta no topo da área da cliente pra quem abriu o link pelo
// navegador e ainda não instalou. Some dentro do app instalado e quando a
// cliente fecha (lembrado só neste aparelho).
export function AvisoInstalar() {
  const { standalone } = usePlataforma();
  const fechadoAntes = useSyncExternalStore(nadaAssinar, lerAvisoFechado, () => true);
  const [fechado, setFechado] = useState(false);
  if (standalone || fechadoAntes || fechado) return null;

  return (
    <div className="mb-3 flex items-center gap-3 rounded-pill bg-surface py-1.5 pr-2 pl-4 text-[13px] shadow-soft">
      <Link href="/instalar" className="flex-1 text-ink-muted">
        Tenha o app na tela inicial · <span className="font-display font-bold text-accent">Instalar</span>
      </Link>
      <button
        type="button"
        aria-label="Fechar aviso"
        className="px-1 text-[18px] leading-none text-ink-muted"
        onClick={() => {
          setFechado(true);
          try {
            localStorage.setItem(CHAVE_AVISO, "1");
          } catch {}
        }}
      >
        ×
      </button>
    </div>
  );
}

export function BotaoInstalar({ nomeApp = "o app" }: { nomeApp?: string }) {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  // no servidor não existe navegador: assume "já instalado" e não renderiza
  const standalone = useSyncExternalStore(nadaAssinar, lerStandalone, () => true);
  const ios = useSyncExternalStore(nadaAssinar, lerIos, () => false);
  const [instaladoAgora, setInstaladoAgora] = useState(false);
  const instalado = standalone || instaladoAgora;
  const [mostrarPassos, setMostrarPassos] = useState(false);

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacao);
    };
    const aoInstalar = () => setInstaladoAgora(true);
    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (instalado || (!evento && !ios)) return null;

  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-[14px] text-ink">Instale {nomeApp} na tela inicial pra abrir com um toque.</p>
      {evento ? (
        <Botao
          variante="secundario"
          className="mt-2"
          onClick={async () => {
            await evento.prompt();
            await evento.userChoice;
            setEvento(null);
          }}
        >
          Adicionar à tela inicial
        </Botao>
      ) : mostrarPassos ? (
        <p className="mt-2 text-[13px] text-ink-muted">
          No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em{" "}
          <strong>Adicionar à Tela de Início</strong>.
        </p>
      ) : (
        <Botao variante="secundario" className="mt-2" onClick={() => setMostrarPassos(true)}>
          Como adicionar
        </Botao>
      )}
    </div>
  );
}
