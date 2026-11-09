-- =====================================================================
-- SEGUROS · VALOR TOTAL DO CONTRATO, TOTAL PAGO E SALDO A PAGAR (por tipo de seguro)
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisitos: seguros.sql e seguros-obs-tipo.sql já rodados (rode também o seguros-linhas.sql e o seguros-tipos.sql, se ainda não rodou).
--
-- O QUE MUDA
--   Cada tipo de seguro de uma empresa (= cada linha da aba Empresas) passa a ter o seu VALOR TOTAL DO CONTRATO. A tela mostra, em cada linha:
--     • Valor total do contrato → o valor informado para aquele tipo (na janela da empresa, ao cadastrar/editar, ou em "＋ Tipo de seguro");
--     • Total pago              → a soma dos pagamentos realizados que o financeiro lança em "Pagamentos realizados" para aquela empresa e aquele tipo;
--     • Saldo a pagar           → valor total do contrato − total pago (negativo = pago a maior).
--   Nada é digitado duas vezes: o total pago e o saldo são CALCULADOS dos pagamentos que já existem. O banco só passa a guardar o valor do contrato.
--
-- COMO FICA O QUE JÁ ESTÁ GRAVADO (nada se perde)
--   Todos os tipos começam SEM valor de contrato (a tela mostra "—" e o atalho "informar"). Empresas, tipos, observações, pagamentos e comprovantes não são tocados.
--
-- O QUE É NOVO NO BANCO
--   • seguros_empresas.valor_contrato_tipos (jsonb) → { "Tipo de seguro": 1234.56, … } · em R$, 2 casas, maior que zero e menor que 10 trilhões · só para tipos que a empresa tem.
--   • gatilho trg_seguros_empresas_valores_tipos → arredonda para 2 casas e descarta o valor de um tipo que a empresa não tem mais (ao retirar o tipo, o valor dele sai junto).
--   • regra seguros_empresas_valor_contrato_tipos_check → recusa valor que não seja número, zero ou negativo, ou mais de 20 tipos.
--   • a Auditoria passa a registrar o valor do contrato de cada tipo ANTES → DEPOIS (ex.: "contrato: Vida em Grupo R$ 100.000,00 → R$ 120.000,00"; no cadastro e na exclusão, os valores
--     que a empresa tinha); o texto do evento de empresa pode ter até 1000 caracteres (eram 400), para caber a lista de tipos e os valores. Pagamentos continuam com 200.
--
-- ORDEM DE PUBLICAÇÃO
--   Se você subir o site novo ANTES de rodar este script, a tela mostra a coluna Total pago normalmente e avisa que falta rodar este arquivo para informar o valor do contrato
--   (as colunas Valor total do contrato e Saldo a pagar aparecem assim que ele for rodado). Se rodar o script antes de subir o site, as telas antigas seguem funcionando.
--   Se um dia rodar de novo o seguros-obs-tipo.sql (ou o seguros.sql antigo), rode este arquivo em seguida: ele devolve a Auditoria à versão completa.
-- =====================================================================

do $$
begin
  if to_regclass('public.seguros_empresas') is null or to_regclass('public.seguros_pagamentos') is null then
    raise exception 'Rode antes o seguros.sql: faltam as tabelas do relatório de Seguros.' using errcode = '55000';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seguros_empresas' and column_name = 'obs_tipos') then
    raise exception 'Rode antes o seguros-obs-tipo.sql (observação por tipo de seguro): este script continua a partir dele.' using errcode = '55000';
  end if;
end $$;

-- 1) A coluna e as funções de apoio ------------------------------------------------------------------------------
alter table public.seguros_empresas add column if not exists valor_contrato_tipos jsonb not null default '{}'::jsonb;

-- valores de contrato aceitáveis: um objeto { tipo: número } com até 20 tipos (1 a 60 caracteres cada) e valores em R$ maiores que zero, menores que 10 trilhões e com no máximo 2 casas
create or replace function public.seguros_valores_tipos_ok(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case when p is not null and jsonb_typeof(p) = 'object' then
           (select count(*) from jsonb_object_keys(p)) <= 20
           and not exists (select 1 from jsonb_each(p) e
                            where char_length(e.key) not between 1 and 60
                               or case when jsonb_typeof(e.value) = 'number'
                                       then (e.value #>> '{}')::numeric <= 0
                                         or (e.value #>> '{}')::numeric >= 10000000000000
                                         or (e.value #>> '{}')::numeric <> round((e.value #>> '{}')::numeric, 2)
                                       else true end)
         else false end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.seguros_empresas'::regclass and conname = 'seguros_empresas_valor_contrato_tipos_check') then
    alter table public.seguros_empresas
      add constraint seguros_empresas_valor_contrato_tipos_check check (public.seguros_valores_tipos_ok(valor_contrato_tipos));
  end if;
end $$;

-- limpa os valores de contrato de acordo com os tipos da empresa: fica UM valor (arredondado para 2 casas) para cada tipo que a empresa tem, gravado com a grafia do tipo;
-- o que sobra (tipo que a empresa não tem mais, valor null) é descartado. O que não for número fica como veio: a regra acima recusa. Maiúsculas/minúsculas não contam ao achar o tipo.
create or replace function public.seguros_valores_tipos_norm(p jsonb, p_tipos text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(t.t, v.v), '{}'::jsonb)
    from unnest(coalesce(p_tipos, array[]::text[])) as t(t)
    cross join lateral (
      select case when jsonb_typeof(e.value) = 'number' then to_jsonb(round((e.value #>> '{}')::numeric, 2)) else e.value end as v
        from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
       where jsonb_typeof(e.value) <> 'null' and (e.key = t.t or lower(e.key) = lower(t.t))
       order by (e.key = t.t) desc, e.key
       limit 1
    ) v;
$$;

comment on column public.seguros_empresas.valor_contrato_tipos is 'Seguros: valor total do contrato de cada tipo de seguro da empresa ({"Tipo": 1234.56}, em R$). Total pago = soma dos pagamentos do tipo; saldo a pagar = valor do contrato − total pago.';

-- 2) Gatilho: ANTES de gravar, depois do seguros_empresas_antes (que normaliza os tipos): o nome vem depois na ordem alfabética --------------
create or replace function public.seguros_empresas_valores_tipos()
returns trigger language plpgsql set search_path = public as $$
begin
  new.valor_contrato_tipos := public.seguros_valores_tipos_norm(new.valor_contrato_tipos, new.tipos);
  return new;
end;
$$;

drop trigger if exists trg_seguros_empresas_valores_tipos on public.seguros_empresas;
create trigger trg_seguros_empresas_valores_tipos
  before insert or update on public.seguros_empresas
  for each row execute function public.seguros_empresas_valores_tipos();

-- 3) Auditoria gravada pelo banco: agora também diz o valor do contrato de cada tipo, antes → depois ---------------------------------
create or replace function public.seguros_empresas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_login text; v_ev text; v_obs text; v_vc text; r public.seguros_empresas;
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
  -- cadastro e exclusão: os valores de contrato que a empresa tinha (na alteração, o antes → depois mais abaixo)
  if tg_op <> 'UPDATE' and r.valor_contrato_tipos <> '{}'::jsonb then
    select string_agg(e.key || ' ' || public.fmt_brl((e.value #>> '{}')::numeric), '; ' order by lower(e.key)) into v_vc from jsonb_each(r.valor_contrato_tipos) e;
    v_ev := v_ev || ' · contrato: ' || v_vc;
  end if;
  if tg_op = 'UPDATE' then
    if old.ativo  is distinct from new.ativo  then v_ev := v_ev || case when new.ativo then ' · reativada' else ' · inativada' end; end if;
    if old.codigo is distinct from new.codigo then v_ev := v_ev || ' (código antes: ' || old.codigo || ')'; end if;
    if old.cnpj   is distinct from new.cnpj   then v_ev := v_ev || ' (CNPJ antes: ' || public.fmt_cnpj(old.cnpj) || ')'; end if;
    if old.tipos  is distinct from new.tipos  then v_ev := v_ev || ' (tipos antes: ' || coalesce(nullif(array_to_string(old.tipos, ', '), ''), '—') || ')'; end if;
    -- valor do contrato: em cada tipo, o valor definido, alterado (antes → depois) ou removido (inclusive quando o tipo sai da empresa)
    if old.valor_contrato_tipos is distinct from new.valor_contrato_tipos then
      select string_agg(x.d, '; ' order by x.k) into v_vc
        from (select lower(coalesce(n.key, o.key)) as k,
                     case when o.key is null then n.key || ' definido em ' || public.fmt_brl((n.value #>> '{}')::numeric)
                          when n.key is null then o.key || ' removido (era ' || public.fmt_brl((o.value #>> '{}')::numeric) || ')'
                          else n.key || ' ' || public.fmt_brl((o.value #>> '{}')::numeric) || ' → ' || public.fmt_brl((n.value #>> '{}')::numeric) end as d
                from jsonb_each(old.valor_contrato_tipos) o
                full join jsonb_each(new.valor_contrato_tipos) n on lower(n.key) = lower(o.key)
               where (o.value #>> '{}')::numeric is distinct from (n.value #>> '{}')::numeric) x;
      if v_vc is not null then v_ev := v_ev || ' · contrato: ' || v_vc; end if;
    end if;
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
  -- até 1000 caracteres (a lista de tipos, os valores dos contratos e as observações alteradas podem ser longos; nos pagamentos o limite continua 200)
  insert into public.auditoria (usuario, evento) values (coalesce(v_login, 'sistema'), left(v_ev, 1000));
  return null;
end;
$$;

notify pgrst, 'reload schema';   -- a API enxerga a coluna nova na hora

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) a coluna e o gatilho existem (deve devolver 1 linha com coluna = true e gatilho = true):
--        select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seguros_empresas' and column_name = 'valor_contrato_tipos') as coluna,
--               exists (select 1 from pg_trigger where tgname = 'trg_seguros_empresas_valores_tipos' and not tgisinternal) as gatilho;
--   2) nenhum valor de contrato fora da regra (deve devolver 0):
--        select count(*) from public.seguros_empresas where not public.seguros_valores_tipos_ok(valor_contrato_tipos);
--   3) os mesmos números da tela, uma linha por empresa e tipo (valor do contrato, total pago e saldo a pagar):
--        select e.codigo, e.razao_social, t.tipo, (e.valor_contrato_tipos ->> t.tipo)::numeric as valor_contrato, coalesce(sum(p.valor), 0) as total_pago,
--               (e.valor_contrato_tipos ->> t.tipo)::numeric - coalesce(sum(p.valor), 0) as saldo_a_pagar
--          from public.seguros_empresas e
--          cross join lateral unnest(e.tipos) with ordinality as t(tipo, ord)
--          left join public.seguros_pagamentos p on p.empresa_id = e.id and lower(p.tipo) = lower(t.tipo)
--         group by e.id, e.codigo, e.razao_social, t.tipo, t.ord
--         order by e.codigo, t.ord;
