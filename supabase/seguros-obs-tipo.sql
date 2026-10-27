-- =====================================================================
-- SEGUROS · OBSERVAÇÃO POR TIPO DE SEGURO
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: seguros.sql já rodado (rode também o seguros-linhas.sql, se ainda não rodou).
--
-- O QUE MUDA
--   A "Observação (opcional)" da empresa deixa de ser uma só e passa a ser guardada POR TIPO DE SEGURO: cada tipo da empresa (= cada linha da aba Empresas) tem a sua
--   própria observação, e a de um tipo não aparece nos outros — mesmo sendo a mesma empresa. Quem retira um tipo da empresa leva a observação dele junto.
--   Os pagamentos já têm observação própria (e tipo próprio): não mudam.
--
-- COMO FICA O QUE JÁ ESTÁ GRAVADO (nada se perde)
--   • empresa COM tipo(s) e com observação → a observação passa para o PRIMEIRO tipo da empresa (onde ela já aparecia na tela); os outros tipos começam sem observação.
--   • empresa SEM tipo cadastrado → a observação continua como está (é a observação da linha "nenhum tipo cadastrado"; quando a empresa ganhar um tipo, ela passa para ele).
--   A coluna antiga (seguros_empresas.obs) continua existindo, só para esse caso. Pagamentos e comprovantes não são tocados.
--   Cada empresa ajustada deixa uma linha na Auditoria ("obs. alterada: …"), feita pelo "sistema".
--
-- O QUE É NOVO NO BANCO
--   • seguros_empresas.obs_tipos (jsonb) → { "Tipo de seguro": "observação", … } · até 300 caracteres por tipo · só para tipos que a empresa tem.
--   • gatilho trg_seguros_empresas_obs_tipos → limpa os textos, descarta a observação de um tipo que a empresa não tem mais e garante a regra "empresa com tipo não tem
--     observação solta" (se chegar uma — por exemplo de uma tela antiga ainda aberta — ela passa para o primeiro tipo, sem perder o texto e sem repetir o que já estiver lá).
--   • a Auditoria passa a dizer em quais tipos a observação foi alterada (e o texto do evento de empresa pode ter até 400 caracteres, em vez de 200, para caber a lista de tipos).
--
-- ORDEM DE PUBLICAÇÃO
--   Se você subir o site novo ANTES de rodar este script, tudo continua como antes (uma observação por empresa) e a janela da empresa avisa que falta rodar este arquivo.
--   Se rodar o script antes de subir o site, as telas antigas seguem funcionando, mas não mostram as observações que passaram para os tipos até o site novo ser publicado.
-- =====================================================================

do $$
begin
  if to_regclass('public.seguros_empresas') is null or to_regclass('public.seguros_pagamentos') is null then
    raise exception 'Rode antes o seguros.sql: faltam as tabelas do relatório de Seguros.' using errcode = '55000';
  end if;
end $$;

-- 1) A coluna e as funções de apoio ------------------------------------------------------------------------------
alter table public.seguros_empresas add column if not exists obs_tipos jsonb not null default '{}'::jsonb;

-- observações por tipo aceitáveis: um objeto { tipo: texto } com até 20 tipos (1 a 60 caracteres cada) e textos de até 300 caracteres
create or replace function public.seguros_obs_tipos_ok(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case when p is not null and jsonb_typeof(p) = 'object' then
           (select count(*) from jsonb_object_keys(p)) <= 20
           and not exists (select 1 from jsonb_each(p) e
                            where char_length(e.key) not between 1 and 60
                               or jsonb_typeof(e.value) <> 'string'
                               or char_length(e.value #>> '{}') > 300)
         else false end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.seguros_empresas'::regclass and conname = 'seguros_empresas_obs_tipos_check') then
    alter table public.seguros_empresas
      add constraint seguros_empresas_obs_tipos_check check (public.seguros_obs_tipos_ok(obs_tipos));
  end if;
end $$;

-- limpa as observações por tipo de acordo com os tipos da empresa: fica UMA observação (sem espaços nas pontas e não vazia) para cada tipo que a empresa tem, gravada com a
-- grafia do tipo; o que sobra (tipo que a empresa não tem mais, texto vazio, valor que não é texto) é descartado. Maiúsculas/minúsculas não contam ao achar o tipo.
create or replace function public.seguros_obs_tipos_norm(p jsonb, p_tipos text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(t.t, to_jsonb(v.v)), '{}'::jsonb)
    from unnest(coalesce(p_tipos, array[]::text[])) as t(t)
    cross join lateral (
      select nullif(btrim(e.value #>> '{}'), '') as v
        from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
       where jsonb_typeof(e.value) = 'string' and (e.key = t.t or lower(e.key) = lower(t.t))
       order by (e.key = t.t) desc, e.key
       limit 1
    ) v
   where v.v is not null;
$$;

comment on column public.seguros_empresas.obs_tipos is 'Seguros: observação de cada tipo de seguro da empresa ({"Tipo": "texto"}); cada tipo é uma linha na aba Empresas.';
comment on column public.seguros_empresas.obs        is 'Seguros: observação da empresa SEM tipo de seguro (empresa com tipo guarda a observação em obs_tipos).';

-- 2) Gatilho: ANTES de gravar, depois do seguros_empresas_antes (que normaliza os tipos): o nome vem depois na ordem alfabética --------------
create or replace function public.seguros_empresas_obs_tipos()
returns trigger language plpgsql set search_path = public as $$
declare v_t1 text; v_atual text;
begin
  new.obs       := btrim(coalesce(new.obs, ''));
  new.obs_tipos := public.seguros_obs_tipos_norm(new.obs_tipos, new.tipos);
  -- empresa COM tipo não tem observação "solta": a que chegar passa para o primeiro tipo. Se ele já tem observação, o texto novo vai depois dela — e não se repete o que já estiver lá
  -- (uma tela antiga, ainda aberta, reenvia a observação que acabou de ser migrada)
  if new.obs <> '' and cardinality(new.tipos) > 0 then
    v_t1    := new.tipos[1];
    v_atual := coalesce(new.obs_tipos ->> v_t1, '');
    new.obs_tipos := new.obs_tipos || jsonb_build_object(v_t1, case when v_atual = '' then new.obs
                                                                     when position(new.obs in v_atual) > 0 then v_atual
                                                                     else v_atual || ' · ' || new.obs end);
    new.obs := '';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seguros_empresas_obs_tipos on public.seguros_empresas;
create trigger trg_seguros_empresas_obs_tipos
  before insert or update on public.seguros_empresas
  for each row execute function public.seguros_empresas_obs_tipos();

-- 3) Auditoria gravada pelo banco: agora diz em quais tipos a observação foi alterada ---------------------------------------------
create or replace function public.seguros_empresas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text; v_obs text; r public.seguros_empresas;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome'])
                        = (to_jsonb(new) - array['atualizado_em', 'atualizado_por', 'atualizado_por_nome']) then
    return null;   -- nada mudou
  end if;
  select login into v_login from public.perfis where id = auth.uid();
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_ev := case tg_op when 'INSERT' then 'Seguros: cadastrou empresa ' when 'UPDATE' then 'Seguros: alterou empresa ' else 'Seguros: excluiu empresa ' end
       || r.codigo || ' · ' || left(r.razao_social, 60) || ' · CNPJ ' || public.fmt_cnpj(r.cnpj)
       || ' · tipos: ' || coalesce(nullif(array_to_string(r.tipos, ', '), ''), '—');
  if tg_op = 'UPDATE' then
    if old.ativo  is distinct from new.ativo  then v_ev := v_ev || case when new.ativo then ' · reativada' else ' · inativada' end; end if;
    if old.codigo is distinct from new.codigo then v_ev := v_ev || ' (código antes: ' || old.codigo || ')'; end if;
    if old.cnpj   is distinct from new.cnpj   then v_ev := v_ev || ' (CNPJ antes: ' || public.fmt_cnpj(old.cnpj) || ')'; end if;
    if old.tipos  is distinct from new.tipos  then v_ev := v_ev || ' (tipos antes: ' || coalesce(nullif(array_to_string(old.tipos, ', '), ''), '—') || ')'; end if;
    -- observações: os tipos em que o texto foi incluído, alterado ou apagado (e, à parte, a observação da empresa sem tipo)
    if old.obs_tipos is distinct from new.obs_tipos then
      select string_agg(x.k, ', ' order by x.k) into v_obs
        from (select coalesce(n.key, o.key) as k
                from jsonb_each_text(old.obs_tipos) o
                full join jsonb_each_text(new.obs_tipos) n on n.key = o.key
               where o.value is distinct from n.value) x;
      v_ev := v_ev || ' · obs. alterada: ' || coalesce(v_obs, '—');
    end if;
    if old.obs is distinct from new.obs then v_ev := v_ev || ' · obs. da empresa alterada'; end if;
  end if;
  -- até 400 caracteres (a lista de tipos e as observações alteradas podem ser longas; nos pagamentos o limite continua 200)
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 400));
  return null;
end;
$$;

-- 4) O que já está gravado: a observação da empresa COM tipo passa para o primeiro tipo (quem faz a troca é o gatilho acima; empresa sem tipo fica como está) ---------
update public.seguros_empresas set obs = obs where obs <> '' and cardinality(tipos) > 0;

notify pgrst, 'reload schema';   -- a API enxerga a coluna nova na hora

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a coluna e o gatilho existem (deve devolver 1 linha com coluna = true e gatilho = true):
--        select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seguros_empresas' and column_name = 'obs_tipos') as coluna,
--               exists (select 1 from pg_trigger where tgname = 'trg_seguros_empresas_obs_tipos' and not tgisinternal) as gatilho;
--   2) nenhuma empresa COM tipo ficou com observação "solta" (deve devolver 0):
--        select count(*) from public.seguros_empresas where obs <> '' and cardinality(tipos) > 0;
--   3) as observações de cada tipo, como a tela mostra:
--        select e.codigo, e.razao_social, t.tipo, t.observacao
--          from public.seguros_empresas e, jsonb_each_text(e.obs_tipos) as t(tipo, observacao)
--         order by e.codigo, t.tipo;
