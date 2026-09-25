-- Carga inicial de produção: Gisele como owner, catálogo real de serviços e
-- grade de horários. Rodar UMA vez no SQL Editor do Supabase, depois das
-- migrations (ver PENDENCIAS.md). Não é migration de schema — é dado.
--
-- Fonte dos dados:
--   serviços  -> js/services.js (preços e durações reais, com folga proposital)
--   horários  -> js/calendar.js (BUSINESS_HOURS + almoço 12:30–14:00 de ter a sáb)
--
-- Telefone da Gisele = celular pessoal que ela usa pra ENTRAR no painel.
-- Não fica no repositório (que é público): scripts/gerar-colar.mjs troca o
-- placeholder do insert abaixo pelo valor guardado em
-- supabase/colar/.segredos.json e gera supabase/colar/04-seed-producao.sql,
-- que é o arquivo colado no SQL Editor. Não é o número da instância da
-- Evolution API (5599984183784): o código de login sai daquele número, e o
-- WhatsApp não entrega mensagem de um número pra ele mesmo. A check
-- constraint de telefone recusa o placeholder, então rodar este arquivo sem
-- passar pelo gerador falha em vez de gravar lixo.

begin;

with gisele as (
  insert into profissionais (nome, telefone, papel, bio)
  values (
    'Gisele Lima',
    '<TELEFONE_PESSOAL_DA_GISELE>',
    'owner',
    'Especialista em design de sobrancelhas e estética feminina.'
  )
  returning id
),
servicos_novos as (
  insert into servicos (nome, descricao, preco, duracao_min, categoria, destaque)
  values
    ('Design personalizado', 'Design de sobrancelha sob medida para o seu formato de rosto', 30, 30, 'sobrancelha', false),
    ('Design personalizado + Henna', 'Design premium com aplicação de henna para preenchimento', 40, 60, 'sobrancelha', true),
    ('Design personalizado + Coloração', 'Design premium com coloração para realçar o olhar', 50, 60, 'sobrancelha', true),
    ('Brow Lamination', 'Técnica premium de alinhamento e fixação dos fios', 120, 60, 'sobrancelha', true),
    ('Limpeza de pele profunda', 'Limpeza facial completa para renovar a pele', 120, 90, 'facial', true),
    ('Epilação íntima', 'Depilação completa da região íntima', 60, 60, 'epilacao', false),
    ('Epilação axilas', 'Depilação completa das axilas', 30, 30, 'epilacao', false),
    ('Epilação meia perna', 'Depilação da região da meia perna', 30, 30, 'epilacao', false),
    ('Epilação perna completa', 'Depilação da perna completa', 60, 60, 'epilacao', false)
  returning id
),
vinculos as (
  insert into profissional_servicos (profissional_id, servico_id)
  select g.id, s.id from gisele g cross join servicos_novos s
  returning 1
)
-- 0=Dom ... 6=Sáb. Segunda abre só à tarde (sem almoço); terça a sábado
-- com pausa 12:30–14:00; domingo fechado.
insert into disponibilidade_profissional (profissional_id, dia_semana, hora_inicio, hora_fim)
select g.id, j.dia, j.inicio::time, j.fim::time
from gisele g
cross join (values
  (1, '14:00', '19:00'),
  (2, '09:30', '12:30'), (2, '14:00', '20:00'),
  (3, '09:30', '12:30'), (3, '14:00', '20:00'),
  (4, '09:30', '12:30'), (4, '14:00', '20:00'),
  (5, '09:30', '12:30'), (5, '14:00', '20:00'),
  (6, '09:30', '12:30'), (6, '14:00', '18:00')
) as j(dia, inicio, fim);

commit;
