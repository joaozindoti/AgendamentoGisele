-- Retrato do banco pra simulação da importação da agenda (passo 8k do
-- PENDENCIAS.md). Só lê, não muda nada. Rodar no SQL Editor, clicar na
-- única célula do resultado, copiar o valor inteiro e salvar como
-- importacao/banco.json (pasta fora do git: tem telefone de cliente).
--
-- Com ele, `node scripts/importar-agenda.mjs --simular` diz quais clientes
-- já existem, se os serviços e a profissional do mapeamento existem, e quais
-- eventos batem com um agendamento já feito no sistema novo.

select jsonb_build_object(
  'gerado_em', now(),
  'servicos', (select coalesce(jsonb_agg(s.nome order by s.nome), '[]') from servicos s),
  'profissionais', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'ativo', p.ativo) order by p.nome), '[]') from profissionais p),
  'clientes', (select coalesce(jsonb_agg(jsonb_build_object('whatsapp', c.whatsapp, 'app', c.user_id is not null)), '[]') from clientes c),
  -- confirmados que ainda não terminaram (é com eles que a importação pode
  -- bater) e o que já veio de uma importação anterior
  'agendamentos', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'profissional', p.nome,
      'inicio', lower(a.periodo),
      'fim', upper(a.periodo),
      'origem', to_jsonb(a) ->> 'origem_externa_id'
    )), '[]')
    from agendamentos a
    join profissionais p on p.id = a.profissional_id
    where (a.status = 'confirmado' and upper(a.periodo) > now())
       or to_jsonb(a) ->> 'origem_externa_id' is not null
  )
) as banco;
