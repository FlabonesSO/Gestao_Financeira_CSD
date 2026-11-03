-- =====================================================================
-- REIDI · IMPORTAR PLANILHA (EXCEL) PARA A TABELA DE COMPRAS  (rode UMA vez; é seguro rodar de novo)
-- Pré-requisito: reidi-lancamentos.sql já rodado.
--
-- NO SITE: Projeção de Compras REIDI → ⬆ Importar planilha. O Excel (modelo "Projeção Mensal de Compras REIDI") é lido no próprio
-- navegador; o site mostra uma PRÉVIA (novas · já estão na tabela · com erro) e, ao confirmar, as compras novas sobem para
-- public.reidi_compras numa única gravação (tudo ou nada). O que já está na tabela não é duplicado.
-- Quem pode importar: quem pode incluir compras (administrador e Lançador REIDI) — as mesmas regras de acesso de "＋ Incluir compra".
--
-- O QUE ESTE SCRIPT FAZ (uma coisa só)
--   O RESPONSÁVEL de cada compra é o nome do cadastro de quem lançou, gravado pelo banco. A partir daqui há uma exceção: o ADMINISTRADOR,
--   ao importar, mantém a coluna RESPONSÁVEL do Excel (o comprador de cada compra). Linha sem responsável fica com o nome de quem importou.
--   O Lançador nunca consegue informar outro: o banco grava sempre o nome dele.
--   Não cria nem apaga tabela, dado ou regra de acesso: só atualiza a função de carimbo (reidi_compras_carimbo).
--
-- Se o site novo subir ANTES deste script, a importação funciona do mesmo jeito, mas todas as compras importadas ficam com o responsável =
-- nome de quem importou (e o site avisa na hora que falta rodar este arquivo).
-- =====================================================================

-- 0) Pré-requisitos ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.reidi_compras') is null then
    raise exception 'Rode antes o reidi-lancamentos.sql: falta a tabela de compras do REIDI.' using errcode = '55000';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Rode antes o schema-consorcio-santadulce.sql: falta a função is_admin().' using errcode = '55000';
  end if;
end $$;

-- 1) Carimbo: responsável = quem lançou (o administrador pode informar outro); autor e responsável preservados na edição -----
create or replace function public.reidi_compras_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
    -- responsável = nome do cadastro de quem lançou; só o ADMINISTRADOR pode informar outro (importação do Excel)
    new.responsavel     := case when public.is_admin() and nullif(btrim(new.responsavel), '') is not null then btrim(new.responsavel)
                                else coalesce(nullif(btrim(v_nome), ''), new.responsavel, '') end;
  else
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
    new.responsavel     := old.responsavel;
  end if;
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := coalesce(v_nome, new.atualizado_por_nome);
  new.atualizado_em       := now();
  return new;
end;
$$;

drop trigger if exists trg_reidi_compras_carimbo on public.reidi_compras;
create trigger trg_reidi_compras_carimbo
  before insert or update on public.reidi_compras
  for each row execute function public.reidi_compras_carimbo();

-- Conferência (rode separado, uma consulta por vez — o editor mostra só o resultado da última):
--   1) o carimbo está com a regra nova (deve devolver true):
--        select prosrc like '%is_admin()%' as regra_nova from pg_proc where proname = 'reidi_compras_carimbo';
--   2) as últimas gravações em lote (uma importação = mesma data/hora e mesmo autor):
--        select criado_em, criado_por_nome, count(*) as compras, sum(valor_negociado) as negociado
--          from public.reidi_compras group by criado_em, criado_por_nome order by criado_em desc limit 10;
