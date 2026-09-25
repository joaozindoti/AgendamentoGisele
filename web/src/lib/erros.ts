// O banco devolve códigos curtos (raise exception 'horario_indisponivel' nas
// migrations) ou SQLSTATE padrão. Aqui vira texto legível — seção 15: erro
// de constraint não pode virar tela de erro genérica.
type ErroSupabase = { code?: string; message?: string } | null | undefined;

const MENSAGENS: Record<string, string> = {
  horario_indisponivel: "Esse horário não está mais disponível. Escolha outro, por favor.",
  fora_da_janela_de_remarcacao:
    "Esse agendamento já está perto demais do horário pra remarcar ou cancelar pelo app. Fale com o studio pelo WhatsApp.",
  servico_nao_oferecido: "Essa profissional não faz esse serviço.",
  duracao_invalida: "A duração não confere com o serviço escolhido.",
  periodo_invalido: "Horário inválido.",
  cliente_nao_encontrada: "Não encontramos seu cadastro. Saia e entre de novo, por favor.",
  agendamento_nao_encontrado: "Agendamento não encontrado.",
  whatsapp_invalido: "WhatsApp inválido. Confira o DDD e o número.",
  nome_invalido: "Informe o nome.",
  apenas_owner: "Só a Gisele tem acesso a isso.",
  apenas_profissionais: "Só a equipe do studio tem acesso a isso.",
};

export function mensagemDeErro(erro: ErroSupabase, padrao = "Não foi possível concluir agora. Tente de novo em instantes.") {
  if (!erro) return padrao;
  // 23P01 = exclusion_violation: duas pessoas tentaram o mesmo horário ao
  // mesmo tempo e a exclusion constraint da seção 3.1 recusou a segunda.
  if (erro.code === "23P01") return "Esse horário acabou de ser ocupado. Escolha outro, por favor.";
  if (erro.code === "23505") return "Já existe um cadastro com esses dados.";
  if (erro.code === "23514") return "Algum dado está em formato inválido.";
  if (erro.code === "42501") return "Você não tem permissão pra fazer isso.";

  const texto = erro.message ?? "";
  for (const [codigo, mensagem] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return mensagem;
  }
  if (texto.includes("cliente só pode")) return "Essa alteração só pode ser feita pelo studio.";
  if (texto.includes("apenas o owner")) return MENSAGENS.apenas_owner;
  return padrao;
}
