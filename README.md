# Gestão Financeira CSD · Fundo de Reserva

Site estático (HTML + JS) com autenticação, perfis e administração de usuários no **Supabase**. Sem build: abra o index.html ou publique no GitHub Pages.

## Estrutura
- index.html — telas · js/core: logo, app (utilitários), config.js (URL e chave pública do Supabase), supabase.js (cliente único + chamada à Edge Function), main.js (menu, tema, login, sessão)
- js/core/base.js e baseview.js — base compartilhada dos módulos (Supabase) e visualizador genérico de planilha
- js/modulos: fundo_reserva, usuarios (Supabase), reidi, fluxo_caixa (Fluxo de Caixa Projetado), boletim_caixa, dashboard
- supabase/schema-consorcio-santadulce.sql, dashboard-dados.sql, bases-dados.sql e functions/admin-usuarios/index.ts — banco (RLS), bases e Edge Function administrativa
- dados/ — modelo do Termo (PDF). **Planilhas com valores reais não ficam no repositório** (ver "Atualização das bases").

## Configuração (uma vez)
1. **Admin no Auth:** Supabase → Authentication → Users → Add user → Create new user: e-mail **admin@consorciosantadulce.com.br**, senha forte, marque **Auto Confirm User**.
2. **Banco:** SQL Editor → cole supabase/schema-consorcio-santadulce.sql → Run. Ele cria tabelas, RLS e funções, e cadastra o perfil admin (papel=admin, ativo=true, mc=false). A conferência final deve listar o admin.
3. **Edge Function:** publique supabase/functions/admin-usuarios/index.ts como admin-usuarios. Secrets: **EMAIL_DOMAIN=consorciosantadulce.com.br** e ALLOWED_ORIGIN (origem do site, ex.: https://SEU-USUARIO.github.io, sem caminho).
4. **Frontend:** js/core/config.js já aponta para a URL do projeto, a chave publishable e DOMAIN=consorciosantadulce.com.br. (.env.example documenta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, equivalentes a URL / KEY do config.js.)

## Dashboard (Fluxo de Caixa Realizado)
Módulo `js/modulos/dashboard.js` (menu **Dashboard**), interativo, com 3 telas e um **parâmetro de conta**:
- **Conta (parâmetro):** a Visão executiva e a Saída · Fornecedores abrem na **conta principal** (1ª linha da aba CONTA_BANCARIA, hoje 13010565 · Santander ag. 3324); o seletor "Conta" troca para outra conta ou "Todas as contas". A aba **Saldos** sempre mostra todas as contas. Com a conta principal, o Saldo Final de caixa fecha em 0,00.
- **Visão executiva:** cartões, Entradas e Saídas por mês, saldo aplicado (líquido de IR), tabela de fluxo (ENTRADA, SAÍDAS, TRANSFERÊNCIAS ENTRE CONTAS — por conta de origem/destino — e SALDO FINAL por categoria e mês) e gráficos de investimentos e entradas. Clique nos cartões, nos valores da tabela ou nas barras para abrir a janela de lançamentos com histórico (busca, exportação para Excel). Filtros de Ano e Mês (clique no mês do cabeçalho também filtra); SALDO FINAL só fica vermelho quando o mês termina negativo; ▾/▸ recolhe ENTRADA e SAÍDAS.
- **Saldos:** só a tabela dinâmica **Contas bancárias** (todas as contas) que respeita o Ano/Mês escolhido: a linha da conta mostra o saldo no fim do período (CONTA CORRENTE, APLICADO = saldo final de CDB, COMPROMISSADA e CONTAMAX líquido de IR, e SALDO TOTAL). ▸ expande o que ocorreu naquele período: Saldo inicial + Entradas, Saídas, Aplicação, Transferências entre contas (Para/De: nome da conta) = saldo final, e Saldo no Investimento por produto. "Expandir tudo / Recolher tudo"; clique no valor abre os lançamentos; "fluxo ↗" abre a Visão executiva da conta.
- **Nome das contas:** na aba CONTA_BANCARIA, acrescente uma coluna **NOME** (ex.: BEOP, Fundo de Reserva; também aceita TITULAR, APELIDO ou DESCRIÇÃO). O nome aparece no seletor de conta, na tabela de Saldos e nas transferências.
- **Classe da conta:** a tabela de Saldos mostra a coluna CLASSE (Principal, Fundo Reserva, Beop). Preencha na aba CONTA_BANCARIA com uma coluna **CLASSE** (ou use a coluna CLASSE CONTA dos lançamentos); sem preenchimento, usa a ordem da aba: 1ª conta Principal, 2ª Fundo Reserva, 3ª Beop. As transferências aparecem como "Para: conta - classe" / "De: conta - classe".
- **Ano/Mês:** ao abrir e a cada Upload o painel seleciona o ano atual; a Visão executiva abre com Mês = Todos e as demais abas (Saldos e Fornecedores) abrem no último mês disponível. Cada aba lembra o mês escolhido.
- **Saída · Fornecedores:** (abre com o ano atual e Mês = Todos; escolha um mês se quiser) cartões TOTAL SAÍDAS e PAGAMENTOS (COM TÍTULO), busca por fornecedor/histórico, filtro Categoria Tipo (filtra também a tabela CATEGORIA TIPO), tabela por categoria (⊞ expande fornecedores), gráfico de fornecedores e tabela de lançamentos (TIPO, TÍTULO, PARCELA, FORNECEDOR, VALOR, HISTÓRICO, DATA DO PAGAMENTO, CATEGORIA SERVIÇO; ordenável; clique na linha abre o detalhe). Clique em fornecedor, categoria ou barra para filtrar tudo; clique de novo ou no ✕ para limpar. Regra fixa: nunca inclui Distribuição Antecipada (natureza 2.9008 ou categoria Distribuição Antecipada — CTC, Carioca e Belov), nem investimentos e transferências (igual ao Power BI); "pagamentos" conta os lançamentos com número de título.
Filtros de Ano/Mês. **Base compartilhada (Supabase):** o administrador clica em **⬆ Atualizar base** e escolhe a planilha `BASE_FLUXO_DE_CAIXA_REALIZADO.xlsx` (abas "Contas a Receber (Realizado)", "Contas a Pagar (Realizado)", "INVESTIMENTO", "CONTA_BANCARIA" e "Plano de Naturezas"). O painel lê a planilha no navegador e publica o resultado na tabela `public.dashboard_dados`; todos os usuários passam a ver essa base ao abrir o Dashboard (aparece "Base publicada em data · arquivo"). Só admin grava (RLS); usuários ativos só leem. Pré-requisito: rodar uma vez `supabase/dashboard-dados.sql`. Nenhum dado financeiro fica no código nem no GitHub.
Regras: Entradas = Contas a Receber; Saídas = Contas a Pagar; Investimentos (CDB, COMPROMISSADA, CONTAMAX) ficam fora de Entradas/Saídas. As Transferências entre contas seguem a coluna **CATEGORIA FLUXO DE CAIXA** da aba Plano de Naturezas: com Transferência de Entrada = Entrada e Transferência de Saída = Saídas (atual), contam como Entrada e Saída (detalhadas como "Para/De: conta - classe"); se a coluna voltar a ser Transferências, o painel volta a mostrá-las em bloco próprio. Nunca entram em Saída · Fornecedores. Na aba Saldos continuam em grupo próprio; Saldo Final de caixa = Saldo Inicial + Entradas − Saídas − variação aplicada + transferências; Saldo aplicado = aplicações + rendimentos − resgates − IR sobre resgate.

## Atualização das bases (todos os módulos, mesmo fluxo)
1. Mantenha as planilhas-mestre na **pasta local** do seu computador (no ZIP: `base-local-NAO-SUBIR-NO-GITHUB/`, uma subpasta por módulo). Nunca envie essa pasta ao GitHub.
2. Insira os novos dados nas linhas do Excel e salve.
3. No site, como **admin**, abra o módulo e clique em **⬆ Atualizar base** (Dashboard, Fundo de Reserva) ou **⬆ Atualizar base** (REIDI, Fluxo de Caixa Projetado, Boletim de Caixa). A planilha é lida no navegador e publicada no Supabase; aparece "✔ Publicado para todos os usuários".
4. Os demais usuários (login ativo) veem a base nova ao abrir ou reabrir o módulo. Sem login, o link mostra apenas a tela de entrada.

| Módulo | Tabela / chave | Planilha |
|---|---|---|
| Dashboard | `dashboard_dados` (id 1) | BASE_FLUXO_DE_CAIXA_REALIZADO.xlsx (abas fixas) |
| Fundo de Reserva | `bases` · `fundo_reserva` | Apuração (aba de faturamento + aba Memória) |
| REIDI | `bases` · `reidi` | qualquer Excel: cada aba vira uma tabela |
| Fluxo de Caixa Projetado | `bases` · `fluxo_projetado` | qualquer Excel |
| Boletim de Caixa | `bases` · `boletim_caixa` | qualquer Excel |

Nos módulos REIDI, Fluxo de Caixa Projetado e Boletim o visualizador (js/core/baseview.js) lê todas as abas visíveis (a linha de cabeçalho é detectada sozinha), com busca, ordenação, totais de colunas numéricas, paginação e exportação para Excel; é a base para, depois, criar o relatório próprio de cada módulo mantendo BASE.ler/BASE.gravar. Pré-requisito no Supabase: rodar uma vez `supabase/bases-dados.sql`.

## Segurança
- A service_role fica SÓ nos secrets da Edge Function; nunca no frontend nem no GitHub. O navegador usa URL + chave pública.
- O navegador só lê public.perfis (RLS); criar, editar, redefinir senha, ativar/desativar e excluir passam pela Edge Function, que exige sessão e perfil papel=admin e ativo.
- Regras: sempre ao menos um admin ativo; admin não altera/desativa/exclui a si mesmo; login ^[a-z0-9._-]{3,30}$; senha mín. 8 com letra e número; ações registradas em public.auditoria.
- Login no site: digite o usuário (ex.: admin) — vira admin@DOMAIN — ou o e-mail completo.

## Planilha e Termo
Upload (só admin) aceita a planilha Memória de Cálculo (abas Faturamento, NNN-AAAA_Memória, NNN-AAAA). O Termo para assinatura tem 2 páginas (1ª solicitação, 2ª memória/apuração). Documento nº sequencial por Data_Base dentro do ano. O (-) Desconto Adiantamento aparece negativo.
