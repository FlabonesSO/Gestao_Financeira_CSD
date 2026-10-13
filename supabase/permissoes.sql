-- =====================================================================
-- PERMISSÕES POR USUÁRIO  ·  rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo)
-- Pré-requisitos (nesta ordem): schema-consorcio-santadulce.sql, bases-dados.sql, reidi-lancamentos.sql, dashboard-dados.sql,
-- faturas-emitidas.sql, faturas-total-faturado.sql e contas-receber.sql. Este script deve ser o ÚLTIMO a rodar.
--
-- O QUE FAZ
--   • Cada usuário passa a ter uma lista de PERMISSÕES (coluna public.perfis.permissoes) marcada pelo administrador na tela "Usuários".
--     O perfil (administrador, visualizador, lançador REIDI, faturamento) continua existindo: ele define o PONTO DE PARTIDA
--     (permissões padrão do perfil); depois o administrador marca/desmarca o que quiser, usuário por usuário.
--   • As regras de acesso de TODAS as tabelas e do armazenamento das NFs passam a consultar essas permissões NO BANCO (RLS).
--     Ou seja: o bloqueio vale para qualquer forma de acesso (tela, URL direta, console do navegador, API) — não é só esconder menu.
--   • Só o administrador altera permissões, e nunca as próprias (função definir_permissoes). Ninguém grava em public.perfis direto.
--   • Quem já existia continua com o MESMO acesso que tinha pelo perfil (as permissões são preenchidas a partir do perfil na primeira execução).
--     O relatório novo "Contas a Receber" nasce liberado só para administradores: marque "Visualizar" nos usuários que devem vê-lo.
--
-- PERMISSÕES (chave → o que libera)
--   fundo.ver            Fundo de Reserva: ver o relatório                  fundo.publicar    atualizar a base (upload + publicar)
--   fat.ver              Faturas Emitidas: ver e baixar/visualizar as NFs   fat.anexar        anexar, editar e corrigir/refaturar NF
--   fat.excluir          excluir NF
--   receber.ver          Contas a Receber: ver o relatório                  receber.lancar    registrar e editar recebimentos
--   receber.excluir      excluir recebimentos
--   reidi.ver            REIDI (relatório): ver                             reidi.parametros  alterar os parâmetros do relatório
--   lanc.lancar          Projeção REIDI: acessar e lançar compras (edita/exclui só as que ele lançou)
--   fluxo.ver            Programação Financeira Quadrimestral: ver          fluxo.publicar    atualizar a base
--   dash.ver             Dashboard Financeiro: ver                          dash.publicar     atualizar a base
--   (Usuários, Termo para assinatura e "Planilha (modelo)" do REIDI continuam exclusivos do administrador.)
--   Quem recebe uma ação (publicar, anexar, lançar...) recebe junto a permissão de ver do mesmo relatório.
--
-- SE VOCÊ RODAR OUTRO SQL DO SISTEMA DEPOIS DESTE: não precisa fazer nada. Os scripts antigos terminam chamando
-- public.aplicar_politicas_permissoes(), que reaplica as regras por permissão por cima das regras por perfil.
-- =====================================================================

-- 1) Catálogo, padrões por perfil e dependências ------------------------------------------------
create or replace function public.permissoes_validas()
returns text[] language sql immutable set search_path = public as $$
  select array['fundo.ver','fundo.publicar','fat.ver','fat.anexar','fat.excluir','receber.ver','receber.lancar','receber.excluir',
               'reidi.ver','reidi.parametros','lanc.lancar','fluxo.ver','fluxo.publicar','dash.ver','dash.publicar']::text[];
$$;

-- permissões iniciais de cada perfil (iguais ao acesso que cada perfil sempre teve)
create or replace function public.perm_padrao(p_papel text)
returns text[] language sql immutable set search_path = public as $$
  select case p_papel
    when 'admin'       then public.permissoes_validas()
    when 'viewer'      then array['dash.ver','fat.ver','fluxo.ver','fundo.ver','reidi.ver']::text[]
    when 'lancador'    then array['lanc.lancar','reidi.ver']::text[]
    when 'faturamento' then array['fat.anexar','fat.ver']::text[]
    else array[]::text[]
  end;
$$;

-- quem recebe uma ação recebe junto o "ver" do mesmo relatório; remove repetidos e ordena
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
  ) s;
$$;

-- 2) Coluna das permissões no cadastro de usuários ------------------------------------------------
alter table public.perfis add column if not exists permissoes text[];
comment on column public.perfis.permissoes is 'Permissões do usuário (chaves de public.permissoes_validas()). Só definir_permissoes() grava. Administrador tem acesso a tudo, com ou sem lista.';

-- primeira execução: cada usuário recebe as permissões padrão do seu perfil (acesso igual ao de antes)
update public.perfis set permissoes = public.perm_padrao(papel) where permissoes is null;

alter table public.perfis drop constraint if exists perfis_permissoes_check;
alter table public.perfis add  constraint perfis_permissoes_check
  check (permissoes is null or permissoes <@ public.permissoes_validas());

-- usuário novo (criado pela Edge Function) nasce com as permissões padrão do perfil; trocar o perfil volta ao padrão do perfil novo
create or replace function public.perfis_permissoes_padrao()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.permissoes is null then new.permissoes := public.perm_padrao(new.papel); end if;
  elsif new.papel is distinct from old.papel then
    new.permissoes := public.perm_padrao(new.papel);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfis_permissoes on public.perfis;
create trigger trg_perfis_permissoes
  before insert or update of papel on public.perfis
  for each row execute function public.perfis_permissoes_padrao();

-- 3) Funções que as regras de acesso (RLS) usam --------------------------------------------------------
-- o usuário logado está ativo e (é administrador ou tem a permissão)
create or replace function public.tem_permissao(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.ativo
      and (p.papel = 'admin' or p_chave = any (coalesce(p.permissoes, public.perm_padrao(p.papel))))
  );
$$;

-- bases publicadas (public.bases): quem pode LER cada uma
create or replace function public.pode_ler_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.ver')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.ver')
    when 'reidi_config'    then public.tem_permissao('reidi.ver') or public.tem_permissao('lanc.lancar')
    when 'reidi'           then public.tem_permissao('reidi.ver')
    else false
  end;
$$;

-- bases publicadas: quem pode GRAVAR (publicar) cada uma
create or replace function public.pode_publicar_base(p_chave text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_chave
    when 'fundo_reserva'   then public.tem_permissao('fundo.publicar')
    when 'fluxo_projetado' then public.tem_permissao('fluxo.publicar')
    when 'reidi_config'    then public.tem_permissao('reidi.parametros')
    else public.is_admin()
  end;
$$;

revoke execute on function public.tem_permissao(text)       from public, anon;
revoke execute on function public.pode_ler_base(text)       from public, anon;
revoke execute on function public.pode_publicar_base(text)  from public, anon;
grant  execute on function public.tem_permissao(text)       to authenticated;
grant  execute on function public.pode_ler_base(text)       to authenticated;
grant  execute on function public.pode_publicar_base(text)  to authenticated;

-- 4) Regras de acesso por permissão (todas as tabelas + armazenamento das NFs) ------------------------------
-- Fica numa função para poder ser reaplicada: os scripts antigos terminam chamando-a (ver o fim de cada um).
create or replace function public.aplicar_politicas_permissoes()
returns void language plpgsql set search_path = public as $$
begin
  -- quem pode ver / baixar NF (usado também por public.faturado_por_competencia)
  execute $f$create or replace function public.pode_ver_faturas()
    returns boolean language sql security definer stable set search_path = public as 'select public.tem_permissao(''fat.ver'')'$f$;

  -- bases: Fundo de Reserva, Programação Quadrimestral e parâmetros do REIDI
  drop policy if exists bases_select on public.bases;
  create policy bases_select on public.bases for select to authenticated using (public.pode_ler_base(chave));
  drop policy if exists bases_insert on public.bases;
  create policy bases_insert on public.bases for insert to authenticated with check (public.pode_publicar_base(chave));
  drop policy if exists bases_update on public.bases;
  create policy bases_update on public.bases for update to authenticated
    using (public.pode_publicar_base(chave)) with check (public.pode_publicar_base(chave));

  -- Dashboard Financeiro
  if to_regclass('public.dashboard_dados') is not null then
    drop policy if exists dashboard_select on public.dashboard_dados;
    create policy dashboard_select on public.dashboard_dados for select to authenticated using (public.tem_permissao('dash.ver'));
    drop policy if exists dashboard_insert on public.dashboard_dados;
    create policy dashboard_insert on public.dashboard_dados for insert to authenticated with check (public.tem_permissao('dash.publicar'));
    drop policy if exists dashboard_update on public.dashboard_dados;
    create policy dashboard_update on public.dashboard_dados for update to authenticated
      using (public.tem_permissao('dash.publicar')) with check (public.tem_permissao('dash.publicar'));
  end if;

  -- REIDI: ler = relatório ou lançamento · incluir = lançamento · editar/excluir = administrador ou o próprio autor da compra
  if to_regclass('public.reidi_compras') is not null then
    drop policy if exists reidi_select on public.reidi_compras;
    create policy reidi_select on public.reidi_compras for select to authenticated
      using (public.tem_permissao('reidi.ver') or public.tem_permissao('lanc.lancar'));
    drop policy if exists reidi_insert on public.reidi_compras;
    create policy reidi_insert on public.reidi_compras for insert to authenticated with check (public.tem_permissao('lanc.lancar'));
    drop policy if exists reidi_update on public.reidi_compras;
    create policy reidi_update on public.reidi_compras for update to authenticated
      using      (public.is_admin() or (public.tem_permissao('lanc.lancar') and criado_por = auth.uid()))
      with check (public.is_admin() or (public.tem_permissao('lanc.lancar') and criado_por = auth.uid()));
    drop policy if exists reidi_delete on public.reidi_compras;
    create policy reidi_delete on public.reidi_compras for delete to authenticated
      using (public.is_admin() or (public.tem_permissao('lanc.lancar') and criado_por = auth.uid()));
  end if;

  -- Faturas Emitidas (tabela) e arquivos das NFs (storage)
  if to_regclass('public.faturas_emitidas') is not null then
    drop policy if exists faturas_select on public.faturas_emitidas;
    create policy faturas_select on public.faturas_emitidas for select to authenticated using (public.tem_permissao('fat.ver'));
    drop policy if exists faturas_insert on public.faturas_emitidas;
    create policy faturas_insert on public.faturas_emitidas for insert to authenticated with check (public.tem_permissao('fat.anexar'));
    drop policy if exists faturas_update on public.faturas_emitidas;
    create policy faturas_update on public.faturas_emitidas for update to authenticated
      using (public.tem_permissao('fat.anexar')) with check (public.tem_permissao('fat.anexar'));
    drop policy if exists faturas_delete on public.faturas_emitidas;
    create policy faturas_delete on public.faturas_emitidas for delete to authenticated using (public.tem_permissao('fat.excluir'));

    drop policy if exists faturas_nf_select on storage.objects;
    create policy faturas_nf_select on storage.objects for select to authenticated
      using (bucket_id = 'faturas-nf' and public.tem_permissao('fat.ver'));
    drop policy if exists faturas_nf_insert on storage.objects;
    create policy faturas_nf_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'faturas-nf' and public.tem_permissao('fat.anexar'));
    drop policy if exists faturas_nf_delete on storage.objects;
    create policy faturas_nf_delete on storage.objects for delete to authenticated
      using (bucket_id = 'faturas-nf' and public.tem_permissao('fat.excluir'));
  end if;

  -- Contas a Receber (recebimentos lançados)
  if to_regclass('public.recebimentos') is not null then
    drop policy if exists recebimentos_select on public.recebimentos;
    create policy recebimentos_select on public.recebimentos for select to authenticated using (public.tem_permissao('receber.ver'));
    drop policy if exists recebimentos_insert on public.recebimentos;
    create policy recebimentos_insert on public.recebimentos for insert to authenticated with check (public.tem_permissao('receber.lancar'));
    drop policy if exists recebimentos_update on public.recebimentos;
    create policy recebimentos_update on public.recebimentos for update to authenticated
      using (public.tem_permissao('receber.lancar')) with check (public.tem_permissao('receber.lancar'));
    drop policy if exists recebimentos_delete on public.recebimentos;
    create policy recebimentos_delete on public.recebimentos for delete to authenticated using (public.tem_permissao('receber.excluir'));
  end if;
end;
$$;
-- só o dono do banco (SQL Editor) executa; o navegador nunca chama esta função
revoke execute on function public.aplicar_politicas_permissoes() from public, anon, authenticated;

-- 5) Alterar permissões: só administrador, nunca as próprias, só chaves do catálogo ------------------------------
create or replace function public.definir_permissoes(p_id uuid, p_permissoes text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_alvo  public.perfis%rowtype;
  v_ator  text;
  v_inv   text[];
  v_novo  text[];
  v_ant   text[];
  v_add   text[];
  v_rem   text[];
  v_ev    text;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão: só o administrador altera permissões.' using errcode = '42501';
  end if;
  if p_id is null or p_id = auth.uid() then
    raise exception 'Você não pode alterar as próprias permissões.' using errcode = '42501';
  end if;
  select * into v_alvo from public.perfis where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if v_alvo.papel = 'admin' then
    raise exception 'O administrador tem acesso total. Para limitar o acesso, troque o perfil dele antes.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct k), array[]::text[]) into v_inv
  from unnest(array_remove(coalesce(p_permissoes, array[]::text[]), null)) k
  where k <> all (public.permissoes_validas());
  if cardinality(v_inv) > 0 then
    raise exception 'Permissão desconhecida: %', array_to_string(v_inv, ', ') using errcode = '22023';
  end if;

  v_novo := public.perm_fechamento(coalesce(p_permissoes, array[]::text[]));
  v_ant  := public.perm_fechamento(coalesce(v_alvo.permissoes, public.perm_padrao(v_alvo.papel)));

  update public.perfis set permissoes = v_novo where id = p_id;

  select coalesce(array_agg(k order by k), array[]::text[]) into v_add from unnest(v_novo) k where k <> all (v_ant);
  select coalesce(array_agg(k order by k), array[]::text[]) into v_rem from unnest(v_ant)  k where k <> all (v_novo);
  if cardinality(v_add) + cardinality(v_rem) > 0 then
    select login into v_ator from public.perfis where id = auth.uid();
    v_ev := 'permissões de ' || v_alvo.login || ':'
         || case when cardinality(v_add) > 0 then ' +' || array_to_string(v_add, ' +') else '' end
         || case when cardinality(v_rem) > 0 then ' -' || array_to_string(v_rem, ' -') else '' end;
    insert into public.auditoria (usuario, evento) values (coalesce(v_ator, 'admin'), left(v_ev, 200));
  end if;
  return v_novo;
end;
$$;
revoke execute on function public.definir_permissoes(uuid, text[]) from public, anon;
grant  execute on function public.definir_permissoes(uuid, text[]) to authenticated;

-- 6) Conferência para a tela "Usuários": as regras do banco estão mesmo por permissão? (só administrador) ------------
create or replace function public.permissoes_status()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_div text[] := array[]::text[];
  r record;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  for r in
    select t.sch, t.tab, t.pol from (values
      ('public','bases','bases_select'), ('public','bases','bases_insert'), ('public','bases','bases_update'),
      ('public','dashboard_dados','dashboard_select'), ('public','dashboard_dados','dashboard_insert'), ('public','dashboard_dados','dashboard_update'),
      ('public','reidi_compras','reidi_select'), ('public','reidi_compras','reidi_insert'), ('public','reidi_compras','reidi_update'), ('public','reidi_compras','reidi_delete'),
      ('public','faturas_emitidas','faturas_select'), ('public','faturas_emitidas','faturas_insert'), ('public','faturas_emitidas','faturas_update'), ('public','faturas_emitidas','faturas_delete'),
      ('storage','objects','faturas_nf_select'), ('storage','objects','faturas_nf_insert'), ('storage','objects','faturas_nf_delete'),
      ('public','recebimentos','recebimentos_select'), ('public','recebimentos','recebimentos_insert'), ('public','recebimentos','recebimentos_update'), ('public','recebimentos','recebimentos_delete')
    ) as t(sch, tab, pol)
    where to_regclass(t.sch || '.' || t.tab) is not null
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = r.sch and p.tablename = r.tab and p.policyname = r.pol
        and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ '(tem_permissao|pode_ler_base|pode_publicar_base)'
    ) then
      v_div := v_div || (r.tab || '.' || r.pol);
    end if;
  end loop;
  return jsonb_build_object('ok', cardinality(v_div) = 0, 'divergentes', to_jsonb(v_div));
end;
$$;
revoke execute on function public.permissoes_status() from public, anon;
grant  execute on function public.permissoes_status() to authenticated;

-- 7) Aplica agora ------------------------------------------------------------------------------------------
select public.aplicar_politicas_permissoes();

-- Conferência (depois deste script; rode UMA consulta por vez — o editor mostra só o resultado da última):
--
--   1) Usuários e permissões gravadas (o administrador deve ter as 15 chaves; os demais, o padrão do perfil ou o que foi marcado):
--        select login, papel, ativo, permissoes from public.perfis order by criado_em;
--
--   2) Regras do banco por permissão — todas as linhas devem mostrar por_permissao = true:
--        select tablename as tabela, policyname as regra, cmd as comando,
--               (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(tem_permissao|pode_ler_base|pode_publicar_base)' as por_permissao
--        from pg_policies
--        where (schemaname = 'public'  and tablename in ('bases', 'dashboard_dados', 'reidi_compras', 'faturas_emitidas', 'recebimentos'))
--           or (schemaname = 'storage' and tablename = 'objects' and policyname like 'faturas_nf_%')
--        order by 1, 3, 2;
--
--   3) permissoes_status() só responde a ADMINISTRADOR LOGADO NO SITE (a tela Usuários mostra o resultado numa faixa verde/amarela).
--      No SQL Editor não existe usuário logado (auth.uid() é nulo), então ela devolve "42501 Sem permissão" — é o esperado, não é falha da instalação.
--      Para rodá-la aqui, simule o administrador no mesmo comando:
--        with adm as (
--          select set_config('request.jwt.claim.sub', id::text, true) as simulado
--          from public.perfis where papel = 'admin' and ativo order by criado_em limit 1
--        )
--        select public.permissoes_status() as resultado from adm;      -- esperado: {"ok": true, "divergentes": []}
