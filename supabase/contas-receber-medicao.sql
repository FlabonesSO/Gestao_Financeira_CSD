-- =====================================================================
-- CONTAS A RECEBER · planilha MEDICAO_SERVICO (aba "BASE DE MEDICAO")
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: contas-receber.sql já instalado (para instalação nova, o próprio contas-receber.sql já traz esta função).
--
-- O que muda: a função contas_a_receber_base() passa a devolver, além das colunas de antes, Retenção Contratual, Retenção ISS, Retenção INSS e a
-- Data prevista de pagamento. "A receber" = Valor Líquido da planilha. Os recebimentos já lançados continuam ligados à Data_Base (nada é apagado).
-- Sem este script o site continua funcionando (o A Receber já usa o Valor Líquido), mas as colunas novas aparecem como "—".
-- =====================================================================

-- data de dentro do JSON ('AAAA-MM-DD'); qualquer outra coisa (ou data que não existe, ex.: 2026-02-31) vira nulo, sem erro
create or replace function public.jsonb_data(j jsonb)
returns date language plpgsql immutable set search_path = public as $$
begin
  if j is null or jsonb_typeof(j) <> 'string' or (j #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return (j #>> '{}')::date;
exception when others then
  return null;
end;
$$;

-- O faturamento vem da base publicada do Fundo de Reserva, lida da aba "BASE DE MEDICAO" da planilha MEDICAO_SERVICO (só as NFs com DOC FISCAL):
--   data_base            = DATA EMISSAO NF            numero_titulo       = DOC FISCAL (texto, com zeros à esquerda)
--   total_faturado       = Valor Bruto (NF)           retencao_contratual = Retenção Contratual (valor positivo)
--   adiantamento         = Valor Desconto Adiantamento (positivo)
--   retencao_iss / retencao_inss = Retenção: ISS / INSS (positivos)      impostos = ISS + INSS
--   saldo_cliente        = Valor Líquido (é o "A receber": Valor Bruto − retenção contratual − desconto do adiantamento − ISS − INSS)
--   data_prevista        = DATA PREVISTA DE PAGAMENTO
-- Bases publicadas ANTES da BASE DE MEDICAO continuam funcionando: retenção contratual = 0, data prevista vazia e o saldo vale o Saldo a Receber que já estava publicado.
drop function if exists public.contas_a_receber_base();
create function public.contas_a_receber_base()
returns table (data_base date, numero_titulo text, total_faturado numeric, impostos numeric, liquido numeric,
               adiantamento numeric, saldo_cliente numeric, atualizado_em timestamptz,
               retencao_contratual numeric, retencao_iss numeric, retencao_inss numeric, data_prevista date)
language plpgsql security definer stable set search_path = public as $$
begin
  if to_regprocedure('public.tem_permissao(text)') is not null then
    if not public.tem_permissao('receber.ver') then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
  elsif not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select x.d,
         x.titulo,
         round(coalesce(nullif(x.tf, 0), x.bruto, x.tf, 0), 2),
         round(coalesce(x.ret, 0), 2),
         round(x.liq, 2),
         round(coalesce(x.adi, 0), 2),
         round(coalesce(x.vl, nullif(x.sal, 0), x.liq - coalesce(x.adi, 0)), 2),
         x.atualizado_em,
         round(coalesce(x.rc, 0), 2),
         round(coalesce(x.iss, 0), 2),
         round(coalesce(x.inss, 0), 2),
         x.dp
  from (
    select case when (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' then (e.item ->> 'd')::date end as d,
           btrim(coalesce(e.item ->> 'titulo', '')) as titulo,
           public.jsonb_numero(e.item -> 'tf')    as tf,
           public.jsonb_numero(e.item -> 'bruto') as bruto,
           public.jsonb_numero(e.item -> 'ret')   as ret,
           coalesce(nullif(public.jsonb_numero(e.item -> 'liq'), 0),
                    coalesce(public.jsonb_numero(e.item -> 'bruto'), 0) - coalesce(public.jsonb_numero(e.item -> 'ret'), 0)) as liq,
           public.jsonb_numero(e.item -> 'adi')   as adi,
           public.jsonb_numero(e.item -> 'vl')    as vl,
           public.jsonb_numero(e.item -> 'sal')   as sal,
           public.jsonb_numero(e.item -> 'rc')    as rc,
           public.jsonb_numero(e.item -> 'iss')   as iss,
           public.jsonb_numero(e.item -> 'inss')  as inss,
           public.jsonb_data(e.item -> 'dp')      as dp,
           b.atualizado_em
    from public.bases b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.dados -> 'd') = 'array' then b.dados -> 'd' else '[]'::jsonb end
    ) as e(item)
    where b.chave = 'fundo_reserva'
      and jsonb_typeof(e.item) = 'object'
      and (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$'
  ) x
  order by x.d;
end;
$$;
revoke execute on function public.contas_a_receber_base() from public, anon;
grant  execute on function public.contas_a_receber_base() to authenticated;

-- Conferência (rode separado):
--   select pg_get_function_result('public.contas_a_receber_base'::regproc);   -- deve listar 12 colunas, terminando em retencao_inss numeric, data_prevista date
-- A função só responde a usuário LOGADO NO SITE com a permissão receber.ver (ou administrador). No SQL Editor não existe usuário logado e ela devolve
-- "42501 Sem permissão": é o esperado, não é falha da instalação. Para conferir os valores, abra a tela Contas a Receber logado no site.
