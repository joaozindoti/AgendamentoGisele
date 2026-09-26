-- Prepara a tabela que recebe o CSV da planilha "CRM Studio Gisele Lima"
-- (aba Página1) antes do import pelo Table Editor.
--
-- Por que criar antes em vez de deixar o "New table → Import data from CSV"
-- criar: a planilha tem uma coluna chamada "bloqueado " (com espaço no fim).
-- O import automático cria a coluna sem o espaço e depois tenta inserir com
-- o espaço, e falha com "column "bloqueado " does not exist". Aqui as colunas
-- têm exatamente os nomes do cabeçalho do CSV, espaço incluído, e tudo como
-- texto (quem interpreta telefone e data é o arquivo seguinte).
--
-- Pode rodar de novo: apaga e recria a tabela vazia.

drop table if exists public.planilha_importada;

create table public.planilha_importada (
  "Nome" text,
  "WhatsApp" text,
  "Endereço" text,
  "Data de Nascimento" text,
  "Data de Cadastro" text,
  "Avaliação Enviada" text,
  "bloqueado " text
);

-- dado pessoal de cliente em tabela do schema public: sem policy nenhuma,
-- ninguém de fora (anon/authenticated) lê. Só o SQL Editor enxerga.
alter table public.planilha_importada enable row level security;
