import { Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { FormServico } from "../form-servico";

export default async function NovoServico() {
  const { supabase } = await exigirOwner();
  const [{ data: equipe }, { data: usadas }] = await Promise.all([
    supabase.from("profissionais").select("id, nome, ativo").order("nome"),
    supabase.from("servicos").select("categoria").not("categoria", "is", null),
  ]);
  return (
    <>
      <Titulo eyebrow="Serviços" sub="A foto você envia depois de salvar.">
        Novo serviço
      </Titulo>
      <FormServico servico={null} equipe={equipe ?? []} quemFaz={[]} categorias={(usadas ?? []).map((u) => u.categoria as string)} />
    </>
  );
}
