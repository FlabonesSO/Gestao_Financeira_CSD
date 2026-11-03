-- =====================================================================
-- REIDI · STATUS DE PAGAMENTO DAS COMPRAS ("A pagar" / "Pago")  (rode UMA vez; seguro rodar de novo)
-- As compras já lançadas ficam como "A pagar".
-- =====================================================================
alter table public.reidi_compras
  add column if not exists status text not null default 'A pagar'
  check (status in ('Pago', 'A pagar'));
