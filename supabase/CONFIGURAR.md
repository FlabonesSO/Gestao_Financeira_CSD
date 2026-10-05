# Configurar o Supabase (≈ 15 min)

## 1. Projeto
1. Crie conta em supabase.com → **New project** (região **South America – São Paulo**, se disponível). Guarde a senha do banco.
2. **Authentication → Sign In / Providers:** mantenha Email ligado e **desligue "Allow new users to sign up"**: só o administrador cria usuários.

## 2. Banco
**SQL Editor → New query →** cole `supabase/schema.sql` → **Run**.

## 3. Primeiro administrador
1. **Authentication → Users → Add user → Create new user:** e-mail `admin@csd.example.com`, uma **senha nova** (não reutilize as antigas), marque **Auto Confirm User**.
2. No SQL Editor, rode o `insert` comentado no fim do `schema.sql` (descomente).

> O e-mail é só identificador interno: login `admin` + `EMAIL_DOMAIN`. Domínio `example.com` é reservado e ninguém pode registrá-lo, então não há risco de recuperação de senha por terceiros.

## 4. Edge Function
Com a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada, na pasta do projeto:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF      # Project Settings → General → Reference ID
supabase secrets set EMAIL_DOMAIN=csd.example.com
supabase functions deploy admin-usuarios
```
(`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas automaticamente.)

Sem CLI: **Edge Functions → Deploy a new function → Via Editor**, nome `admin-usuarios`, cole `index.ts`, e crie o secret `EMAIL_DOMAIN` em Edge Functions → Secrets.

## 5. Site
1. **Project Settings → API:** copie **Project URL** e a chave **anon public**.
2. Edite `js/core/config.js` com esses dois valores (nunca a `service_role`).
3. No GitHub: envie os arquivos novos/alterados (`index.html`, `js/core/config.js`, `js/core/main.js`, `js/modulos/usuarios.js`, `README.md`, pasta `supabase/`) e **apague `usuarios.json`**.

## 6. Teste
- Entre com `admin` → menu **Usuários** → crie um visualizador → entre com ele em outro navegador.
- Troque a senha pelo botão 🔑 e entre de novo em outro navegador com a nova senha.

## Segurança
- Os hashes antigos continuam no histórico do Git: considere-os expostos e não reutilize aquelas senhas.
- A chave `anon` é pública; a proteção está na RLS (o navegador só lê `perfis`, e só o próprio registro, exceto admin).
- Plano gratuito pausa o projeto após ~1 semana sem uso (reativar leva 1 clique). Para uso contínuo, considere o plano Pro.
- Os dados do Fundo de Reserva continuam sendo lidos da planilha no navegador; o Supabase controla apenas o acesso ao sistema.
