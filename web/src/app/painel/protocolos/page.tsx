import type { Metadata } from "next";
import { Caixa, Titulo, Vazio } from "@/components/ui";
import { exigirProfissional } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/erros";
import { FormProtocolo } from "./form";

export const metadata: Metadata = { title: "Protocolos" };

interface MeuProtocolo {
  servico_id: string;
  servico_nome: string;
  protocolo: string | null;
}

// Cada profissional escreve os cuidados pós-atendimento dos serviços que ela
// atende. O texto sai sozinho pelo WhatsApp 10 minutos depois do fim do
// atendimento (Edge Function enviar-protocolos). A RPC meus_protocolos só
// devolve os serviços dela; salvar_protocolo recusa qualquer outro.
export default async function PaginaProtocolos() {
  const { supabase } = await exigirProfissional();
  const { data, error } = await supabase.rpc("meus_protocolos");
  const lista = (data ?? []) as MeuProtocolo[];

  return (
    <div className="space-y-5">
      <Titulo sub="Enviado automaticamente pelo WhatsApp 10 minutos depois do fim do atendimento. Deixe em branco pra não enviar nada.">
        Protocolos pós-atendimento
      </Titulo>
      {error ? (
        <Caixa tipo="erro">{mensagemDeErro(error)}</Caixa>
      ) : lista.length === 0 ? (
        <Vazio>Você ainda não tem serviços vinculados. A Gisele vincula em Equipe → sua ficha.</Vazio>
      ) : (
        <ul className="space-y-4">
          {lista.map((p) => (
            <li key={p.servico_id} className="rounded-card border border-line bg-surface p-4">
              <FormProtocolo servicoId={p.servico_id} servicoNome={p.servico_nome} protocolo={p.protocolo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
