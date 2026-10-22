-- =====================================================================
-- REIDI · ALÍQUOTA DE PIS/COFINS (3,65% ou 9,25%)  (rode UMA vez; seguro rodar de novo)
-- O campo "% de PIS e COFINS" volta a guardar a ALÍQUOTA (3,65% ou 9,25%), escolhida pelo lançador.
-- A economia TEÓRICA é calculada pelo site: valor original × alíquota × 90%.
-- Compras lançadas antes (com 3,285% / 3,29% / 8,325% / 8,33%, que já tinham o 90% embutido) voltam para a alíquota.
-- O valor após negociação (economia REAL) NÃO é alterado.
-- =====================================================================
update public.reidi_compras set pc = 0.0365 where pc between 0.03 and 0.05 and pc <> 0.0365;
update public.reidi_compras set pc = 0.0925 where pc between 0.08 and 0.10 and pc <> 0.0925;

-- conferência:
--   select pc, count(*) from public.reidi_compras group by pc order by pc;
