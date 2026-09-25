import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = { title: "Sem conexão" };

// Estática (sem sessão, sem banco): o service worker guarda esta página na
// instalação e mostra quando não há rede nem cópia da página pedida.
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Image src="/fotos/logo.webp" alt="Studio Gisele Lima" width={180} height={66} className="h-auto w-40" />
      <h1 className="mt-8 text-[22px] font-semibold">Você está sem internet</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        As páginas que você já abriu continuam disponíveis. Pra marcar ou remarcar um horário, conecte-se de novo.
      </p>
    </main>
  );
}
