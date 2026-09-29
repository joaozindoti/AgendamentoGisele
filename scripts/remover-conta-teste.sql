-- Remove a conta de teste do João e tudo que foi criado pra teste com nome
-- começando com "TESTE" (profissionais e clientes). Não toca em mais nada.
-- Rodar ANTES do lançamento pra Gisele. Pode rodar de novo sem erro.
begin;

create temp table _prof_teste on commit drop as
  select id from profissionais where nome ilike 'TESTE%' or telefone = '+5599984994873';
create temp table _cli_teste on commit drop as
  select id from clientes where nome ilike 'TESTE%';

-- agendamentos não apagam em cascata junto com profissional/cliente
delete from agendamentos
where profissional_id in (select id from _prof_teste) or cliente_id in (select id from _cli_teste);

delete from clientes where id in (select id from _cli_teste);
delete from profissionais where id in (select id from _prof_teste); -- grade, folgas e serviços vão junto

commit;

-- tem que dar 0 | 0
select (select count(*) from profissionais where nome ilike 'TESTE%' or telefone = '+5599984994873') as profissionais_teste,
       (select count(*) from clientes where nome ilike 'TESTE%') as clientes_teste;
