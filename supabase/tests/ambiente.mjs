// Sobe um Postgres de verdade (PGlite, em WASM — sem Docker) com o mínimo
// do ambiente Supabase que as migrations usam: roles anon/authenticated/
// service_role, auth.users + auth.uid(), storage, pg_cron e pg_net.
// Depois aplica as migrations reais de supabase/migrations
// e o seed de produção, na ordem.
//
// Os stubs imitam o comportamento que importa pra RLS: auth.uid() lê o
// "sub" do JWT da sessão, e anon/authenticated recebem os GRANTs padrão
// que o Supabase dá em tabelas novas do schema public.

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Telefone fictício: o real fica fora do repositório (supabase/colar/.segredos.json).
export const TELEFONE_GISELE = "+5599911110000";

const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  phone text unique,
  raw_user_meta_data jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- pg_cron / pg_net
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
-- como no pg_cron real: agendar um nome que já existe atualiza o job
create function cron.schedule(nome text, quando text, comando text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (nome, quando, comando)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
-- pg_net: guarda cada POST (URL, headers, corpo) pra os testes conferirem.
-- Mesma assinatura da extensão real (os parâmetros são passados por nome).
create schema net;
create table public.webhooks_disparados (id serial, url text, headers jsonb, corpo jsonb, em timestamptz default now());
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000
) returns bigint language plpgsql as $$
begin
  insert into public.webhooks_disparados (url, headers, corpo) values (url, headers, body);
  return 1;
end $$;
`;

function migrations() {
  const pasta = join(RAIZ, "migrations");
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      nome: f,
      // pg_cron/pg_net não existem no PGlite; os stubs acima fazem o papel deles
      sql: readFileSync(join(pasta, f), "utf8").replace(/create extension if not exists pg_(cron|net)[^;]*;/g, ""),
    }));
}

/** Postgres com os stubs do Supabase, sem nenhuma migration aplicada. */
export async function criarBancoVazio() {
  const db = new PGlite({ extensions: { btree_gist, uuid_ossp } });
  await db.exec(STUBS);
  return db;
}

export async function criarBanco() {
  const db = await criarBancoVazio();
  for (const m of migrations()) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`migration ${m.nome} falhou: ${e.message}`);
    }
  }
  const seed = readFileSync(join(RAIZ, "seed-producao.sql"), "utf8").replaceAll("<TELEFONE_PESSOAL_DA_GISELE>", TELEFONE_GISELE);
  await db.exec(seed);
  return db;
}

/** Roda SQL como um papel do app: anon, authenticated (com o sub do JWT) ou service_role. */
export function como(db, papel, sub = null) {
  const executar = async (sql, params = []) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${papel}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? ""]);
      return (await tx.query(sql, params)).rows;
    });
  return executar;
}

/** Simula o primeiro login OTP: o Supabase Auth insere em auth.users. */
export async function criarLogin(db, telefoneE164) {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, phone) values ($1, $2)`, [id, telefoneE164.replace("+", "")]);
  return id;
}

/** Próxima data (YYYY-MM-DD, fuso do studio) com o dia da semana pedido, a pelo menos `minDias` de hoje. */
export function proximoDia(diaSemana, minDias = 3) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let d = minDias; d < minDias + 14; d++) {
    const chave = fmt.format(new Date(Date.now() + d * 86400_000));
    if (new Date(`${chave}T12:00:00Z`).getUTCDay() === diaSemana) return chave;
  }
  throw new Error("sem data");
}

export const instante = (dia, hm) => new Date(`${dia}T${hm}:00-03:00`).toISOString();
