-- =====================================================================
-- DASHBOARD · permissão "Somente a aba Saída · Fornecedores"  (rode UMA vez no SQL Editor do Supabase; é seguro rodar de novo)
-- Pré-requisitos: permissoes.sql (permissões por usuário) e bases-dados.sql já instalados.
--
-- PARA QUE SERVE
--   Quem cuida dos pagamentos pode ver no Dashboard Financeiro SÓ a aba "Saída · Fornecedores" (os pagamentos a fornecedores), sem entradas,
--   saldos bancários nem investimentos. O administrador marca "Somente a aba Saída · Fornecedores" no cadastro do usuário (tela Usuários).
--
-- COMO O BANCO GARANTE (não é só esconder a aba)
--   • A base completa do Dashboard (public.dashboard_dados) continua exigindo a permissão dash.ver: quem tem só dash.fornecedores NÃO consegue lê-la
--     (nem pelo console do navegador nem pela API).
--   • O site publica, junto com a base, uma CÓPIA REDUZIDA só com os lançamentos de Fornecedores (a mesma regra da aba) em public.bases, chave
--     'dashboard_fornecedores'. Essa cópia é lida por quem tem dash.ver ou dash.fornecedores e só é gravada por quem tem dash.publicar.
--   • Logo depois de rodar este SQL, o administrador abre o Dashboard Financeiro uma vez: o site cria a cópia sozinho a partir da base já publicada
--     (ou clique em "⬆ Atualizar base" com a planilha). Daí em diante, cada publicação da base atualiza a cópia junto.
--
-- O QUE O SCRIPT FAZ
--   1) cadastra a permissão dash.fornecedores no catálogo (public.permissoes_validas) e na regra de fechamento (public.perm_fechamento):
--      quem tem o relatório completo (dash.ver) ou a ação "atualizar a base" (dash.publicar) não guarda a versão restrita;
--   2) libera a chave 'dashboard_fornecedores' na tabela public.bases;
--   3) ensina public.pode_ler_base / public.pode_publicar_base a tratar essa chave;
--   4) reaplica as regras de acesso por permissão.
--   Não altera nenhum usuário nem nenhuma base existente. Os trechos 1 a 3 são os mesmos do permissoes.sql (que já os traz atualizados;
--   o catálogo aqui já inclui as permissões do Seguros — seg.ver/seg.lancar/seg.excluir —, para este script poder rodar de novo sem desfazê-las).
-- =====================================================================

-- 0) Pré-requisitos
do $$
begin
  if to_regprocedure('public.tem_permissao(text)') is null then
    raise exception 'Rode antes o permissoes.sql (permissões por usuário): este script depende dele.' using errcode = '55000';
  end if;
  if to_regclass('public.bases') is null then
    raise exception 'Rode antes o bases-dados.sql: a tabela public.bases não existe.' using errcode = '55000';
  end if;
end $$;

-- 1) Catálogo de permissões e regra de fechamento ----------------------------------------------------
create or replace function public.permissoes_validas()
returns text[] language sql immutable set search_path = public as $$
  select array['fundo.ver','fundo.publicar','fat.ver','fat.anexar','fat.excluir','receber.ver','receber.lancar','receber.excluir',
               'reidi.ver','reidi.parametros','lanc.lancar','fluxo.ver','fluxo.publicar','dash.ver','dash.fornecedores','dash.publicar',
               'seg.ver','seg.lancar','seg.excluir']::text[];
$$;

-- quem recebe uma ação recebe junto o "ver" do mesmo relatório; remove repetidos e ordena.
-- "dash.fornecedores" (só a aba Saída · Fornecedores) é a versão restrita do "dash.ver": quem tem o completo (ou a ação que o exige) não guarda a restrita.
create or replace function public.perm_fechamento(p_perm text[])
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct k order by k), array[]::text[])
  from (
    select unnest(array_remove(p_perm, null)) as k
    union select 'fundo.ver'   where p_perm && array['fundo.publicar']
    union select 'fat.ver'     where p_perm && array['fat.anexar','fat.excluir']
    union select 'receber.ver' where p_perm && array['receber.lancar','receber.excluir']
    union select 'reidi.ver'   where p_perm && array['reidi.parametros']
    union select 'fluxo.ver'   where p_perm && array['fluxo.publicar']
    union select 'dash.ver'    where p_perm && array['dash.publicar']
    union select 'seg.ver'     where p_perm && array['seg.lancar','seg.excluir']
  ) s
  where not (k = 'dash.fornecedores' and p_perm && array['dash.ver','dash.publicar']);
$$;

-- 2) Chave nova na tabela public.bases ------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.bases'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%chave%'
  loop
    execute format('alter table public.bases drop constraint %I', r.conname);
  end loop;
  alter table public.bases add constraint bases_chave_check
    check (chave in ('fundo_reserva', 'reidi', 'fluxo_projetado', 'reidi_config', 'dashboard_fornecedores'));
end $$;

-- 3) Quem lê e quem publica cada base ---------------------------------------------------------------------
create or replace function public.pode_ler_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.ver')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.ver')
    when 'reidi_config'    then public.tem_permissao('reidi.ver') or public.tem_permissao('lanc.lancar')
    when 'reidi'           then public.tem_permissao('reidi.ver')
    when 'dashboard_fornecedores' then public.tem_permissao('dash.ver') or public.tem_permissao('dash.fornecedores')
    else false
  end;
$$;

create or replace function public.pode_publicar_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.publicar')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.publicar')
    when 'reidi_config'    then public.tem_permissao('reidi.parametros')
    when 'dashboard_fornecedores' then public.tem_permissao('dash.publicar')
    else public.is_admin()
  end;
$$;

-- 4) Reaplica as regras de acesso por permissão ---------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.aplicar_politicas_permissoes()') is not null then perform public.aplicar_politicas_permissoes(); end if;
end $$;

-- Conferência (rode separado, uma consulta por vez):
--   1) a permissão está no catálogo (deve devolver true):
--        select 'dash.fornecedores' = any (public.permissoes_validas()) as no_catalogo;
--   2) a chave foi liberada na tabela de bases (a definição deve citar 'dashboard_fornecedores'):
--        select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.bases'::regclass and conname = 'bases_chave_check';
--   3) depois que o administrador abrir o Dashboard Financeiro, a cópia reduzida existe (1 linha; "fornecedores" = nº de lançamentos copiados):
--        select chave, arquivo, atualizado_em, jsonb_array_length(dados -> 'r') as lancamentos from public.bases where chave = 'dashboard_fornecedores';
