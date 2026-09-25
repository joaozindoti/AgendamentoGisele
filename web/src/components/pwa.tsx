"use client";

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
const lerIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

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
