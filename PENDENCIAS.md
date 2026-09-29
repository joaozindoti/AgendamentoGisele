# Pendências — receita pra colocar o sistema no ar

Tudo o que falta pra levar o Studio Gisele Lima 2.0 do zero até funcionando:
banco, Edge Functions, login, app, PWA e o desligamento do sistema antigo.
É tudo "abre isso, cola isso, clica aqui", sem terminal.

**Os arquivos que você vai colar estão na pasta `supabase/colar/`**, dentro
do projeto neste computador. Os secrets já estão dentro deles: não precisa
editar nada, só abrir, copiar tudo (Ctrl+A, Ctrl+C) e colar.

> Essa pasta **não vai pro GitHub** de propósito: o repositório
> `joaozindoti/AgendamentoGisele` é público, e ela tem senhas e o celular
> pessoal da Gisele. Se ela sumir (computador novo, pasta apagada), peça ao
> Claude Code: "gera de novo a pasta supabase/colar". Os secrets só mudam se
> o arquivo `supabase/colar/.segredos.json` também tiver sumido; aí é
> preciso refazer os passos 1 e 2, e informar de novo o celular da Gisele.

Quando um passo **só dá pra fazer clicando no dashboard** (não existe
arquivo pra colar), ele está marcado assim: **[SÓ NO DASHBOARD]**.

Siga na ordem. Todas as decisões de produto já estão fechadas (lista no
fim do arquivo).

Endereços que aparecem na receita:
- Supabase: https://supabase.com/dashboard/project/pjbcgyzykvidbwdjlnvp
- Vercel: https://vercel.com
- GitHub: https://github.com/joaozindoti/AgendamentoGisele

---

## Passo 1 — Banco de dados (SQL Editor)

No Supabase, menu da esquerda → **SQL Editor** → **New query**.

Para cada arquivo abaixo, **nesta ordem**: abrir o arquivo, copiar o
conteúdo inteiro, colar no editor (apagando o que estiver lá) e clicar em
**Run**. Se o Supabase avisar que a query tem "destructive operations",
clique em **Run this query** (é esperado: os arquivos tiram permissões de
propósito).

1. `supabase/colar/01-schema-inicial.sql`
2. `supabase/colar/02-lembretes-e-notificacoes.sql`
3. `supabase/colar/03-motor-agendamento-e-painel.sql`
4. `supabase/colar/04-seed-producao.sql` — cadastra a Gisele (login pelo
   celular pessoal dela, que já vem preenchido nesse arquivo), os 9 serviços
   e a grade de horários.

**Pode colar o mesmo arquivo de novo quantas vezes precisar.** Se um arquivo
der erro ou parar no meio, o que já tinha sido criado é reaproveitado na
próxima vez, sem erro de "already exists" e sem duplicar nada. Então,
diante de qualquer erro: copie a mensagem e mande pro Claude Code; depois do
ajuste, cole **o mesmo arquivo inteiro** de novo e siga pro próximo.

Único erro com solução conhecida: se o **01** ou o **02** reclamar de
permissão em `pg_net` ou `pg_cron`, vá em **Database → Extensions**, ligue
`pg_net` e `pg_cron`, e rode de novo o arquivo que falhou.

Nada neste passo depende da tela de "Database Webhooks" do dashboard: os
avisos de agendamento e a checagem de foto são disparados por SQL (pg_net).

Pra conferir, cole e rode:

```sql
select (select count(*) from servicos) as servicos,
       (select nome from profissionais where papel = 'owner') as dona,
       (select count(*) from cron.job) as lembretes_agendados;
```

Tem que dar `9 | Gisele Lima | 3`.

## Passo 2 — Secrets das Edge Functions

No Supabase: **Edge Functions** (menu da esquerda) → **Secrets**.

Abra `supabase/colar/SECRETS.txt`. Para cada par NOME / valor da lista,
adicione um secret com exatamente esse nome e esse valor e clique em **Save**.
Os três primeiros já vêm com o valor pronto:

| Nome | Valor |
|---|---|
| `WEBHOOK_VALIDAR_FOTO_SECRET` | o que está no SECRETS.txt |
| `WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET` | o que está no SECRETS.txt |
| `CRON_SECRET` | o que está no SECRETS.txt |
| `EVOLUTION_API_INSTANCE` | `studio-gisele-lima` |
| `EVOLUTION_API_URL` | endereço da Evolution API (ver abaixo) |
| `EVOLUTION_API_KEY` | a API key da Evolution (ver abaixo) |

`SEND_SMS_HOOK_SECRET` fica pro passo 5, porque é o próprio Supabase que
gera esse valor.

**Os dois valores da Evolution API** estão na VPS da Hostinger, onde ela roda:
- `EVOLUTION_API_KEY`: no painel da Evolution API ou nas variáveis de ambiente
  dela na VPS. No n8n atual, é a credencial usada nos nós que mandam
  WhatsApp.
- `EVOLUTION_API_URL`: o endereço público da Evolution API. Foi passado
  `https://179.197.229.103.nip.io:8080`, mas 8080 é a porta **interna**. Use
  a porta que o n8n usa hoje pra falar com ela, que é a acessível de fora.
  Sem barra no final.

Confira também se a Evolution API é **v2**. As functions mandam a mensagem
no formato da v2. Se for v1, avise o Claude Code antes do passo 3 — é um
ajuste de uma linha, e depois ele gera os arquivos de novo.

## Passo 3 — As 8 Edge Functions (editor do dashboard)

No Supabase: **Edge Functions** → **Deploy a new function** → **Via Editor**.
Repita para cada uma das 8 funções abaixo:

1. No nome da função, digite **exatamente** o nome da tabela (é ele que vira o
   endereço da função; um nome diferente quebra o sistema).
2. Apague todo o código de exemplo do editor.
3. Abra o arquivo correspondente, copie o conteúdo inteiro e cole.
4. Clique em **Deploy function**.

| Nome da função | Arquivo pra colar | Verificação de JWT |
|---|---|---|
| `pre-cadastro` | `supabase/colar/functions/pre-cadastro.ts` | deixar **ligada** |
| `send-whatsapp` | `supabase/colar/functions/send-whatsapp.ts` | deixar **ligada** |
| `validar-foto` | `supabase/colar/functions/validar-foto.ts` | **desligar** |
| `enviar-otp-whatsapp` | `supabase/colar/functions/enviar-otp-whatsapp.ts` | **desligar** |
| `notificar-agendamento` | `supabase/colar/functions/notificar-agendamento.ts` | **desligar** |
| `enviar-lembretes` | `supabase/colar/functions/enviar-lembretes.ts` | **desligar** |
| `enviar-aniversarios` | `supabase/colar/functions/enviar-aniversarios.ts` | **desligar** |
| `lembrete-28-dias` | `supabase/colar/functions/lembrete-28-dias.ts` | **desligar** |
| `enviar-protocolos` | `supabase/colar/functions/enviar-protocolos.ts` | **desligar** (passo 8c) |

**[SÓ NO DASHBOARD] Desligar a verificação de JWT nas marcadas com "desligar".** Estas
funções são chamadas pelo próprio Supabase (login, banco e agendador), não por
uma pessoa logada. Cada uma tem a própria senha no código, então o bloqueio
por JWT precisa estar desligado. Para cada uma das 6: **Edge Functions** →
clicar na função → aba **Details** → desligar **"Verify JWT with legacy
secret"** (ou "Enforce JWT Verification", conforme a versão da tela) →
**Save**.

Atenção: existe um bug conhecido do Supabase em que esse botão **volta a
ligar sozinho quando a função é editada de novo**. Sempre que mexer no código
de uma dessas 6, confira o botão depois. Sintoma de que ele ligou: lembretes
param de sair, ou o código de login não chega.

## Passo 4 — Login por telefone [SÓ NO DASHBOARD]

No Supabase, menu **Authentication**:

1. **Sign In / Providers → Phone**: ligar.
   - "Enable phone signup": **ligado** (o primeiro login de cada
     profissional é um cadastro; a cliente não usa login, ver passo 8c).
   - Se pedir um provedor de SMS (Twilio etc.), deixe qualquer um sem
     preencher: quem manda o código é o WhatsApp, pelo passo 5.
   - Validade do código (OTP expiry): **300** segundos. A tela de login
     promete 5 minutos; o padrão do Supabase é 60 segundos.
   - Tamanho do código: **6**.
   - Save.
2. **Rate Limits**: conferir o limite de SMS por hora. É ele que impede
   alguém de usar o número da Evolution API pra mandar código em massa (seção
   12). Algo em torno de **30 por hora** cobre o studio com folga.

## Passo 5 — Código de login pelo WhatsApp [SÓ NO DASHBOARD]

1. **Authentication → Hooks** → **Send SMS hook** → **Enable** / **Add hook**.
2. Tipo: **HTTPS**. URL:
   `https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/enviar-otp-whatsapp`
3. O Supabase mostra um secret que começa com `v1,whsec_`. Clique em
   **Generate secret** se ele não aparecer sozinho. Copie o valor inteiro,
   com o `v1,whsec_` junto.
4. Salve o hook.
5. Volte em **Edge Functions → Secrets** e adicione:
   `SEND_SMS_HOOK_SECRET` = o valor copiado.

A partir daqui o login da equipe já funciona: pedir código com o celular da
Gisele faz a mensagem chegar no WhatsApp. (Cliente não usa código: ver passo
8c.)

## Passo 6 — Código no GitHub

A Vercel publica o app a partir do GitHub, então o código novo precisa estar
lá, na branch `main`. Hoje ele está só neste computador, na branch
`feature/2.0-supabase-nextjs`, sem commit.

- **Jeito mais simples:** pedir ao Claude Code "commita tudo, dá push na
  branch e abre o Pull Request pra main". Depois, no GitHub, abrir o Pull
  Request e clicar em **Merge pull request** → **Confirm merge**.
- **Sem o Claude Code:** pelo GitHub Desktop, "Commit to
  feature/2.0-supabase-nextjs" → "Push origin" → "Create Pull Request", e
  depois o mesmo Merge no site do GitHub.

O merge na `main` não derruba o site atual. Os arquivos do site estático
(`index.html`, `servicos.html` etc.) continuam onde estão; o app novo fica
todo dentro da pasta `web/`, e a pasta `supabase/colar/` nunca sobe.

## Passo 7 — App na Vercel (pelo site)

Crie um **projeto novo** na Vercel e **não mexa no projeto que hoje serve o
site**. Assim o site atual continua no ar enquanto você testa o novo, e voltar
atrás é só não trocar o domínio no passo 11.

1. https://vercel.com/new → **Import Git Repository** → escolher
   `AgendamentoGisele`. Se ele não aparecer, clique em "Adjust GitHub App
   Permissions" e libere o repositório.
2. Na tela **Configure Project**:
   - **Root Directory** → **Edit** → escolher a pasta **`web`** → Continue.
   - Framework Preset: **Next.js** (a Vercel detecta sozinha).
   - **Environment Variables**: adicionar as três. **São obrigatórias**: sem
     qualquer uma, o deploy falha com uma mensagem dizendo qual faltou.

     | Name | Value |
     |---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | `https://pjbcgyzykvidbwdjlnvp.supabase.co` |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ver abaixo |
     | `NEXT_PUBLIC_WHATSAPP_STUDIO` | `5599984183784` |

     A `NEXT_PUBLIC_SUPABASE_ANON_KEY` está no Supabase: **Project Settings →
     API Keys → aba "Legacy API keys" → `anon`** (um texto longo começando
     com `eyJ`). Não use a "publishable key": o formulário de pré-cadastro
     não funciona com ela.
3. **Deploy**. No fim aparece o endereço do app (algo como
   `agendamento-gisele.vercel.app`). Anote.
4. No Supabase: **Authentication → URL Configuration → Site URL** = esse
   endereço → Save.

Toda vez que algo entrar na `main` do GitHub, a Vercel publica sozinha.

## Passo 8 — Clientes da planilha

1. Na planilha "CRM Studio Gisele Lima", aba **Página1**: **Arquivo → Fazer
   download → Valores separados por vírgula (.csv)**. Não precisa editar
   nada no arquivo.
2. **SQL Editor** → colar e rodar `supabase/colar/05-preparar-planilha.sql`.
   Ele cria a tabela `planilha_importada`, vazia, já com as colunas da
   planilha (inclusive a coluna "bloqueado " com espaço no nome, que é o que
   fazia o import automático do Supabase falhar).
3. **Table Editor** → abrir a tabela **`planilha_importada`** → **Insert** →
   **Import data from CSV** → arrastar o arquivo baixado → **Import data**.
   Importe pra dentro dessa tabela; **não** use "New table".
4. **SQL Editor** → colar e rodar `supabase/colar/06-importar-planilha.sql`.
5. O resultado é uma lista. A primeira linha (**RESUMO**) diz quantas
   clientes entraram. As outras mostram cada linha da planilha que ficou de
   fora ou entrou incompleta, com o motivo:
   - linhas vazias (sem nome) e a linha **"Teste"**: ficam de fora;
   - clientes marcadas na coluna **bloqueado** da planilha: ficam de fora (o
     sistema novo não tem bloqueio). Decida caso a caso e, se quiser,
     cadastre à mão em **Painel → Clientes → + Nova**;
   - telefone inválido: fica de fora;
   - data de nascimento que não deu pra ler: entra sem data;
   - número repetido na planilha: vale a última linha.

   O 06 apaga sozinho a tabela `planilha_importada` no fim, pra não deixar a
   cópia da planilha com dado pessoal sobrando no banco.

Deu errado ou quer refazer? Repita do item 2. Rodar de novo não duplica
nada: quem já estiver cadastrada (mesmo WhatsApp) é atualizada. Se o RESUMO
disser "(planilha vazia)", o CSV não chegou a entrar na tabela no item 3.

O importador tolera os problemas comuns da planilha: número com ou sem 55,
com parênteses e traço; data em 15/03/1990 ou 1990-03-15. Todas entram com
consentimento de promoção **desligado**. Cada uma liga quando aceitar no app
ou no pré-cadastro.

## Passo 8b — Faturamento no painel da Gisele (SQL Editor)

Libera a tela **Mais → Faturamento**, que só a Gisele vê: total do studio e
total por profissional, com os atalhos Hoje, Esta semana e Este mês, ou um
período escolhido.

**SQL Editor** → **New query** → colar e rodar
`supabase/colar/08-faturamento-periodo.sql`. Esse arquivo só tem estrutura,
sem senha, e pode ser colado de novo sem problema.

Pra conferir, rode:

```sql
select count(*) from pg_proc where proname = 'faturamento_periodo';
```

Tem que dar `1`. Se a tela Faturamento abrir antes deste passo, ela mostra
um erro; depois dele, os valores aparecem.

O faturamento soma só os atendimentos marcados como **atendido**, pelo preço
do serviço (ou pelo preço próprio da profissional, se ela tiver um). Serviço
sem preço conta como R$ 0 e a tela avisa quantos são.

## Passo 8c — Cliente sem login e protocolo pós-atendimento

A partir daqui a cliente **não usa mais código de WhatsApp**: abre o app,
escolhe o horário e, só no primeiro agendamento, informa nome, WhatsApp,
nascimento e (se quiser) uma foto. Gisele e profissionais continuam entrando
por celular + código em `/entrar`, que agora é a "Área da equipe".

1. **SQL Editor** → colar e rodar `supabase/colar/09-cliente-sem-login-e-protocolo.sql`.
   Esse arquivo tem o `CRON_SECRET` dentro (do agendamento do protocolo).
   Pode colar de novo sem problema.
2. **[SÓ NO DASHBOARD]** **Authentication → Sign In / Providers** → ligar
   **"Allow anonymous sign-ins"** → Save. Sem isso, o cadastro da cliente
   mostra "Não conseguimos iniciar seu cadastro agora".
3. **[SÓ NO DASHBOARD]** **Authentication → Rate Limits** → conferir
   **"Anonymous sign-ins"**: o padrão é 30 por hora por IP. Cada cliente
   gasta um só no primeiro cadastro em cada aparelho, então 30 sobra.
4. **Edge Functions → Deploy a new function → Via Editor**, nome
   `enviar-protocolos`, colar `supabase/colar/functions/enviar-protocolos.ts`,
   **Deploy**. Depois, em **Details**, **desligar** a verificação de JWT (igual
   às outras 6 do passo 3).
5. Conferir no SQL Editor:

   ```sql
   select (select count(*) from cron.job) as jobs,
          (select count(*) from pg_proc where proname = 'cadastrar_cliente') as cadastro;
   ```

   Tem que dar `4 | 1`.

Cada profissional escreve os protocolos em **Mais → Protocolos
pós-atendimento** (só dos serviços que ela atende). Em branco = não envia.

## Passo 8d — Lembrete de 28 dias só da Gisele

1. **SQL Editor** → colar e rodar `supabase/colar/10-aviso-troca-aparelho-e-28-dias.sql`.
2. Em seguida, colar e rodar `supabase/colar/11-remove-aviso-troca-aparelho.sql`.

O 10 restringe o lembrete de manutenção de 28 dias aos atendimentos da
Gisele e cria um aviso de "cadastro aberto em novo aparelho"; o 11 tira esse
aviso (decisão de 30/09/2026: sem mensagem nessa situação). A troca de
aparelho continua registrada, só não manda WhatsApp. Os dois podem ser
colados de novo sem problema. Se o 10 já tinha sido colado antes, basta
o 11.

A `notificar-agendamento` **não precisa** ser publicada de novo. Se ela já
tinha sido atualizada pelo passo 8d antigo, pode ficar como está: sem o
trigger, a parte do aviso nunca é chamada.

## Passo 9 — Primeiro acesso da Gisele e montagem da equipe

1. No celular da Gisele, abrir `<endereço do passo 7>/entrar`, digitar o
   celular pessoal dela e o código que chegar no WhatsApp. Ela cai direto no
   painel.
2. **Equipe → + Nova**: cadastrar a profissional nova com o celular dela e o
   acesso "Profissional". Na ficha dela, marcar os serviços que ela faz e
   montar a grade de horários.
3. **Serviços**: conferir preços e durações e enviar as fotos.
4. **Mais → Configurações**: conferir a antecedência mínima pra remarcar
   (2h), a grade (30 min), os dias à frente (60) e o lembrete de manutenção
   (28 dias).
5. Instalar o painel como app no celular: **Mais → Adicionar à tela
   inicial**. No iPhone: Safari → Compartilhar → Adicionar à Tela de Início.

## Passo 10 — Testar tudo com o sistema antigo ainda ligado

Não desligue nada do sistema antigo antes de marcar a lista toda. O n8n fica
de reserva até o novo estar comprovado (seção 13).

- [ ] Cliente nova, sem login: abrir `<endereço>/cliente/agendar` numa aba
      anônima, escolher serviço e horário, preencher o cadastro, conferir o
      número na tela de confirmação. O agendamento é feito e a confirmação
      chega no WhatsApp. Nenhum código é pedido.
- [ ] Fechar e reabrir o navegador: continua cadastrada (não pede os dados
      de novo). Em outro navegador, cadastrar com o **mesmo** número: o
      cadastro e os agendamentos vão pro aparelho novo, e o primeiro perde
      o acesso. Nenhuma mensagem é enviada por causa da troca.
- [ ] Foto no cadastro: aparece na agenda do painel, ao lado do nome.
- [ ] Protocolo: escrever um em **Mais → Protocolos**, marcar pelo painel um
      atendimento de 10 minutos que já terminou há uns 15, e esperar até 5
      minutos: o texto chega no WhatsApp da cliente uma vez só.
- [ ] `/entrar` com um celular que não é da equipe: não mostra o painel.
- [ ] Agendar pelo app → a confirmação chega pra cliente **e** pra
      profissional.
- [ ] Remarcar pelo app → chega "Horário remarcado" pras duas.
- [ ] Cancelar pelo app → chega o aviso de cancelamento.
- [ ] Tentar remarcar ou cancelar a menos de 2h do horário → o app bloqueia e
      mostra o botão "Falar com o studio".
- [ ] Duas pessoas no mesmo horário ao mesmo tempo → a segunda vê "Esse
      horário acabou de ser ocupado", e não uma tela de erro (seção 15).
- [ ] Lembretes sem esperar o relógio: criar pelo painel um agendamento pra
      daqui a ~24h, e no **SQL Editor** colar e rodar
      `supabase/colar/07-disparar-lembretes-agora.sql`. A mensagem de
      lembrete chega. O detalhe de cada envio fica em **Edge Functions →
      enviar-lembretes → Logs**. O mesmo arquivo dispara também o de
      aniversário (teste com uma cliente que faça aniversário hoje) e o de
      manutenção de 28 dias.
- [ ] Upload de foto no painel → aparece. Um arquivo que não é imagem,
      renomeado pra `.jpg` → some do Storage em alguns segundos.
- [ ] Pré-cadastro em `<endereço>/pre-cadastro` → a cliente aparece em
      **Painel → Clientes**.
- [ ] Profissional (staff) logada: vê só a própria agenda e as próprias
      clientes; não vê Equipe, Serviços nem Métricas.
- [ ] Métricas batem com a agenda de uma semana conhecida.
- [ ] **Mais → Faturamento** (Gisele): o total e o valor de cada profissional
      batem com os atendimentos marcados como atendido. Logada como a
      profissional, a opção Faturamento não aparece, e abrir
      `<endereço>/painel/faturamento` volta pra agenda.
- [ ] Instalar o app da cliente no celular, abrir o próximo agendamento,
      ligar o modo avião e reabrir: o agendamento continua aparecendo.
- [ ] Painel: "Sair" e reabrir sem internet não mostra mais os dados.
      (A cliente não tem botão Sair: a sessão dela é o próprio cadastro no
      aparelho.)

## Passo 11 — Virada (quando a lista acima estiver toda marcada)

1. Na Vercel, **projeto antigo** → Settings → Domains → remover o domínio
   (`studio-gisele-lima.vercel.app` ou o domínio próprio). No **projeto
   novo** → Settings → Domains → adicionar esse domínio. Os links antigos
   (`/servicos.html`, `/precadastro.html`, `/horario.html`, `/index.html`)
   já redirecionam pras páginas novas.
2. Atualizar o link da bio do Instagram e do Google Meu Negócio, se apontarem
   pra alguma página específica.
3. Supabase → **Authentication → URL Configuration → Site URL**: o domínio
   final.

## Passo 12 — Desligar o sistema antigo (depois de alguns dias estável)

No n8n da VPS, **desativar** os workflows. Não apague ainda: eles são a
reserva.
- "Agente"
- "Pré-cadastro"
- "motor de disponibilidade" (endpoint `/webhook/disponibilidade`)
- "Lembretes"

A Evolution API na VPS **continua ligada**: é por ela que sai todo WhatsApp
do sistema novo (código de login, confirmações e lembretes).

A planilha "CRM Studio Gisele Lima" pode ser arquivada (só leitura) depois
do passo 8 e da virada.

---

## Decisões fechadas (25/09/2026)

- **Telefone da Gisele pro login:** o celular pessoal dela, fora do
  repositório (que é público). Fica em `supabase/colar/.segredos.json` e já
  sai preenchido no arquivo 04 do passo 1.
- **Botão "Falar com o studio":** `5599984183784`, o mesmo do site atual,
  declarado explicitamente em `NEXT_PUBLIC_WHATSAPP_STUDIO` (passo 7). Não há
  mais valor padrão no código: sem a variável, o build falha.
- **Radius (seção 9):** card 16px, campo 12px, botão pílula 980px, como nos
  mockups. Tokens `--radius-card`, `--radius-input` e `--radius-pill` em
  `web/src/app/globals.css`, usados como `rounded-card`, `rounded-input` e
  `rounded-pill`.
- **Consentimento das clientes migradas da planilha:** desligado (passo 8).
- **Histórico do Google Calendar:** não será importado. Os agendamentos
  começam zerados na virada, e as métricas contam a partir dela.

---

## Registro: o que mudou no código além do que o documento previa

Informativo, não pede ação. Está aqui pra você saber o que revisar.

**Bugs corrigidos nas migrations e functions da Fase 1** (achados ao
escrever o app e confirmados nos testes automáticos):
- `for insert, update, delete` numa policy é sintaxe inválida no Postgres:
  a primeira migration nem rodaria. Viraram `for all`.
- A policy do owner em `profissionais` consultava a própria `profissionais`,
  e `clientes` ↔ `agendamentos` se consultavam mutuamente. Toda consulta de
  usuário logado daria "infinite recursion detected in policy". Agora as
  checagens de papel passam por funções `security definer` (`eh_owner()`,
  `meu_profissional_id()`, `meu_cliente_id()`).
- A leitura pública de `profissionais` expunha a coluna `telefone` pra
  qualquer anônimo. A coluna saiu da leitura de anon/authenticated; o owner
  lê pela função `profissionais_admin()`.
- `[auth.sms] enable_signup = false` no `config.toml` impediria o primeiro
  login de qualquer cliente.
- `validar-foto` lia o payload do Database Webhook na raiz em vez de em
  `record`, então a validação de magic bytes nunca rodava.
- `pre-cadastro` fazia upsert por WhatsApp: qualquer pessoa sobrescrevia o
  cadastro de outra só sabendo o número. Agora só insere. Também ganhou CORS
  (sem isso, o navegador bloqueava a chamada do formulário).
- Os triggers `on_foto_uploaded` e `on_agendamento_notificar` usavam
  `supabase_functions.http_request`, que só existe em projeto onde os
  "Database Webhooks" foram ativados pela tela do dashboard. O arquivo 01
  falhava com "schema supabase_functions does not exist". Agora os dois
  chamam a função `dispara_webhook()`, que faz o POST direto por `pg_net`,
  com o mesmo corpo de antes (`{type, table, schema, record, old_record}`).
- As migrations e o seed quebravam com "already exists" quando eram colados
  de novo depois de uma execução que parou no meio. Agora são idempotentes:
  tabela e índice com `if not exists`, function com `or replace`, trigger e
  policy com `drop ... if exists` antes de criar, e inserts que pulam o que
  já existe.
- `notificar-agendamento` passava o horário no formato do Postgres
  (`2026-09-26 13:00:00+00`, que não é ISO) direto pro `new Date()`.

**Regras novas no banco** (migration `20260925170000`):
- Motor de agendamento (seção 5) como funções SQL: `horarios_disponiveis`,
  `dias_disponiveis` e `profissionais_do_servico`.
- Trigger `valida_agendamento`: o horário marcado pela cliente precisa ser um
  que o motor ofereceria (sem isso, dava pra marcar às 3h da manhã pela API).
  Staff e owner podem encaixar fora da grade; sobreposição continua
  impossível pra todo mundo (exclusion constraint).
- A cliente agora pode cancelar o próprio agendamento, só de confirmado pra
  cancelado e com a mesma janela mínima da remarcação. O trigger original
  bloqueava qualquer mudança de status, e a seção 7 pede o botão.
- Remarcar rearma os lembretes de 24h e 1h, e `notificar-agendamento` também
  avisa a remarcação.
- Colunas novas (opcionais) em `servicos`: `categoria` e `destaque`, pro
  filtro por categoria e o selo premium, como no site atual e nos mockups.
- Configurações novas no painel: `passo_minutos` (30) e
  `dias_maximos_agendamento` (60).
- Trocar o WhatsApp de uma cliente no painel faz o login passar pro número
  novo. Antes, entrar com o número novo falharia por duplicidade.

---

## Riscos da cliente sem login (revisar antes do passo 8c)

Decisão de 29/09/2026: zero fricção pra cliente, número de WhatsApp sem
verificação. O que isso abre, e o que já está coberto:

- **Quem digita o número de outra pessoa assume o cadastro dela.** A pessoa
  passa a ver nome, nascimento, endereço (se veio da planilha) e os
  agendamentos da dona do número, e pode remarcar ou cancelar. Isso é
  consequência direta de "trocar de aparelho não pede código", e o iPhone
  torna esse caso comum: o app instalado não compartilha dados com o Safari
  nem com o navegador de dentro do WhatsApp. Coberto em parte: cancelamento
  e remarcação avisam a dona do número pelo WhatsApp; no máximo 3 trocas de
  aparelho por número a cada 24h; cada troca fica registrada em
  `clientes_trocas_aparelho` (só a Gisele lê); quem assume não sobrescreve
  nome e nascimento. **Não coberto, por decisão (30/09/2026):** a dona
  do número não recebe aviso quando o cadastro muda de aparelho.
- **Qualquer pessoa vira "cliente" sem provar nada.** Coberto: teto de 3
  agendamentos futuros por cliente pelo app (Mais → Configurações), limite
  de sessões anônimas por IP (passo 8c.3), e todas as regras de RLS de
  cliente continuam valendo (testado). Não coberto: alguém com muitos
  números/IPs ainda consegue ocupar horários. Se acontecer, ligar CAPTCHA
  (Authentication → Attack Protection, Cloudflare Turnstile), que exige um
  ajuste pequeno no app.
- **O WhatsApp do studio manda confirmação pra número digitado por
  qualquer um.** Um número digitado errado recebe a confirmação e os
  lembretes de outra pessoa (por isso a tela de conferência do número). Uso
  malicioso em volume pode fazer o WhatsApp restringir o número do studio.
  O teto por cliente e o limite por IP reduzem isso.
- **O login por código continua aberto a qualquer celular** (a
  configuração "Enable phone signup" precisa ficar ligada pra profissional
  nova conseguir entrar). Qualquer pessoa pode pedir código em `/entrar` e
  fazer o studio mandar WhatsApp pra um número; o limite de SMS por hora
  (passo 4) segura. O hook `enviar-otp-whatsapp` não foi alterado. Se quiser
  fechar de vez, dá pra fazer o hook só enviar pra telefones cadastrados em
  Equipe.
- **Foto da cliente:** só na pasta dela no bucket, no máximo 3 arquivos,
  URL gravada só se for dessa pasta, e o `validar-foto` confere o conteúdo
  como nas outras fotos.

---

## Apêndice — só pra quem for mexer no código

Nada disto é necessário pra colocar o sistema no ar.

- **De onde vem `supabase/colar/`:** `node scripts/gerar-colar.mjs` monta a
  pasta a partir de `supabase/migrations/`, `supabase/seed-producao.sql`,
  `scripts/preparar-planilha.sql`, `scripts/importar-planilha.sql` e `supabase/functions/`. As functions saem
  em arquivo único porque o editor do dashboard cria uma função por vez, sem
  a pasta `_shared`. Ao mudar qualquer original, rode o gerador de novo e cole
  o arquivo novo. Os secrets ficam em `supabase/colar/.segredos.json` e são
  reaproveitados.
- **Testes do banco** (126 testes num Postgres local, sem Docker: RLS papel
  por papel, motor de agendamento, os próprios arquivos de `supabase/colar/`
  incluindo o importador da planilha, e o cenário de colar de novo um arquivo
  que parou no meio):
  `cd supabase/tests && npm install && npm test`.
- **Rodar o app local:** `cd web && cp .env.example .env.local`, preencher a
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e `npm install && npm run dev`.
- **Se um dia usar a CLI do Supabase:** as migrations aplicadas pelo SQL
  Editor não ficam registradas no histórico da CLI. Antes do primeiro
  `supabase db push`, rode `supabase migration repair --status applied`
  para as sete (`20260925153806`, `20260925160000`, `20260925170000`,
  `20260929120000`, `20260929150000`, `20260930120000`,
  `20260930150000`); senão
  a CLI tenta aplicar de novo. O `config.toml` já descreve a verificação de
  JWT de cada função e o hook de SMS.
- **Importar a planilha por terminal** (alternativa ao passo 8):
  `node scripts/migrar-planilha.mjs <arquivo.csv>` gera um SQL em
  `supabase/dados-migrados/` (fora do git).
