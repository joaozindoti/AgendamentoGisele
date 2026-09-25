// Chave anon "legacy" (JWT), não a publishable nova: a Edge Function
// pre-cadastro roda com verify_jwt = true e só aceita JWT no Authorization.
// Ver PENDENCIAS.md, seção do frontend.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
