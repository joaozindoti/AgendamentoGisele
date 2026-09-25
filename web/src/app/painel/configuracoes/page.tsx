import type { Metadata } from "next";
import { Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { CHAVES_CONFIG, DESCRICAO_CONFIG } from "@/lib/tipos";
import { FormConfiguracoes } from "./form";

export const metadata: Metadata = { title: "Configurações" };

export default async function Configuracoes() {
  const { supabase } = await exigirOwner();
  const { data } = await supabase.from("configuracoes").select("chave, valor").in("chave", [...CHAVES_CONFIG]);
  const valores = Object.fromEntries(
    CHAVES_CONFIG.map((c) => {
      const v = Number(data?.find((l) => l.chave === c)?.valor);
      return [c, Number.isFinite(v) ? v : DESCRICAO_CONFIG[c].padrao];
    }),
  ) as Record<(typeof CHAVES_CONFIG)[number], number>;

  return (
    <>
      <Titulo sub="Regras do app que você ajusta sem precisar de programador">Configurações</Titulo>
      <FormConfiguracoes valores={valores} />
    </>
  );
}
