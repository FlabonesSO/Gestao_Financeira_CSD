/* Configuração do Supabase (Project Settings → API). A chave "anon" é PÚBLICA por design:
   quem protege os dados é a RLS do banco. NUNCA coloque aqui a chave service_role. */
const SUPABASE_URL='https://louhwynztrwglahiaoim.supabase.co',
 SUPABASE_ANON_KEY='sb_publishable_3ZqvEySXP6Dt3iFCZ-hnXg_S2I7K9Dq',
 EMAIL_DOMAIN='csd.example.com'; // identificador interno: o login "maria" vira maria@csd.example.com (domínio reservado, nunca recebe e-mail). Deve ser igual ao secret EMAIL_DOMAIN da Edge Function.
