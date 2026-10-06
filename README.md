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
- **Linha do tempo (filtro da Visão executiva):** botão **🕒 Linha do tempo** na barra de filtros, ao lado de Ano e Mês. Mostra todos os meses da base: clique em até **2 meses** (não precisam ser seguidos) e o relatório existente — cartões, gráficos e tabela de fluxo — passa a mostrar só eles. Clique de novo para desmarcar, um 3º mês substitui o mais antigo e **Limpar** volta ao filtro de Ano/Mês (que fica desativado enquanto houver meses marcados). É só um filtro: não cria aba nem análise nova. Respeita a conta selecionada.
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
| REIDI | `bases` · `reidi` | Projeção Mensal de Compras REIDI.xlsx (abas "Resumo Executivo" e "Projeção de Compras") |
| Fluxo de Caixa Projetado | `bases` · `fluxo_projetado` | qualquer Excel |
| Boletim de Caixa | `bases` · `boletim_caixa` | qualquer Excel |

Nos módulos Fluxo de Caixa Projetado e Boletim o visualizador (js/core/baseview.js) lê todas as abas visíveis (a linha de cabeçalho é detectada sozinha), com busca, ordenação, totais de colunas numéricas, paginação e exportação para Excel; é a base para, depois, criar o relatório próprio de cada módulo mantendo BASE.ler/BASE.gravar. Pré-requisito no Supabase: rodar uma vez `supabase/bases-dados.sql`.

## REIDI · Projeção Mensal de Compras
Módulo `js/modulos/reidi.js`. Três telas: **Resumo Executivo**, **Análise Financeira** e **Projeção de Compras**, com o filtro de data base no topo.
- **Calendário:** compras previstas do dia 1 ao 15 são pagas no dia 15; do 16 ao fim do mês, no último dia do mês. A transferência para a Belov Obras é feita **3 dias antes** (parâmetros editáveis: data de referência, horizonte, antecedência e dia da 1ª quinzena). Alerta quando o pagamento ou a transferência cai em fim de semana ou feriado nacional, com a sugestão de dia útil.
- **Valor a transferir** = máx(0; arredondar para cima((total das compras − saldo em C/C Belov Obras) ÷ 5.000) × 5.000). **Regra fixa:** o total e cada transferência são sempre múltiplos de R$ 5.000, por isso o valor transferido é igual ou maior que o da base (a tela mostra "compras → arredondado (+ diferença)"; o PDF e o Excel trazem o mesmo detalhe). Repartido por data de pagamento (o saldo cobre primeiro a 1ª quinzena). O **saldo em C/C Belov Obras (Santander)** é um campo digitável (começa com o valor da planilha; vale só no navegador de quem digitou e é zerado quando o admin publica uma base nova).
- **Resumo Executivo (visão executiva, enxuta):** 3 indicadores (valor das compras, economia REIDI, nº de compras), gráfico de barras **por quinzena** (valor das compras × valor a transferir), cartão do **valor a transferir** com o campo de saldo e as datas de cada transferência, e os 3 principais pontos de atenção. Ficam recolhidos: "Ver todos" (demais alertas), "Mais análises" (fornecedor, economia real × teórica, responsável) e "Parâmetros do período".
- **Análise Financeira (ganho com o REIDI):** alternância *Período* / *Toda a base*; 4 indicadores (sem REIDI, com REIDI, ganho em R$ e %, aproveitamento real ÷ teórica); gráfico de barras **Sem REIDI × Com REIDI por quinzena**; cartão **Caixa preservado** (transferência sem REIDI × com REIDI, ambas em múltiplos de R$ 5.000) com leitura rápida; gráfico de economia real × teórica por fornecedor; e, recolhido, o detalhe por fornecedor com a coluna "A capturar" (economia teórica − real, potencial de negociação). Também sai na aba "Análise Financeira" do Excel.
- **Data base de atualização (coluna O da planilha):** cada linha pertence a uma "foto" do planejamento. O filtro **Data base de atualização** (topo das telas) escolhe qual foto analisar — padrão: a mais recente; "Todas" soma todas. Para registrar um novo mês, **acrescente linhas** com a nova data (ex.: 01/11/2026) e mantenha as antigas; atualize também a *Data de referência* na aba Resumo Executivo.
- **Projeção de Compras:** tabela com filtros (categoria, responsável, data de pagamento, busca, só horizonte), ordenação, totais e Excel.
- **Responsáveis:** não aparecem na tela. Só no **Termo para assinatura** (botão do admin): PDF com Resumo Executivo + Projeção de Compras e o bloco de responsáveis (Elaboração, Conferência e Atesto da Diretoria), editáveis na janela de geração.
- **Atualização:** o admin clica em **⬆ Atualizar base** e escolhe a planilha (colunas lidas: FORNECEDOR, DATA BASE ATUALIZAÇÃO, ITEM/DESCRIÇÃO, CATEGORIA, Nº PEDIDO/PROCESSO/NF, DATA PAGAMENTO PREVISTA, % DE PIS E COFINS, RESPONSÁVEL, VALOR ORIGINAL, VALOR APÓS NEGOCIAÇÃO REIDI; e na aba Resumo Executivo: Documento nº, Data de referência, Horizonte, Saldo em C/C e responsáveis).

## Segurança
- A service_role fica SÓ nos secrets da Edge Function; nunca no frontend nem no GitHub. O navegador usa URL + chave pública.
- O navegador só lê public.perfis (RLS); criar, editar, redefinir senha, ativar/desativar e excluir passam pela Edge Function, que exige sessão e perfil papel=admin e ativo.
- Regras: sempre ao menos um admin ativo; admin não altera/desativa/exclui a si mesmo; login ^[a-z0-9._-]{3,30}$; senha mín. 8 com letra e número; ações registradas em public.auditoria.
- Login no site: digite o usuário (ex.: admin) — vira admin@DOMAIN — ou o e-mail completo.

## Planilha e Termo
Upload (só admin) aceita a planilha Memória de Cálculo (abas Faturamento, NNN-AAAA_Memória, NNN-AAAA). O Termo para assinatura tem 2 páginas (1ª solicitação, 2ª memória/apuração). Documento nº sequencial por Data_Base dentro do ano. O (-) Desconto Adiantamento aparece negativo.
