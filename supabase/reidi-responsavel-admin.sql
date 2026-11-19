-- =====================================================================
-- REIDI · O ADMINISTRADOR TROCA O RESPONSÁVEL AO EDITAR A COMPRA  (rode UMA vez; é seguro rodar de novo)
-- Pré-requisito: reidi-lancamentos.sql já rodado (e, de preferência, reidi-importar.sql).
--
-- NO SITE: Projeção de Compras REIDI → ＋ Incluir compra / Editar. Para o administrador, o campo "De quem é o lançamento?" é uma lista
-- (cadastros ativos + responsáveis que já constam nas compras) e a resposta é obrigatória: o lançamento não fica com o nome do
-- administrador só porque ele digitou. A tabela ganhou a coluna Responsável.
--
-- O QUE ESTE SCRIPT FAZ (uma coisa só)
--   Até aqui o banco gravava o responsável na INCLUSÃO (o administrador podia informar outro) e NUNCA o alterava depois.
--   A partir daqui, ao EDITAR, o ADMINISTRADOR também pode trocar o responsável. Todo o resto continua igual:
--     • o Lançador não informa nem troca responsável (o banco grava o nome do cadastro dele na inclusão e o preserva na edição);
--     • o autor (criado_por) e a data de criação continuam preservados: trocar o responsável NÃO muda quem pode editar/excluir a compra
--       (o Lançador continua mexendo só no que ele mesmo lançou);
--     • edição do administrador sem responsável informado (ou em branco) mantém o que já estava gravado.
--   Não cria nem apaga tabela, dado ou regra de acesso: só atualiza a função de carimbo (reidi_compras_carimbo).
--
-- Se o site novo subir ANTES deste script, tudo funciona, mas o banco continua guardando o responsável anterior ao editar
-- (o site avisa na hora que falta rodar este arquivo).
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

-- 1) Carimbo: responsável = quem lançou (o administrador pode informar outro, ao incluir e ao editar); o autor é preservado na edição -----
create or replace function public.reidi_compras_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(v_nome, new.criado_por_nome);
    new.criado_em       := now();
    -- responsável = nome do cadastro de quem lançou; só o ADMINISTRADOR pode informar outro (importação do Excel ou "De quem é o lançamento?")
    new.responsavel     := case when public.is_admin() and nullif(btrim(new.responsavel), '') is not null then btrim(new.responsavel)
                                else coalesce(nullif(btrim(v_nome), ''), new.responsavel, '') end;
  else
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
    -- ao editar: o ADMINISTRADOR pode trocar o responsável; para todos os outros (e sem nome informado) vale o que já estava gravado
    new.responsavel     := case when public.is_admin() and nullif(btrim(new.responsavel), '') is not null then btrim(new.responsavel)
                                else old.responsavel end;
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
--        select prosrc like '%else old.responsavel end%' as regra_nova from pg_proc where proname = 'reidi_compras_carimbo';
--   2) responsável de cada compra e quem a lançou:
--        select fornecedor, data_prevista, responsavel, criado_por_nome, atualizado_por_nome
--          from public.reidi_compras order by data_prevista, fornecedor;
