-- =====================================================================
-- REIDI · PERCENTUAL APLICADO POR CÁLCULO REVERSO  (OPCIONAL · rode UMA vez; seguro rodar de novo)
--
-- Nova metodologia: o comprador NEGOCIA com o fornecedor e digita só o Valor Original e o Valor Negociado.
--   economia REAL        = valor_original − valor_negociado
--   % aplicado (reverso) = (1 − valor_negociado ÷ valor_original) ÷ 90%
--   alíquota de REFERÊNCIA (coluna pc) = a mais próxima entre 3,65% e 9,25%  (limite entre as duas: 6,45%)
--   economia TEÓRICA     = valor_original × pc × 90%
--
-- O site já recalcula tudo isso na tela a partir dos dois valores, então este script é só para deixar a coluna pc
-- do banco igual ao que o site mostra nas compras lançadas ANTES desta versão (quando o lançador escolhia a alíquota).
-- Os valores original e negociado NÃO são alterados. O carimbo de "atualizado por/em" também não (o gatilho é desligado só durante o ajuste).
-- =====================================================================
alter table public.reidi_compras disable trigger trg_reidi_compras_carimbo;

update public.reidi_compras
   set pc = case when valor_original > 0 and (1 - valor_negociado / valor_original) / 0.9 >= 0.0645 then 0.0925 else 0.0365 end
 where pc is distinct from case when valor_original > 0 and (1 - valor_negociado / valor_original) / 0.9 >= 0.0645 then 0.0925 else 0.0365 end;

alter table public.reidi_compras enable trigger trg_reidi_compras_carimbo;

-- conferência (percentual aplicado × alíquota de referência de cada compra):
--   select fornecedor, valor_original, valor_negociado,
--          round((1 - valor_negociado / nullif(valor_original, 0)) / 0.9 * 100, 2) as pct_aplicado, pc
--     from public.reidi_compras order by data_prevista;
