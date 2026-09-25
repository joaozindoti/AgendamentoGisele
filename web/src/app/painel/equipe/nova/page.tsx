import { Titulo } from "@/components/ui";
import { exigirOwner } from "@/lib/auth";
import { FormProfissional } from "../form-profissional";

export default async function NovaProfissional() {
  await exigirOwner();
  return (
    <>
      <Titulo eyebrow="Equipe" sub="Depois de salvar, você define os serviços que ela faz e os horários dela.">
        Nova profissional
      </Titulo>
      <FormProfissional profissional={null} />
    </>
  );
}
