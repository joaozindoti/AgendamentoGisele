# Studio Gisele Lima 2.0, arquitetura e plano de execução

Documento de referência para levar ao Claude Code. Decisões fechadas em 25/09/2026: sistema sob medida (não multi-tenant), auth por WhatsApp OTP, backend em Supabase, hospedagem em Vercel, n8n descontinuado para este sistema.

## 0. O que muda de verdade

Hoje o studio depende de um agente conversacional que interpreta texto livre no WhatsApp para decidir o que a cliente quer. Isso acaba. A partir daqui, quem decide o que fazer é a própria cliente, apertando botão num app. O WhatsApp deixa de ser a interface do sistema e vira só um canal de notificação (OTP, confirmação, lembrete). Isso elimina de uma vez a classe inteira de bug que vocês vieram enfrentando nas últimas semanas: schema desatualizado quebrando silenciosamente, comparação de telefone frágil, overlap semântico esquisito do Google Calendar. Esses bugs existiam porque a lógica vivia num canvas visual sem tipo, sem teste, sem controle de versão real. Troca por Postgres com constraint de banco e Edge Functions em TypeScript, e essa classe de problema deixa de existir estruturalmente, não por sorte.

## 1. O que morre e o que fica

**Morre (para este sistema):**
- Os workflows n8n "Agente", "Pré-cadastro", "motor de disponibilidade" (a lógica deles migra para Postgres + Edge Functions).
- Google Sheets como banco de dados ("CRM Studio Gisele Lima").
- Google Calendar como fonte de verdade de disponibilidade.
- O `precadastro.html` e o site estático atual como estão (viram rotas dentro do app novo).

**Fica:**
- VPS Hostinger com Evolution API. O WhatsApp continua sendo o canal de envio (OTP, lembretes, confirmações), só que quem decide o que mandar e quando é uma Edge Function, não mais um workflow n8n.
- O workflow "Lembretes" pode ser desligado por completo, a lógica dele migra integralmente para dentro do Supabase (seção 6).

## 2. Stack final

| Camada | Escolha |
|---|---|
| Frontend (site público + app cliente + painel admin) | Next.js (App Router), um único projeto |
| Hospedagem frontend | Vercel |
| Banco de dados | Postgres gerenciado pelo Supabase |
| Autenticação | Supabase Auth, fluxo de telefone + OTP, com Send Hook customizado |
| Storage de arquivo (fotos) | Supabase Storage |
| Lógica de backend (lembretes, notificações, disparo de WhatsApp) | Supabase Edge Functions (Deno/TypeScript) |
| Agendamento de tarefas (cron) | pg_cron dentro do próprio Postgres do Supabase, chamando as Edge Functions via `net.http_post` |
| Canal de envio de WhatsApp | Evolution API, já rodando na VPS Hostinger (mantida) |
| Estilo | Tailwind CSS, tokens do design system descrito na seção 9 |

Um projeto só, um deploy só, sem duas codebases pra manter em sincronia.

## 3. Modelo de dados

Extensões necessárias no Postgres:

```sql
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist; -- necessário para o exclusion constraint da seção 3.1
```

```sql
create type papel as enum ('owner', 'staff');

-- profissionais (a própria Gisele é uma linha aqui, com papel = owner)
create table profissionais (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) unique,
  nome text not null,
  telefone text unique, -- E.164, ex: +5599988887777 — adicionada em 25/09/2026:
                         -- sem isso o trigger de vínculo auth.users -> profissionais
                         -- (seção 4, ponto 5) não tem como casar o telefone do login
                         -- OTP com a linha certa de staff/owner.
  bio text,
  foto_url text,
  papel papel not null default 'staff',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- disponibilidade recorrente (dia da semana + janela de horário)
create table disponibilidade_profissional (
  id uuid primary key default uuid_generate_v4(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null
);

-- bloqueios pontuais: férias, folga, ajuste de um dia específico
create table bloqueios_agenda (
  id uuid primary key default uuid_generate_v4(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  periodo tstzrange not null,
  motivo text
);

-- serviços do studio
create table servicos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  descricao text,
  foto_url text,
  preco numeric(10,2), -- null = "consulte o valor", igual ao comportamento atual
  duracao_min int not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- quais profissionais fazem quais serviços, com override opcional de preço/duração
create table profissional_servicos (
  profissional_id uuid not null references profissionais(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete cascade,
  preco_override numeric(10,2),
  duracao_override_min int,
  primary key (profissional_id, servico_id)
);

-- clientes
create table clientes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) unique,
  nome text not null,
  whatsapp text not null unique, -- E.164, ex: +5599988887777
  endereco text,
  data_nascimento date,
  consentimento boolean not null default false,
  criado_em timestamptz not null default now()
);

create type status_agendamento as enum ('confirmado', 'cancelado', 'concluido', 'no_show');

-- o núcleo do sistema
create table agendamentos (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id),
  profissional_id uuid not null references profissionais(id),
  servico_id uuid not null references servicos(id),
  periodo tstzrange not null, -- [inicio, fim)
  status status_agendamento not null default 'confirmado',
  canal text not null default 'app', -- 'app' | 'painel'
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- 3.1: garantia física, no banco, de que dois agendamentos confirmados
  -- do mesmo profissional nunca se sobrepõem no tempo. Não depende de
  -- checagem na aplicação, nem de request concorrente ganhar a corrida.
  exclude using gist (profissional_id with =, periodo with &&) where (status = 'confirmado')
);

-- log de lembretes já disparados, pra nunca duplicar
create table lembretes_enviados (
  id uuid primary key default uuid_generate_v4(),
  agendamento_id uuid references agendamentos(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null, -- '24h' | '1h' | 'confirmacao' | 'cancelamento' | 'aniversario' | '28dias'
  enviado_em timestamptz not null default now(),
  unique (agendamento_id, tipo)
);

-- configurações ajustáveis pela própria Gisele, sem precisar de deploy
create table configuracoes (
  chave text primary key,
  valor jsonb not null
);
-- linha inicial: insert into configuracoes values ('horas_minimas_remarcacao', '2');
```

Isso substitui a planilha inteira e o Google Calendar. Nenhuma dessas armadilhas antigas (coluna renomeada quebrando node, all-day event com `start.date` vs `dateTime`, comparação de telefone por igualdade exata) sobrevive nesse desenho, porque o formato agora é tipado e validado na entrada, não texto livre vindo de um webhook.

## 4. Autenticação e autorização

Login unificado por telefone, tanto para cliente quanto para Gisele e a profissional. Ninguém digita senha.

Fluxo:
1. App chama `supabase.auth.signInWithOtp({ phone })`.
2. Supabase dispara o Auth Hook `send_sms` (é assim que a Supabase chama, mesmo o canal sendo WhatsApp). Essa hook é uma Edge Function nossa: recebe telefone e código, chama a Evolution API pra mandar o código como mensagem de WhatsApp.
3. Cliente digita o código, app chama `supabase.auth.verifyOtp({ phone, token })`.
4. Supabase autentica e emite o JWT de sessão.
5. No primeiro login, um trigger em `auth.users` cria automaticamente a linha correspondente em `clientes` ou vincula a linha existente (que já pode ter vindo do pré-cadastro).

Vantagem de deixar o Supabase controlar o OTP em vez de reinventar: expiração, rate limit e hashing do código já vêm prontos e testados, você só troca o canal de entrega.

RLS (Row Level Security) é o que define quem vê o quê. Padrão para as tabelas principais:

```sql
alter table clientes enable row level security;
alter table agendamentos enable row level security;

create policy "cliente_le_proprio_registro" on clientes
  for select using (user_id = auth.uid());

create policy "cliente_le_proprios_agendamentos" on agendamentos
  for select using (cliente_id in (select id from clientes where user_id = auth.uid()));

create policy "cliente_remarca_proprio_agendamento" on agendamentos
  for update using (
    cliente_id in (select id from clientes where user_id = auth.uid())
    and lower(periodo) > now() + (
      (select (valor#>>'{}')::int from configuracoes where chave = 'horas_minimas_remarcacao') * interval '1 hour'
    )
  );

create policy "staff_gerencia_proprios_agendamentos" on agendamentos
  for all using (profissional_id in (select id from profissionais where user_id = auth.uid()));

create policy "owner_acesso_total" on agendamentos
  for all using (exists (select 1 from profissionais where user_id = auth.uid() and papel = 'owner'));
```

O mesmo padrão (cliente só o próprio, staff só o seu, owner tudo) se repete nas demais tabelas. A migration completa com todas as policies é gerada na Fase 1 (seção 14), dentro do Claude Code.

Isso já resolve de saída a distinção de poder que você quer: a nova profissional entra como `papel = 'staff'`, só vê e mexe na própria agenda e nos próprios clientes. Gisele é `papel = 'owner'`, vê e mexe em tudo, incluindo cadastrar a profissional nova, os serviços, preços e fotos.

## 5. Motor de agendamento

Calcular horário livre deixa de ser um node de JavaScript solto no n8n lendo Google Calendar. Vira uma função só, chamada tanto pelo app da cliente quanto pelo painel:

Entrada: `profissional_id`, `servico_id`, `data`.
1. Pega `duracao_min` do serviço (ou do override em `profissional_servicos`).
2. Pega a janela de `disponibilidade_profissional` daquele dia da semana.
3. Subtrai os `bloqueios_agenda` que caem naquele dia.
4. Subtrai os `agendamentos` já confirmados daquele profissional naquele dia.
5. Retorna a lista de horários de início possíveis, em passos de 15 ou 30 minutos (configurável).

Ao confirmar um agendamento, o INSERT já é protegido pela exclusion constraint da seção 3.1: se duas requisições tentarem pegar o mesmo horário ao mesmo tempo, o banco recusa a segunda com um erro de constraint, não existe janela de corrida.

## 6. Substituição do n8n

Tudo isso vira Edge Function, com deploy via `supabase functions deploy`, testável localmente, com histórico no git:

- `send-whatsapp`: função utilitária, recebe `{ telefone, mensagem }`, chama a Evolution API. Todas as outras funções chamam essa.
- `enviar-lembretes`: agendada via pg_cron a cada 15 minutos. Busca agendamentos confirmados cujo início cai em ~24h ou ~1h e que ainda não têm a linha correspondente em `lembretes_enviados`. Dispara e loga.
- `enviar-aniversarios`: agendada via pg_cron, uma vez por dia. Busca clientes cujo dia e mês de nascimento é hoje.
- `lembrete-28-dias`: mesma lógica, para o lembrete pós-procedimento que estava desenhado mas nunca confirmado como aplicado.
- `notificar-agendamento`: disparada por um Database Webhook (trigger nativo do Supabase) em INSERT/UPDATE de `agendamentos`. Manda confirmação pra cliente e aviso pra profissional/Gisele.
- `avaliacao-google-maps`: agora pode voltar a ficar ligada. O bug de duplicação era causado pela semântica de sobreposição do Google Calendar e por schema desatualizado, dois problemas que não existem mais aqui.

Como pg_cron mora dentro do próprio Postgres do Supabase, você não precisa de nenhum servidor de cron externo.

## 7. App da cliente (PWA)

Rotas dentro do mesmo projeto Next.js, atrás de login:
- Login por telefone/OTP.
- Home: próximo agendamento, com botão de remarcar e cancelar (respeitando a janela mínima configurada por Gisele).
- Novo agendamento: escolher serviço, ver quais profissionais fazem aquele serviço, escolher data e horário livre (motor da seção 5).
- Histórico de agendamentos.
- Perfil: dados do pré-cadastro (nome, endereço, data de nascimento), edição.
- PWA: `manifest.json` com ícone e nome do app, service worker cacheando o shell da aplicação, prompt de "adicionar à tela inicial". Ações que exigem escrita (marcar, remarcar) exigem conexão; leitura do próximo agendamento fica disponível offline via cache.

## 8. Painel (Gisele e profissional)

Mesmo projeto, rota `/painel`, mesmo mecanismo de login, o que muda é o que a RLS deixa cada papel ver.

Owner (Gisele) tem acesso a:
- Cadastro de profissionais: nome, foto, bio, ativar/desativar.
- Cadastro de serviços: nome, descrição, foto, preço, duração, quais profissionais fazem.
- Agenda completa de todo mundo, com opção de confirmar, cancelar ou remarcar em nome da cliente.
- Lista de clientes (o CRM que hoje é a planilha).
- Métricas e relatórios (seção 10).
- Configurações (seção 3, tabela `configuracoes`): janela mínima de remarcação, textos dos templates de WhatsApp, etc.

Staff (a nova profissional) tem acesso só à própria agenda e aos próprios clientes, sem poder mexer em cadastro de serviço ou de outra profissional.

## 9. Design system

**Substituído em 25/09/2026.** A paleta estilo Apple descrita originalmente aqui foi abandonada. A identidade validada é "Lindeza Premium": rosa/blush de fundo, bordô como acento principal, dourado como acento secundário — é o que já está nos mockups aprovados em `design/referencias/` (fluxo de agenda, home da cliente, catálogo de serviços) e é essa paleta que vale a partir daqui, inclusive pro `tailwind.config.js`.

**Fonte.** Mantém a mesma lógica de stack de sistema operacional do brief original (sem depender de licenciar uma fonte proprietária pra web pública):

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

**Tokens (Tailwind):**

```js
// tailwind.config.js (trecho)
// Hex extraídos por inspeção visual dos mockups em design/referencias/ —
// ajustar se a Gisele tiver os valores exatos da marca em outro lugar.
module.exports = {
  theme: {
    extend: {
      colors: {
        base: '#FBEAEC',        // fundo blush/rosa claro
        surface: '#FFFFFF',     // cards
        ink: '#2B1A1F',         // texto principal, tom quente escuro
        accent: '#7A2E3E',      // bordô — botões primários, tab ativa, ícones ativos
        'accent-hover': '#6B2836',
        gold: '#B8934A',        // dourado — "Lindeza Premium", preços, badges (TOP, Bestseller)
        'gold-soft': '#D9BE8C',
      },
      borderRadius: {
        none: '0px',
        pill: '980px',
      },
      boxShadow: {
        none: 'none',
        overlay: '3px 5px 30px 0px rgba(0, 0, 0, 0.22)',
      },
    },
  },
};
```

**Regras (guardrails):**
- Zero radius em painel e tile de mídia. O único componente com radius é o botão pílula (`980px`).
- `accent` (bordô) é a cor de ação: botões primários, tab/estado ativo, ícone selecionado. `gold` é reservado pra preço, selo de destaque ("TOP", "Bestseller") e o rótulo "Lindeza Premium" — nunca os dois num mesmo elemento.
- Painel sem sombra pesada. A única sombra do sistema (`overlay`) é reservada pra elemento flutuante (modal, dropdown), nunca pra conteúdo.
- Navbar fixa com `backdrop-filter: saturate(1.8) blur(20px)` sobre a cor `base` com opacidade.
- Um destaque em itálico por título, no máximo, quando fizer sentido. Não é um estilo corrido.

Isso vale tanto pro site público (marketing, hoje estático) quanto pro app da cliente e o painel: um design system só, reutilizado nas três superfícies.

## 10. Métricas e relatórios (painel da Gisele)

Tudo isso é uma query agregada direta em cima de `agendamentos`, sem precisar de ferramenta de BI:
- Agendamentos por período (dia, semana, mês), por status.
- Taxa de no-show (`no_show` / total confirmado no período).
- Serviço mais agendado, profissional mais agendado.
- Receita estimada no período (soma de `preco` dos agendamentos concluídos; serviços com preço null entram como "não contabilizado", com aviso visível).
- Clientes novas vs. recorrentes no período.
- Taxa de recorrência (cliente com mais de um agendamento).

## 11. Migração dos dados atuais

Antes de desligar a planilha:
1. Exportar a aba Página1 inteira.
2. Normalizar todos os telefones pro formato E.164 nesse momento, de uma vez por todas (é a última vez que esse problema de formato inconsistente aparece, porque daqui pra frente o banco garante o formato via `check constraint` ou validação na aplicação).
3. Popular `clientes` a partir disso.
4. Se você quiser preservar histórico de agendamentos passados (hoje só existe no Google Calendar), exportar os eventos e popular `agendamentos` com `status = 'concluido'` retroativo. Se não valer o esforço, começar `agendamentos` zerado a partir do dia do lançamento, sem histórico, é uma opção legítima.

## 12. Segurança

- RLS é o ponto de maior risco real aqui: uma policy mal escrita e uma cliente lê agendamento de outra. Cada policy tem que ser testada com um usuário de teste de cada papel antes de ir pro ar.
- Rate limit no endpoint de OTP (Supabase já limita por padrão, mas confirmar o limite configurado, pra ninguém conseguir usar seu número da Evolution API como bomba de spam).
- Upload de foto (Storage): máximo 5 MB, fixo no código (não em `configuracoes`, decisão fechada em 25/09/2026). Validar tipo de arquivo pelo conteúdo real (magic bytes), nunca pela extensão nem pelo Content-Type declarado pelo cliente — ambos são falsificáveis.
- A Edge Function que fala com a Evolution API precisa de um secret compartilhado, guardado como variável de ambiente no Supabase, nunca hardcoded no código.
- Ponto único de falha real: se a VPS Hostinger com a Evolution API cair, ninguém consegue fazer login (o OTP depende dela) e nenhum lembrete sai. Vale considerar, mais pra frente, um canal de fallback (e-mail, por exemplo) só pra esse cenário de desastre. Não é bloqueante pra lançar, mas é um risco que existe e você deve saber que existe.

## 13. Infraestrutura e deploy

- Um projeto Supabase (banco, auth, storage, edge functions, cron).
- Um projeto Vercel (Next.js), com variáveis de ambiente apontando pro Supabase.
- Domínio: reaproveitar o mesmo domínio/subdomínio que já existe (`studio-gisele-lima.vercel.app` ou domínio próprio, se tiver).
- VPS Hostinger mantida rodando só a Evolution API. n8n pode ser desligado depois que todas as Edge Functions estiverem validadas em produção (não desligar antes, pra ter rollback).

## 14. Fases de execução (ordem sugerida pro Claude Code)

1. Migration completa do schema (seção 3) + RLS completa (seção 4) + buckets de Storage.
2. Configurar o Auth Hook de OTP chamando a Evolution API.
3. Edge Functions de notificação e lembrete (seção 6).
4. Script de migração dos dados da planilha (seção 11).
5. Estrutura Next.js (rotas, design system da seção 9, componentes base).
6. App da cliente (seção 7).
7. Painel admin (seção 8).
8. Métricas e relatórios (seção 10).
9. PWA (manifest, service worker, instalação) nas duas superfícies.
10. Validar tudo em paralelo com o sistema antigo rodando, depois desligar n8n e a planilha.

## 15. Riscos e gargalos antecipados

- Maior risco técnico: RLS mal configurada. Maior risco operacional: dependência única da Evolution API pra login e lembrete.
- A confirmação de agendamento antes dependia de um humano (ou de um fluxo de conversa) decidir se o horário era válido. Agora isso é uma garantia de banco (exclusion constraint), o que é estritamente mais seguro, mas significa que qualquer teste de carga ou concorrência deve validar que o erro de constraint vira uma mensagem legível pra cliente ("esse horário acabou de ser ocupado, escolha outro"), não uma tela de erro genérica.
- Decidir agora, antes da Fase 4, se vale a pena importar o histórico de agendamentos do Google Calendar ou começar zerado. Quanto mais isso for adiado, mais difícil fica reconstruir esse histórico depois.
