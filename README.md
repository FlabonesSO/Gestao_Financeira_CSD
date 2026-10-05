# Gestão Financeira CSD · Fundo de Reserva

Aplicação 100% local em um único arquivo HTML. Não precisa de servidor nem instalação.

## Estrutura da pasta

```
gestao-financeira-csd/
├── index.html                 ← abra este arquivo (duplo clique)
├── README.md                  ← este guia
├── js/
│   ├── core/                  ← base do sistema
│   │   ├── logo.js            ← logo embutida (base64)
│   │   ├── config.js          ← URL e chave anon do Supabase
│   │   ├── app.js             ← utilitários comuns a todos os módulos ($, f, p, br, N)
│   │   └── main.js            ← menu lateral (MODS), tema, login e inicialização (carrega por último)
│   └── modulos/               ← um arquivo por módulo
│       ├── fundo_reserva.js   ← Fundo de Reserva (planilha, dashboard, exportações, Termo PDF)
│       ├── usuarios.js        ← Usuários
│       ├── reidi.js           ← REIDI (hoje: "Em Desenvolvimento")
│       ├── fluxo_caixa.js     ← Fluxo de Caixa (hoje: "Em Desenvolvimento")
│       └── boletim_caixa.js   ← Boletim de Caixa (hoje: "Em Desenvolvimento")
├── assets/
│   └── logo-csd.png
└── dados/                     ← arquivos-base, uma pasta por relatório
    ├── fundo_reserva/
    │   ├── Apuracao_Fundo_de_Reserva.xlsx   ← base de dados (use no Upload)
    │   └── modelo_layout_termo.pdf          ← layout de referência do Termo
    ├── reidi/                 ← (vazia, para a base do REIDI)
    ├── fluxo_caixa/           ← (vazia, para a base do Fluxo de Caixa)
    └── boletim_caixa/         ← (vazia, para a base do Boletim de Caixa)
```

## Acessos e usuários (Supabase)

Os usuários ficam no **Supabase** (Auth + tabela `perfis`): criar, trocar senha, ativar/desativar e excluir valem na hora em qualquer navegador.
Configuração completa em `supabase/CONFIGURAR.md`.

- Senhas: hash bcrypt no servidor; mínimo 8 caracteres, com letras e números. Limite de tentativas feito pelo Supabase.
- Perfis: `admin` (tudo, inclusive Usuários) e `viewer` (consulta e exporta). A tabela `perfis` é protegida por RLS; criação/redefinição/exclusão passam pela Edge Function `admin-usuarios`.
- Sessão por aba; expira após 30 min sem uso. Sempre existe ao menos um administrador ativo.
- Auditoria: tabela `auditoria` (últimos 15 eventos na tela Usuários).
- `js/core/config.js` guarda URL e chave **anon** (pública). A chave `service_role` nunca vai para o site.
- O antigo `usuarios.json` foi removido: apague-o do repositório.
## Como usar

1. Abra o `index.html` com duplo clique (as pastas `js/`, `assets/` e `dados/` devem ficar junto dele) (Chrome, Edge ou Firefox).
2. Faça login (veja abaixo).
3. Escolha a **Data_Base** na lista suspensa: KPIs, gráficos, rankings, comparativo e tabela são atualizados.
4. Para carregar novos períodos, use **Upload** (somente administrador) e selecione um `.xlsx`, `.xls` ou `.csv` (a base atual está em `dados/fundo_reserva/Apuracao_Fundo_de_Reserva.xlsx`).

> É necessária conexão com a internet na primeira abertura para carregar as bibliotecas por CDN
> (Tailwind CSS, Chart.js + datalabels, SheetJS, jsPDF).

## Formato esperado da planilha

**Aba "Faturamento"** (ou a primeira aba / arquivo CSV), uma linha por Data_Base, com as colunas:

`Data_Base`, `Valor Total das Deduções (R$)`, `Base de Cálculo (R$)`, `Alíquota (%)`, `Valor do ISS (R$)`,
`Crédito Nota Salvada (R$)`, `Valor INSS (R$)`, `Valor PIS (R$)`, `Valor COFINS (R$)`, `Valor IR (R$)`,
`Contribuições Sociais (R$)`, `Outras Retenções (R$)`, `Valor Líquido (R$)`,
`(-) DEDUÇÃO DO ADIANTAMENTO`, `SALDO A RECEBER DO CLIENTE`

**Aba "Recebimento e Reserva"** (opcional): lida para obter `Valor Bruto da Nota`, `Retenções e Tributos`
e `Valor Já Adiantado` por Data_Base, além do nº do documento e dos nomes dos responsáveis.
Sem essa aba, o bruto é calculado como Deduções + Base de Cálculo.
A dedução do adiantamento e o saldo a receber são lidos da aba "Faturamento"; se a coluna não existir ou estiver zerada,
o adiantamento é buscado nesta aba e o saldo é calculado (Líquido − Adiantamento).

## Planilha-modelo atual (Memória de Cálculo)

Use `dados/fundo_reserva/Memoria_de_Cálculo_Fundo_de_Reserva_001_2026.xlsx` no Upload. O sistema lê: aba **Faturamento** (valores), aba **NNN-AAAA_Memória** (Impostos, (−) Desconto Adiantamento, nº do documento e taxa do Fundo de Reserva) e aba **NNN-AAAA** (data, data prevista e contas bancárias, usadas como padrão do 1º período).
O **Termo para assinatura** tem 2 páginas: 1ª = aba `NNN-AAAA` (memória resumida e solicitação, A4 retrato, com autorização dos representantes legais); 2ª = aba `NNN-AAAA_Memória` (apuração, A4 paisagem). Ao gerar, o administrador confirma Data do documento, Data prevista e contas.
O **Documento nº** é sequencial por Data_Base de faturamento dentro de cada ano (001/2026, 002/2026...).

## Regras de cálculo

- O valor **(-) Dedução do Adiantamento** é exibido com sinal negativo (tabela, comparativo, Excel, PDF e Termo); internamente os cálculos usam o valor positivo.

- Retenções = ISS + INSS + PIS + COFINS + IR + Contribuições Sociais + Outras Retenções
- Faturamento Líquido = Valor Bruto − Retenções
- Saldo a Receber = coluna `SALDO A RECEBER DO CLIENTE` (ou Faturamento Líquido − Dedução do Adiantamento, se ausente)
- Fundo de Reserva = 1% do Faturamento Líquido (constante `FR` no código)

## Termo de Responsáveis (PDF para assinatura)

Botão **Termo p/ assinatura** (somente administrador). Gera o PDF (A4 paisagem, no layout do modelo da planilha) da Data_Base selecionada, com KPIs, detalhamento,
memória de cálculo, gráfico de composição e campos de assinatura. Os responsáveis **não aparecem no dashboard**, apenas nesse PDF.
O **Documento nº** muda a cada mês: é sequencial por ano, na ordem das Data_Base (001/2026, 002/2026, 003/2026...),
começando pelo número da planilha no primeiro período (ou 001) e reiniciando em 001 a cada novo ano.

## Menu lateral e novos módulos (REIDI, Fluxo de Caixa e outros)

A barra lateral "Gestão Financeira CSD" abre os módulos do sistema; hoje existem **Fundo de Reserva**, **REIDI**, **Fluxo de Caixa** e **Boletim de Caixa** (os três últimos exibem "Em Desenvolvimento") e **Usuários** (só administrador).
Para adicionar um módulo (cada um no seu arquivo `js/`):

1. Em `js/core/main.js`, inclua um item em `MODS` (ex.: `{id:'reidi',nome:'REIDI',ic:'🏗️'}`); acrescente `adm:true` para ocultá-lo de visualizadores.
2. Em `index.html`, crie o bloco `<main data-view="reidi" class="hidden max-w-7xl mx-auto px-4 py-6 space-y-6">` com a tela.
3. Escreva a lógica em `js/modulos/reidi.js` e inclua a tag `<script src="js/modulos/reidi.js"></script>` **antes** de `js/core/main.js`.

REIDI, Fluxo de Caixa e Boletim de Caixa já estão no menu com a mensagem "Em Desenvolvimento". Para desenvolver um deles, troque o conteúdo do respectivo `<main>` no `index.html` pela tela real e escreva a lógica no arquivo correspondente em `js/modulos/`.

### Módulos independentes

REIDI, Fluxo de Caixa e Boletim de Caixa já vêm no formato isolado: todo o código fica dentro de `(() => { ... })();`.
Assim, nomes de variáveis e funções criados num módulo não substituem os do Fundo de Reserva (que usa nomes como `render`, `T`, `D`, `sum`).
Do núcleo, use apenas `$`, `f`, `p`, `br`, `N`, `ROLE` e `ME`. Funções chamadas por `onclick` no HTML devem ser expostas em `window`
com um prefixo do módulo (ex.: `window.reidiSalvar`).
