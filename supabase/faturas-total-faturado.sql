-- =====================================================================
-- FATURAS EMITIDAS · card "Total Faturado" para o perfil Faturamento
-- Rode UMA vez no SQL Editor do Supabase (é seguro rodar de novo).
-- Pré-requisito: faturas-emitidas.sql (cria public.pode_ver_faturas()) e bases-dados.sql.
--
-- O card "Total Faturado" soma a coluna "Total Faturado" da planilha do Fundo de Reserva (base publicada)
-- e mostra o "Numero do Titulo" como referência. Administrador e visualizador leem a base direto.
-- O perfil Faturamento NÃO lê a tabela public.bases (de propósito: ela tem impostos, adiantamentos e as demais bases);
-- por isso esta função devolve a ele SOMENTE: Data_Base, Nº do título, Total Faturado e quando a base foi publicada.
-- Sem este script o card continua funcionando para admin e visualizador; para o Faturamento ele mostra "indisponível".
-- Bases publicadas antes da coluna "Total Faturado" valem pelo Valor Bruto.
-- =====================================================================

create or replace function public.faturado_por_competencia()
returns table (data_base date, numero_titulo text, total_faturado numeric, atualizado_em timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.pode_ver_faturas() then      -- admin, visualizador e faturamento (o Lançador REIDI não)
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select
    case when (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' then (e.item ->> 'd')::date end,
    btrim(coalesce(e.item ->> 'titulo', '')),
    coalesce(case when (e.item ->> 'tf')    ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$' then (e.item ->> 'tf')::numeric    end,
             case when (e.item ->> 'bruto') ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$' then (e.item ->> 'bruto')::numeric end,
             0),
    b.atualizado_em
  from public.bases b
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(b.dados -> 'd') = 'array' then b.dados -> 'd' else '[]'::jsonb end
  ) as e(item)
  where b.chave = 'fundo_reserva'
    and jsonb_typeof(e.item) = 'object'
    and (e.item ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$'
  order by 1;
end;
$$;

revoke execute on function public.faturado_por_competencia() from public, anon;
grant  execute on function public.faturado_por_competencia() to authenticated;

-- Conferência (rode separado): a função deve aparecer na lista
--   select proname, prosecdef from pg_proc where proname = 'faturado_por_competencia';
