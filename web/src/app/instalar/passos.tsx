"use client";

import { useEffect, useState } from "react";
import { usePlataforma } from "@/components/pwa";
import { Botao, LinkBotao } from "@/components/ui";

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PassosInstalar() {
  const { standalone, ios, android } = usePlataforma();
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

  if (standalone || instalado) {
    return (
      <div className="mt-8 space-y-4">
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-[15px]">Pronto! O app já está instalado neste celular.</p>
        <LinkBotao href="/cliente" largo>
          Abrir o app
        </LinkBotao>
      </div>
    );
  }

  const Android = (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">No Android</h2>
      {evento ? (
        <Botao
          largo
          onClick={async () => {
            await evento.prompt();
            await evento.userChoice;
            setEvento(null);
          }}
        >
          Instalar o app
        </Botao>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-[15px]">
          <li>
            Abra este link no <strong>Chrome</strong>. Se abriu dentro do WhatsApp ou do Instagram, toque em <strong>⋮</strong> e
            escolha <strong>Abrir no Chrome</strong>.
          </li>
          <li>
            Se aparecer o aviso <strong>Adicionar à tela inicial</strong> embaixo, toque nele.
          </li>
          <li>
            Se não aparecer: toque em <strong>⋮</strong> (canto de cima) e depois em <strong>Instalar app</strong> ou{" "}
            <strong>Adicionar à tela inicial</strong>.
          </li>
        </ol>
      )}
    </section>
  );

  const Iphone = (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">No iPhone</h2>
      <p className="text-[14px] text-ink-muted">O iPhone não mostra aviso automático: são três toques no Safari.</p>
      <ol className="list-decimal space-y-2 pl-5 text-[15px]">
        <li>
          Abra este link no <strong>Safari</strong>. Se abriu dentro do WhatsApp ou do Instagram, toque no ícone da bússola
          ou em <strong>Abrir no Safari</strong>.
        </li>
        <li>
          Toque em <strong>Compartilhar</strong> (o quadrado com a seta pra cima, na barra de baixo).
        </li>
        <li>
          Role e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.
        </li>
      </ol>
      <p className="text-[13px] text-ink-muted">
        Dica: instale antes de agendar. No iPhone, o app instalado não enxerga o que foi feito no Safari, então vai pedir seu
        nome e WhatsApp uma vez de novo.
      </p>
    </section>
  );

  return <div className="mt-8 space-y-8">{ios ? Iphone : android ? Android : <>{Android}{Iphone}</>}</div>;
}
