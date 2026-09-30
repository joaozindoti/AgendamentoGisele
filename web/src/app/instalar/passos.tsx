"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePlataforma } from "@/components/pwa";
import { Botao, LinkBotao } from "@/components/ui";

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const nadaAssinar = () => () => {};

// Botão grande de instalar no topo, benefícios no meio, passo a passo embaixo.
// Quando o Chrome oferece a instalação (beforeinstallprompt), o botão instala
// direto e o passo a passo do Android some; no iPhone (e no Android sem o
// evento) o botão desce até os passos, que são o único caminho.
export function PassosInstalar({ beneficios }: { beneficios: ReactNode }) {
  const { standalone, ios, android } = usePlataforma();
  // usePlataforma assume "instalado" no servidor; até hidratar, mostra a
  // página de instalar em vez de piscar "Pronto!" pra quem ainda não instalou
  const montado = useSyncExternalStore(nadaAssinar, () => true, () => false);
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacao);
    };
    const aoInstalar = () => setInstalado(true);
    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (montado && (standalone || instalado)) {
    return (
      <div className="mt-8 space-y-4 rounded-card bg-surface p-5 text-center shadow-soft">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ok">Tudo certo</p>
        <p className="font-display text-[20px] leading-snug font-bold tracking-[-0.02em]">O app já está neste celular.</p>
        <LinkBotao href="/cliente" largo className="min-h-14 text-[17px]">
          Abrir o app
        </LinkBotao>
      </div>
    );
  }

  const nota = ios
    ? "No iPhone são três toques no Safari. Veja abaixo."
    : evento
      ? "Grátis e sem loja de apps. Um toque e pronto."
      : "Grátis e sem loja de apps. Veja abaixo como fazer.";

  const botao = evento ? (
    <Botao
      largo
      className="min-h-14 text-[17px]"
      onClick={async () => {
        await evento.prompt();
        await evento.userChoice;
        setEvento(null);
      }}
    >
      Instalar o app
    </Botao>
  ) : (
    <LinkBotao href="#como-instalar" largo className="min-h-14 text-[17px]">
      Instalar o app
    </LinkBotao>
  );

  const passosAndroid = [
    <>
      Abra este link no <strong>Chrome</strong>. Se abriu dentro do WhatsApp ou do Instagram, toque em <strong>⋮</strong> e
      escolha <strong>Abrir no Chrome</strong>.
    </>,
    <>
      Se aparecer o aviso <strong>Adicionar à tela inicial</strong> embaixo, toque nele.
    </>,
    <>
      Se não aparecer: toque em <strong>⋮</strong> (canto de cima) e depois em <strong>Instalar app</strong> ou{" "}
      <strong>Adicionar à tela inicial</strong>.
    </>,
  ];

  const passosIphone = [
    <>
      Abra este link no <strong>Safari</strong>. Se abriu dentro do WhatsApp ou do Instagram, toque no ícone da bússola ou
      em <strong>Abrir no Safari</strong>.
    </>,
    <>
      Toque em <strong>Compartilhar</strong> (o quadrado com a seta pra cima, na barra de baixo).
    </>,
    <>
      Role e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.
    </>,
  ];

  const mostrarAndroid = !evento && (android || !ios);
  const mostrarIphone = ios || !android;

  return (
    <>
      <div className="mt-8 rounded-card bg-surface p-5 text-center shadow-soft">
        {botao}
        <p className="mt-3 text-[13px] text-ink-muted">{nota}</p>
      </div>

      <div className="mt-8">{beneficios}</div>

      {(mostrarAndroid || mostrarIphone) && (
        <section id="como-instalar" className="mt-10 scroll-mt-6 space-y-8">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold-ink">Passo a passo</p>
            <h2 className="mt-1.5 text-[24px] leading-tight font-extrabold tracking-[-0.03em]">Como instalar</h2>
          </div>
          {mostrarAndroid && <ListaPassos titulo="No Android" passos={passosAndroid} />}
          {mostrarIphone && (
            <ListaPassos
              titulo="No iPhone"
              passos={passosIphone}
              rodape="Dica: instale antes de agendar. No iPhone, o app instalado não enxerga o que foi feito no Safari, então vai pedir seu nome e WhatsApp uma vez de novo."
            />
          )}
        </section>
      )}
    </>
  );
}

function ListaPassos({ titulo, passos, rodape }: { titulo: string; passos: ReactNode[]; rodape?: string }) {
  return (
    <div>
      <h3 className="mb-3 text-[17px] font-bold">{titulo}</h3>
      <ol className="space-y-3">
        {passos.map((p, i) => (
          <li key={i} className="flex items-start gap-4 rounded-card bg-surface p-4 shadow-soft">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blush font-display text-[15px] font-extrabold text-accent">
              {i + 1}
            </span>
            <p className="pt-1 text-[15px] leading-snug">{p}</p>
          </li>
        ))}
      </ol>
      {rodape && <p className="mt-3 text-[13px] text-ink-muted">{rodape}</p>}
    </div>
  );
}
