-- =====================================================================
-- FUNDO DE RESERVA · coluna "Status" da tabela Detalhamento
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisitos: schema-consorcio-santadulce.sql (tabelas perfis/auditoria e a função is_admin()) e permissoes.sql (a função tem_permissao()).
--
-- O QUE É
--   • public.fundo_status → o status de cada NF da tabela Detalhamento do Fundo de Reserva: "Aguardando Aprovação", "Transferido" ou "A Receber".
--     Uma linha por NF, identificada pelo DOC FISCAL (texto, com os zeros à esquerda); NF sem DOC FISCAL usa a Data_Base (AAAA-MM-DD).
--     Fica numa tabela PRÓPRIA de propósito: a base do Fundo de Reserva é trocada a cada "Publicar atualização" (planilha MEDICAO_SERVICO), e o status não pode se perder.
--   • NF sem registro = status ainda não definido (a tela mostra "—"). Escolher "— sem status —" na lista apaga o registro.
--
-- QUEM PODE
--   • VER: quem pode ver o Fundo de Reserva (permissão fundo.ver) e o administrador.
--   • ALTERAR: somente o ADMINISTRADOR ativo. Tudo é aplicado AQUI, no banco (RLS): mesmo pela API, quem não é administrador não grava nem apaga.
--
-- GARANTIAS DO BANCO (ninguém pula pela tela)
--   • Status só um dos três · chave de 1 a 60 caracteres, sem espaços nas pontas nem quebra de linha.
--   • Quem alterou e quando são carimbados pelo banco (a tela não consegue informar outro autor); a chave nunca muda depois de criada.
--   • Cada definição, mudança e remoção de status vai para a Auditoria (gatilho no banco).
--
-- DEPOIS DE RODAR: suba o site novo. Nenhuma permissão nova a marcar.
-- =====================================================================

-- 0) Pré-requisitos ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.auditoria') is null or to_regclass('public.perfis') is null then
    raise exception 'Rode antes o schema-consorcio-santadulce.sql: faltam as tabelas perfis/auditoria e a função is_admin().' using errcode = '55000';
  end if;
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql: falta a função tem_permissao().' using errcode = '55000';
  end if;
end $$;

-- 1) Tabela -----------------------------------------------------------------------------------
create table if not exists public.fundo_status (
  chave               text        primary key,                 -- DOC FISCAL da NF (ou a Data_Base AAAA-MM-DD se a NF não tem DOC FISCAL)
  status              text        not null,                    -- 'aguardando' | 'transferido' | 'a_receber'
  atualizado_por      uuid        default auth.uid(),
  atualizado_por_nome text,
  atualizado_em       timestamptz not null default now(),
  constraint fundo_status_status_check check (status in ('aguardando', 'transferido', 'a_receber')),
  constraint fundo_status_chave_check  check (char_length(chave) between 1 and 60 and chave = btrim(chave) and chave !~ '[[:cntrl:]]')
);
comment on table public.fundo_status is 'Fundo de Reserva: status de cada NF da tabela Detalhamento (Aguardando Aprovação, Transferido, A Receber). Só o administrador altera.';

-- 2) ANTES de gravar: carimba quem alterou e quando; a chave não muda -------------------------------------
create or replace function public.fundo_status_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'UPDATE' then new.chave := old.chave; end if;
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_fundo_status_antes on public.fundo_status;
create trigger trg_fundo_status_antes
  before insert or update on public.fundo_status
  for each row execute function public.fundo_status_antes();

-- 3) Auditoria gravada pelo banco (definiu / mudou / removeu) -------------------------------------------------
create or replace function public.fundo_status_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text;
  rot text[] := array['aguardando', 'Aguardando Aprovação', 'transferido', 'Transferido', 'a_receber', 'A Receber'];   -- código, rótulo, código, rótulo…
begin
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    v_ev := 'Fundo de Reserva: definiu o status da NF ' || new.chave || ' como ' || coalesce(rot[array_position(rot, new.status) + 1], new.status);
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return null; end if;      -- nada mudou de verdade
    v_ev := 'Fundo de Reserva: mudou o status da NF ' || new.chave || ' de ' || coalesce(rot[array_position(rot, old.status) + 1], old.status)
            || ' para ' || coalesce(rot[array_position(rot, new.status) + 1], new.status);
  else
    v_ev := 'Fundo de Reserva: removeu o status da NF ' || old.chave || ' (era ' || coalesce(rot[array_position(rot, old.status) + 1], old.status) || ')';
  end if;
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 200));
  return null;
end;
$$;

drop trigger if exists trg_fundo_status_auditoria on public.fundo_status;
create trigger trg_fundo_status_auditoria
  after insert or update or delete on public.fundo_status
  for each row execute function public.fundo_status_auditoria();

-- 4) Regras de acesso (RLS) ---------------------------------------------------------------------------
alter table public.fundo_status enable row level security;
revoke all on table public.fundo_status from anon, authenticated;
grant select, insert, update, delete on table public.fundo_status to authenticated;

drop policy if exists fundo_status_select on public.fundo_status;
create policy fundo_status_select on public.fundo_status for select to authenticated using (public.tem_permissao('fundo.ver'));
drop policy if exists fundo_status_insert on public.fundo_status;
create policy fundo_status_insert on public.fundo_status for insert to authenticated with check (public.is_admin());
drop policy if exists fundo_status_update on public.fundo_status;
create policy fundo_status_update on public.fundo_status for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists fundo_status_delete on public.fundo_status;
create policy fundo_status_delete on public.fundo_status for delete to authenticated using (public.is_admin());

-- 5) Tempo real: quem está com o Fundo de Reserva aberto vê o status mudar sem recarregar ---------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fundo_status') then
    alter publication supabase_realtime add table public.fundo_status;
  end if;
end $$;

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a tabela existe com a segurança ligada (1 linha, rls = true):
--        select relname as tabela, relrowsecurity as rls from pg_class where relname = 'fundo_status' and relnamespace = 'public'::regnamespace;
--   2) regras de acesso (4 linhas; o ver usa tem_permissao e os demais is_admin):
--        select policyname as regra, cmd as comando, (coalesce(qual, '') || ' ' || coalesce(with_check, '')) as condicao
--          from pg_policies where schemaname = 'public' and tablename = 'fundo_status' order by 2, 1;
--   3) depois de escolher um status pela tela:
--        select chave, status, atualizado_por_nome, atualizado_em from public.fundo_status order by atualizado_em desc;
