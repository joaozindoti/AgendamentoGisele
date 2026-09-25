// Fase 1 — validação real de magic bytes para upload de fotos.
// Disparada pelo trigger `on_foto_uploaded` (ver migration 20260925153806)
// logo após um INSERT em storage.objects no bucket 'fotos'. Não confia no
// Content-Type declarado pelo cliente (isso já é filtrado, mas é
// falsificável): lê os primeiros bytes do arquivo de verdade e apaga do
// bucket qualquer objeto cujo conteúdo real não seja JPEG, PNG ou WEBP.
//
// Segredos (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) vêm das variáveis de
// ambiente padrão que o runtime de Edge Functions já injeta — nunca
// hardcoded aqui (seção 12 do documento de arquitetura).
//
// Roda com a verificação de JWT desligada: quem chama é o
// Database Webhook do Postgres, não um usuário logado. Em troca, exige o
// header x-webhook-secret batendo com WEBHOOK_VALIDAR_FOTO_SECRET — sem
// isso, qualquer um na internet poderia forçar a exclusão de fotos do bucket
// chamando este endpoint direto.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAGIC_BYTES: Record<string, { bytes: number[]; offset: number }[]> = {
  jpeg: [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }],
  png: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
  webp: [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // "RIFF"
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // "WEBP"
  ],
};

function matchesMagicBytes(buf: Uint8Array): boolean {
  return Object.values(MAGIC_BYTES).some((rules) =>
    rules.every((rule) =>
      rule.bytes.every((b, i) => buf[rule.offset + i] === b)
    )
  );
}

Deno.serve(async (req) => {
  try {
    const segredoEsperado = Deno.env.get("WEBHOOK_VALIDAR_FOTO_SECRET");
    if (!segredoEsperado || req.headers.get("x-webhook-secret") !== segredoEsperado) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    // Database Webhook do Supabase envolve a linha em "record", não manda
    // as colunas na raiz do payload (confirmado contra a doc oficial —
    // {type, table, schema, record, old_record}). Bug real encontrado nesta
    // sessão: antes, isto lia bucket_id/name direto da raiz, então dava
    // sempre undefined e a validação nunca rodava de verdade (sempre
    // "skipped": true).
    const { record } = await req.json();
    const { bucket_id, name } = record ?? {};

    if (bucket_id !== "fotos" || !name) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: file, error: downloadError } = await supabase.storage
      .from(bucket_id)
      .download(name);

    if (downloadError || !file) {
      return new Response(
        JSON.stringify({ error: "download_failed", detail: downloadError?.message }),
        { status: 500 },
      );
    }

    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

    if (!matchesMagicBytes(head)) {
      await supabase.storage.from(bucket_id).remove([name]);
      return new Response(
        JSON.stringify({ rejeitado: true, motivo: "conteudo_nao_e_imagem_valida", name }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ aprovado: true, name }), { status: 200 });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "falha_interna", detail: String(err) }),
      { status: 500 },
    );
  }
});
