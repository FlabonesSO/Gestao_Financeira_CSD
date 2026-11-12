/* Módulo Programação Financeira Quadrimestral.
   Fonte: a planilha "Fluxo de Caixa Quadrimestral" (.xlsm/.xlsx). O administrador importa o arquivo; o site lê as abas
   "Prog. Financeira (Protheus)" (valor nominal a vencer × vencimento real) e "Prog. Fin. (Outras Fontes)" (valor × data prevista de pagamento),
   agrupa as SAÍDAS pelas 15 categorias do fluxo e monta duas visões:
     • Fluxo do mês, dividido em 4 semanas (01–07, 08–14, 15–21, 22–fim do mês);
     • Fluxo do período por mês (quadrimestre), com FILTRO DE PERÍODO (De/Até) para quando houver 6 meses ou mais de dados.
   Parâmetros (saldo inicial de caixa e de aplicações, ENTRADAS e NECESSIDADE DE APORTE por semana) são lançados pelo administrador no site
   (cartão Saldo inicial, tabela e "⚙ Parâmetros") — a planilha NÃO os traz mais (pedido AT). Tudo é gravado em public.bases (chave fluxo_projetado)
   e vale para todos os usuários (atualiza sozinho a cada 30 s). O upload só lê o arquivo (rascunho); o botão "Publicar atualização" libera a todos.
   Regras idênticas às da planilha: saldo acumulado = saldo inicial + saldo do período (+ aporte do período anterior); saída = valor positivo da origem, exibida negativa.
   PERÍODO PUBLICADO (igual ao “Publicar período para todos” do relatório REIDI): o De/Até é, em geral, só da tela de cada pessoa. Quando ele difere do período padrão (o publicado; sem publicação,
   os 4 primeiros meses), quem tem “Atualizar a base e os parâmetros” vê o botão “📤 Publicar período para todos” e todos veem “↺ Padrão”. O botão pede confirmação, relê a base publicada AGORA,
   grava o período em B.par.per ({ de, ate, em }) junto com ela (public.bases · fluxo_projetado; sem SQL novo), registra na Auditoria e, a partir daí, todos abrem o relatório nesse período (quem está
   com a tela aberta, em até 30 s). Cada publicação vale uma vez para cada pessoa (S.pub guarda qual ela já adotou); depois a pessoa muda o De/Até à vontade, só na própria tela.
   Com uma planilha em rascunho, o período vai no rascunho e sai em “Publicar atualização”. Se a planilha nova não tem os meses do período publicado, ele é descartado (volta o padrão) e o admin é avisado.
   IMPORTAÇÃO SÓ DAS BASES (pedido AT): “⬆ Atualizar base” lê SÓ as abas “Prog. Financeira (Protheus)” e “Prog. Fin. (Outras Fontes)”. Saldo inicial de cada mês (Investimento e Contamax), ENTRADAS (o que já entrou, pelo recebimento,
   e o previsto — ⚙ Parâmetros), necessidade de APORTE, Informe Nº e período publicado NÃO vêm mais das abas de fluxo da planilha: ficam como estão no site a cada importação (up()), para avançar os meses sem desfazer o que foi lançado.
   SALDO INICIAL POR MÊS (pedido AV): não há mais “data-base” única. O admin lança, mês a mês, o Investimento e o Contamax com que o mês COMEÇA (par.sal = { 'AAAA-MM': { inv, cmx } }) — no cartão Saldo inicial (o mês do cartão é o da
   coluna filtrada ou o 1º do período) ou na tabela de ⚙ Parâmetros. Mês SEM lançamento começa com o saldo final do mês anterior (abertura + entradas − saídas + aportes), que varia com a análise; mês COM lançamento recomeça do valor lançado
   (o saldo real do banco). Meses antes do 1º lançamento ficam sem saldo (“—”, com alerta). Cadeia calculada em prep() (OP = abertura de cada mês, IV = parte em Investimento); a tabela ganhou a linha SALDO INICIAL. Bases antigas (par.base/inv/cmx)
   são migradas para par.sal na leitura; par.base/inv/cmx continuam espelhados (1º mês lançado) só para telas antigas abertas. Os cartões Entradas/Saídas/Saldo do período/Saldo final não têm mais legenda.
   🗑 LIMPAR BASE (pedidos AV e AW): o admin apaga, para todos, a base publicada (lançamentos Protheus e Outras Fontes) e o rascunho para reimportar — grava na mesma chave um payload sem lançamentos { limpa: true, … }
   (a tabela public.bases não tem DELETE; sem SQL novo). Os PARÂMETROS NÃO SÃO APAGADOS (AW): o saldo inicial de cada mês (o saldo real de banco lançado), as entradas, os aportes, o Informe Nº e o período publicado seguem dentro desse payload (par) e
   a importação seguinte os lê de lá (up()), como numa importação comum. Quem lê trata `limpa` como “nenhuma base publicada”. Só uma base limpa SEM nenhum parâmetro é tratada como PRIMEIRA importação. Pede confirmação e registra na Auditoria.
   CARTÃO SALDO INICIAL (pedido AU): quem não é admin vê SÓ o cartão com o saldo inicial (total). Investimento e Contamax (caixas de lançamento) aparecem só para o admin (fluxo.publicar), para atualizar — ver kSaldo().
   LANÇAMENTOS PROJETADOS: clicar num valor da tabela ou numa barra dos gráficos filtra E abre uma janela com a tabela dos lançamentos, com as opções "Lançamentos TOTVS" (Protheus) e
   "Lançamentos (Outras Fontes)" no alto (cada uma com a sua tabela, contagem e soma). Ver dr().
   MÓDULO ISOLADO: usa de js/core: $, f, br, N, PERM, mo/closeMd/dlg (janela) e uLog (usuarios.js), BASE (base.js), saveAs, XLSX, Chart. */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="fluxo"]'); if (!VIEW) return;
  const CHAVE = 'fluxo_projetado', LS = 'csd_fluxo_v1', MAXB = 9e6;
  const CATS0 = ['Alimentação', 'Combustível e Lubrificantes', 'Contas de Consumo', 'Equipamentos/Informática', 'Folha e Benefícios', 'Impostos/Tributos e Taxas', 'Locação de Equipamentos/Veículos', 'Locação de Imóveis', 'Materiais/Peças/Ferramentas', 'Reembolso/Prestação de Contas', 'Seguros', 'Serviços de Terceiros', 'Transporte/Logística', 'Viagens/Deslocamento', 'Nota de Débito'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], PAL0 = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'],
    /* tema claro: mesmos tons (índigo, verde, âmbar, vermelho…) numa versão mais escura — o verde #10b981 e o vermelho #ef4444 ficavam apagados sobre o fundo branco (contraste menor que 3:1) */
    PALC = ['#4338ca', '#2e7d32', '#b45309', '#c62828', '#0e7490', '#7e22ce', '#be185d'];

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pad = n => String(n).padStart(2, '0'), r2 = v => Math.round((+v || 0) * 100) / 100, r6 = x => Math.round(x * 1e6) / 1e6,
    mlb = m => MES[+m.slice(5) - 1] + '/' + m.slice(2, 4), eom = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate(),
    addM = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) },
    fn = (v, d = 2) => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
    cmp = v => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : a >= 1e3 ? s + Math.round(a / 1e3).toLocaleString('pt-BR') + ' mil' : s + Math.round(a) },
    H = s => N(s).replace(/\s+/g, ' '),
    num = v => { if (typeof v == 'number') return v; let s = String(v == null ? '' : v).trim(); if (!s) return NaN; const ng = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[^0-9.,]/g, ''); if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (s.includes(',')) s = s.replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = parseFloat(s); return isNaN(n) ? NaN : ng ? -Math.abs(n) : n },
    isoD = v => {
      if (Object.prototype.toString.call(v) == '[object Date]') return isNaN(v) ? '' : new Date(v.getTime() + 432e5).toISOString().slice(0, 10);
      if (typeof v == 'number') return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : '';
      const s = String(v == null ? '' : v).trim(), a = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return a ? `${a[3]}-${a[2]}-${a[1]}` : b ? `${b[1]}-${b[2]}-${b[3]}` : ''
    },
    canon = c => { const k = N(c).replace(/\s+/g, ' '); const m = CATS0.find(x => N(x) == k); return m || (String(c || '').trim() || 'Sem categoria') };

  /* ---------- leitura da planilha ---------- */
  function parse(wb) {
    const rows = k => { const n = wb.SheetNames.find(x => k(N(x))); if (!n) return null; const ws = wb.Sheets[n]; if (ws['!ref']) { const g = XLSX.utils.decode_range(ws['!ref']); g.s.c = 0; g.s.r = 0; ws['!ref'] = XLSX.utils.encode_range(g) } /* sempre a partir de A1: colunas fixas mesmo se a aba começa em B2 */
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) };
    const ap = rows(n => n.includes('protheus')), ao = rows(n => n.includes('outras fontes'));
    if (!ap || !ao) throw new Error('não encontrei as abas "Prog. Financeira (Protheus)" e "Prog. Fin. (Outras Fontes)" neste arquivo. Abas encontradas: ' + wb.SheetNames.join(' | '));
    const cab = (a, keys, nome) => {
      const hi = a.findIndex((r, k) => k < 15 && keys.every(t => r.some(c => H(c).includes(t)))); if (hi < 0) throw new Error('não achei o cabeçalho da aba ' + nome + ' (colunas esperadas: ' + keys.join(', ') + ')');
      const h = a[hi].map(H); return { hi, ix: (...ts) => { for (const t of ts) { const i = t[0] == '=' ? h.indexOf(t.slice(1)) : h.findIndex(c => c.includes(t)); if (i >= 0) return i } return -1 } }
    };
    const P = [], O = [], hp = cab(ap, ['vencimento real'], 'Protheus'), c1 = { fo: hp.ix('razao social', 'fornecedor'), ti: hp.ix('=titulo', 'titulo'), tp: hp.ix('=tp'), ve: hp.ix('vencimento real'), va: hp.ix('a vencer', 'valor original'), ca: hp.ix('=categoria'), hi: hp.ix('historico') };
    if (c1.ve < 0 || c1.va < 0 || c1.ca < 0) throw new Error('aba Protheus sem as colunas VENCIMENTO REAL, TÍTULOS A VENCER (valor nominal) e CATEGORIA');
    for (let k = hp.hi + 1; k < ap.length; k++) { const r = ap[k], d = isoD(r[c1.ve]), v = num(r[c1.va]); if (!d || !isFinite(v) || !v) continue; P.push([String(r[c1.fo] || '').trim(), String(r[c1.ti] || '').trim(), String(r[c1.tp] || '').trim(), d, r6(v), canon(r[c1.ca]), String(r[c1.hi] || '').trim().slice(0, 90)]) }
    const ho = cab(ao, ['data prevista de pagamento'], 'Outras Fontes'), c2 = { fo: ho.ix('=fornecedor'), se: ho.ix('setor'), re: ho.ix('colaborador'), pe: ho.ix('periodo'), dt: ho.ix('data prevista de pagamento'), va: ho.ix('=valor'), ca: ho.ix('=categoria'), ob: ho.ix('=status') };
    if (c2.dt < 0 || c2.va < 0 || c2.ca < 0) throw new Error('aba Outras Fontes sem as colunas DATA PREVISTA DE PAGAMENTO, VALOR e CATEGORIA');
    for (let k = ho.hi + 1; k < ao.length; k++) { const r = ao[k], d = isoD(r[c2.dt]), v = num(r[c2.va]); if (!d || !isFinite(v) || !v) continue; O.push([String(r[c2.fo] || '').trim(), String(r[c2.se] || '').trim(), String(r[c2.re] || '').trim(), d, r6(v), canon(r[c2.ca]), String(r[c2.ob] || '').trim().slice(0, 90), (d0 => d0 ? d0.slice(8) + '/' + d0.slice(5, 7) + '/' + d0.slice(0, 4) : String(r[c2.pe] == null ? '' : r[c2.pe]).trim())(r[c2.pe] instanceof Date || typeof r[c2.pe] == 'number' ? isoD(r[c2.pe]) : '')]) }
    /* linhas COMPLETAS das duas bases (todas as colunas, datas como número de série do Excel): a exportação devolve as abas Protheus e Outras Fontes inteiras */
    const bruto = (a, hi, nc) => { const o = []; for (let k = hi + 1; k < a.length; k++) { const row = []; let any = false; for (let j = 0; j < nc; j++) { let v = a[k][j]; if (v instanceof Date) { const d = isoD(v); v = d ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 + 25569 : '' } if (v === '' || v == null) v = ''; else any = true; row.push(v) } if (any) o.push(row) } return o };
    const RP = bruto(ap, hp.hi, 23), RO = bruto(ao, ho.hi, 10);
    if (!P.length && !O.length) throw new Error('nenhuma linha com data e valor nas duas abas');
    /* PEDIDO AT — a importação lê SÓ as duas abas de base (Protheus e Outras Fontes). Saldo inicial (Investimento e Contamax), data-base, ENTRADAS, necessidade de APORTE e Informe Nº
       NÃO vêm mais das abas “Fluxo de Caixa - Mensal / Quadrimestral”: são lançados no site (cartão Saldo inicial e ⚙ Parâmetros) e up() os mantém a cada nova importação.
       Aqui sai só o ponto de partida de uma PRIMEIRA importação (nada publicado ainda, ou base limpa sem parâmetros): tudo zerado, sem saldo inicial lançado. */
    const ms = P.map(x => x[3]).concat(O.map(x => x[3])).map(d => d.slice(0, 7)).sort(), par = { base: ms[0], cx: 0, ap: 0, inv: 0, cmx: 0, sal: {}, ent: {}, apo: {}, ok: false, inf: '' };
    return { v: 2, P, O, par, RP, RO }
  }

  /* ---------- cálculo ---------- */
  let B = null, IT = [], IX = {}, ML = [], OP = {}, IV = {}, MT = {}, FM = '';
  function prep() {
    IT = []; IX = {}; MT = {}; OP = {}; IV = {}; ML = []; FM = '';
    if (!B) return;
    if (B.par.inv == null) { B.par.inv = B.par.ap || 0; B.par.cmx = B.par.cx || 0 } /* bases publicadas antes da divisão Investimento / Contamax */
    /* pedido AV: SALDO INICIAL POR MÊS — par.sal[mês] = { inv, cmx } (o saldo com que o mês começa, lançado pelo admin). Base publicada antes disso: o saldo da data-base vira o lançamento do mês-base */
    if (!B.par.sal || typeof B.par.sal != 'object') { B.par.sal = {}; if (/^\d{4}-\d{2}$/.test(String(B.par.base || '')) && (B.par.inv || B.par.cmx)) B.par.sal[B.par.base] = { inv: r2(B.par.inv), cmx: r2(B.par.cmx) } }
    B.P.forEach(r => IT.push({ s: 'P', f: r[0], t: r[1], tp: r[2], d: r[3], v: r[4], c: r[5], h: r[6] }));
    B.O.forEach(r => IT.push({ s: 'O', f: r[0], se: r[1], rs: r[2], d: r[3], v: r[4], c: r[5], h: r[6], pe: r[7] }));
    IT.forEach(x => { (IX[x.s + '|' + x.c] = IX[x.s + '|' + x.c] || []).push(x); const m = x.d.slice(0, 7); MT[m] = (MT[m] || 0) + x.v });
    const ms = new Set(IT.map(x => x.d.slice(0, 7))); FM = IT.length ? [...ms].sort()[0] : ''; /* FM = 1º mês com lançamentos nas bases */
    if (FM) { /* a lista de meses começa no 1º mês das bases e vai até o último com lançamento, entrada ou saldo lançado; o que foi lançado para meses ANTERIORES (bases que avançaram) fica guardado, mas fora da lista */
      Object.keys(B.par.ent || {}).concat(Object.keys(B.par.sal)).forEach(m => { if (m >= FM) ms.add(m) });
      const a = [...ms].sort(), z = a[a.length - 1]; for (let m = a[0]; m <= z; m = addM(m, 1)) ML.push(m)
    }
    /* saldo de abertura de cada mês: o LANÇADO para o mês (Investimento + Contamax) ou, sem lançamento, o saldo final do mês anterior (abertura + entradas − saídas + aporte).
       Antes do 1º mês com saldo lançado não há abertura (“—”). IV = o Investimento (aplicações) vigente no mês: o último lançado, que segue até o próximo lançamento */
    let o = null, iv = 0; ML.forEach(m => { const l = B.par.sal[m]; if (l) { iv = r2(l.inv); o = r2(l.inv + l.cmx) } if (o == null) return; OP[m] = o; IV[m] = iv; o = o + tot(ent(m)) - (MT[m] || 0) + tot(apo(m)) });
    /* compatibilidade: telas abertas antes desta versão leem par.base / inv / cmx (= o 1º saldo lançado da lista) */
    const k0 = ML.find(m => B.par.sal[m]); B.par.base = k0 || FM || B.par.base; B.par.inv = k0 ? r2(B.par.sal[k0].inv) : 0; B.par.cmx = k0 ? r2(B.par.sal[k0].cmx) : 0
  }
  const tot = a => (a || []).reduce((t, x) => t + (+x || 0), 0), ent = m => (B.par.ent[m] || [0, 0, 0, 0]), apo = m => (B.par.apo[m] || [0, 0, 0, 0]),
    cats = () => { const e = []; IT.forEach(x => { if (!CATS0.includes(x.c) && !e.includes(x.c)) e.push(x.c) }); return CATS0.concat(e.sort()) },
    soma = (s, c, a, b) => { let t = 0; (IX[s + '|' + c] || []).forEach(x => { if (x.d >= a && x.d <= b) t += x.v }); return t };
  const colsMes = m => { const n = eom(m); return [[1, 7], [8, 14], [15, 21], [22, n]].map(([a, b], i) => ({ lb: 'Semana ' + (i + 1), sb: `(${pad(a)} a ${pad(b)}/${m.slice(5)})`, a: m + '-' + pad(a), b: m + '-' + pad(b), m, w: i })) },
    colsPer = ms => ms.map(m => ({ lb: mlb(m), sb: '', a: m + '-01', b: m + '-' + pad(eom(m)), m, w: -1 }));
  /* monta o fluxo de um conjunto de colunas (semanas de um mês, ou meses do período) */
  function flow(cols) {
    const CT = cats(), R = { cols, CT, ent: [], apo: [], sai: [], sal: [], acc: [], cat: {}, sub: {} };
    cols.forEach((c, i) => {
      R.ent[i] = c.w < 0 ? tot(ent(c.m)) : ent(c.m)[c.w]; R.apo[i] = c.w < 0 ? tot(apo(c.m)) : apo(c.m)[c.w];
      let s = 0; CT.forEach(k => { const o = soma('O', k, c.a, c.b), p = soma('P', k, c.a, c.b); (R.sub[k] = R.sub[k] || { O: [], P: [] }).O[i] = o; R.sub[k].P[i] = p; (R.cat[k] = R.cat[k] || [])[i] = o + p; s += o + p });
      R.sai[i] = s; R.sal[i] = R.ent[i] - s
    });
    cols.forEach((c, i) => {
      const op = OP[c.m]; if (op == null) { R.acc[i] = null; return }
      if (c.w < 0) R.acc[i] = op + R.sal[i];
      else { let a = op; for (let k = 0; k <= i; k++) a += R.sal[k] + (k < i ? R.apo[k] : 0); R.acc[i] = a }
    });
    R.ini = R.acc.map((a, i) => a == null ? null : r2(a - R.sal[i])); /* saldo inicial de cada coluna (do mês; na semana, o do mês + o movimento até ela) */
    const L = cols.length - 1, last = R.acc[L];
    R.T = { ent: tot(R.ent), sai: tot(R.sai), sal: tot(R.sal), apo: tot(R.apo), acc: last == null ? null : last + R.apo[L], op: OP[cols[0].m] == null ? null : OP[cols[0].m] };
    R.TC = {}; CT.forEach(k => { R.TC[k] = { t: tot(R.cat[k]), O: tot(R.sub[k].O), P: tot(R.sub[k].P) } });
    return R
  }

  /* ---------- estado ---------- */
  let SV = '', S = { tab: 'q', de: '', ate: '', mes: '', exp: false }, PEND = null, META = '', ST = '', MSG = '', ERR = false, CUR = null, CH = {}, OPEN = {}, FC = null, FP = null, QUIET = false, PUBP = false; /* FC = categoria filtrada · FP = início (data) da coluna/período filtrado — filtros só de tela, não são gravados */
  try { Object.assign(S, JSON.parse(localStorage.getItem(LS)) || {}) } catch (e) { }
  const salva = () => { try { localStorage.setItem(LS, JSON.stringify({ tab: S.tab, de: S.de, ate: S.ate, mes: S.mes, pub: S.pub })) } catch (e) { } }, adm = () => PERM.tem('fluxo.publicar'); /* quem atualiza a base e os parâmetros (permissão "Atualizar a base e os parâmetros") */
  /* período publicado pelo admin (B.par.per): só vale se os dois meses existem na base; kPer identifica a publicação (S.pub = a última que esta pessoa já adotou) */
  const perPub = () => { const p = B && B.par && B.par.per; return p && ML.includes(p.de) && ML.includes(p.ate) && p.de <= p.ate ? p : null }, kPer = p => p.de + '|' + p.ate + '|' + (p.em || ''),
    fPer = p => p && /^\d{4}-\d{2}$/.test(p.de) && /^\d{4}-\d{2}$/.test(p.ate) ? mlb(p.de) + ' a ' + mlb(p.ate) : '',
    padrao = () => perPub() || { de: ML[0], ate: ML[Math.min(3, ML.length - 1)] }; /* o período com que se abre: o publicado ou, sem publicação, os 4 primeiros meses */
  function adota() { const p = perPub(); if (!p || S.pub === kPer(p)) return; S.pub = kPer(p); S.de = p.de; S.ate = p.ate; FP = null; salva() } /* publicação nova: o De/Até da tela vira o publicado (uma vez) */
  function ajusta() {
    if (!B || !ML.length) return;
    adota();
    if (!ML.includes(S.de)) S.de = ML[0]; if (!ML.includes(S.ate)) S.ate = ML[Math.min(3, ML.length - 1)];
    if (S.ate < S.de) S.ate = S.de;
    const rm = RM(); if (!rm.includes(S.mes)) S.mes = rm[0]
  }
  const RM = () => ML.filter(m => m >= S.de && m <= S.ate);

  /* ---------- telas ---------- */
  const COR = { ok: 'text-emerald-600', warn: 'text-amber-600', info: 'text-indigo-500' }, ICO = { ok: '✔', warn: '⚠', info: 'ℹ' };
  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Programação Financeira Quadrimestral</h1>
    <p class="text-sm text-slate-500">Saídas por categoria (Protheus + Outras Fontes), entradas, saldo e aporte${META ? ' · Base publicada em <b>' + esc(META) + '</b>' : ''}</p></div>
    <button class="btn2" data-perm="fluxo.publicar" title="Lê só as abas Prog. Financeira (Protheus) e Prog. Fin. (Outras Fontes) da planilha Fluxo de Caixa Quadrimestral (.xlsm/.xlsx); saldo inicial, entradas e aportes não mudam (para recomeçar do zero use Limpar base); só publica quando você clicar em Publicar atualização" onclick="document.getElementById('fx-fi').click()">⬆ Atualizar base</button><input id="fx-fi" type="file" accept=".xlsx,.xlsm,.xls" class="hidden" onchange="fluxo.up(this)">
    ${B ? '<button class="btn2" data-perm="fluxo.publicar" title="Saldo inicial de cada mês, entradas e Informe Nº" onclick="fluxo.parm()">⚙ Parâmetros</button><button class="btn2" data-perm="fluxo.publicar" title="Apaga a base importada (Protheus e Outras Fontes) para importar uma planilha nova. Os parâmetros (saldo inicial de cada mês, entradas, aportes e Informe Nº) são mantidos" onclick="fluxo.limpar()">🗑 Limpar base</button><button class="btn2" onclick="fluxo.xl()">Excel</button>' : ''}</div>
    ${PEND ? `<div id="fx-pend" data-perm="fluxo.publicar" class="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm"><span class="mr-auto">⚠ <b>Atualização ainda não publicada</b>: ${PEND.n} linhas lidas de “${esc(PEND.arq)}”. Só você vê estes dados até publicar.</span><button class="btn" onclick="fluxo.pub()">📤 Publicar atualização</button><button class="btn2" onclick="fluxo.desc()">Descartar</button></div>` : ''}
    ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  /* a base guarda as linhas completas das duas abas? (publicações antigas guardavam só as colunas usadas no cálculo) */
  const completa = () => !!(B && Array.isArray(B.RP) && Array.isArray(B.RO) && B.RP.length >= B.P.length && B.RO.length >= B.O.length && B.RP.every(r => r.length == 23) && B.RO.every(r => r.length == 10));
  const aviso = () => B && !completa() ? `<div id="fx-old" class="mt-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">⚠ <b>Base publicada em versão anterior</b>: ela não guarda as colunas completas das abas “Prog. Financeira (Protheus)” e “Prog. Fin. (Outras Fontes)”, então o Excel não será gerado. ${adm() ? 'Clique em <b>⬆ Atualizar base</b>, escolha a planilha .xlsm e depois em <b>Publicar atualização</b> (uma única vez).' : 'Peça ao administrador para importar a planilha .xlsm de novo e publicar.'}</div>` : '';
  const vazio = () => `<div class="card py-12 text-center"><div class="text-4xl mb-2">📊</div><p class="font-semibold">Nenhuma base de fluxo de caixa publicada ainda</p><p class="text-sm text-slate-500 mt-1">${adm() ? 'Clique em “Atualizar base” e escolha a planilha Fluxo de Caixa Quadrimestral (.xlsm).' : 'Peça ao administrador para publicar a planilha do fluxo de caixa.'}</p></div>`;
  function perBar() {
    const sel = (id, v, k) => `<select id="${id}" class="inp !py-1 font-semibold" onchange="fluxo.per('${k}',this.value)">${ML.map(m => `<option value="${m}" ${m == v ? 'selected' : ''}>${mlb(m)}</option>`).join('')}</select>`,
      btn = (l, t, a) => `<button type="button" class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 hover:bg-indigo-500/20" title="${t}" onclick="${a}">${l}</button>`, n = RM().length,
      pd = padrao(), difere = S.de != pd.de || S.ate != pd.ate, pode = adm(), rasc = !!(PEND && PEND.per), /* difere: o De/Até da tela não é o período padrão (publicado) */
      info = difere ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 self-center${pode ? ' ml-auto' : ''}"><div id="fx-pubinfo" class="text-xs">Filtro ativo · padrão ${rasc ? 'no rascunho' : 'publicado'}: ${mlb(pd.de)} a ${mlb(pd.ate)}${pode ? ' · <b>só você vê</b> este período até publicar' : ''}</div>${pode ? `<button type="button" id="fx-pubper" data-perm="fluxo.publicar" class="btn disabled:opacity-50 disabled:cursor-wait" ${PUBP ? 'disabled' : ''} title="Todos os usuários passam a abrir a Programação Financeira Quadrimestral neste período: ${mlb(S.de)} a ${mlb(S.ate)} (${n} ${n == 1 ? 'mês' : 'meses'})" onclick="fluxo.pubper()">📤 Publicar período para todos</button>` : ''}</div>`
        : rasc ? `<div id="fx-pubrasc" class="text-xs self-center ml-auto">✔ Período no rascunho: <b>${mlb(pd.de)} a ${mlb(pd.ate)}</b> · vale para todos ao clicar em Publicar atualização</div>` : '';
    return `<div id="fx-per" class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 px-4 py-2.5">
      <div class="text-xs font-bold uppercase tracking-wide self-center">📅 Período</div>
      <label class="text-xs font-semibold uppercase tracking-wide">De<span class="block mt-0.5">${sel('fx-de', S.de, 'de')}</span></label>
      <label class="text-xs font-semibold uppercase tracking-wide">Até<span class="block mt-0.5">${sel('fx-ate', S.ate, 'ate')}</span></label>
      <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-center"><div class="text-[10px] font-semibold uppercase tracking-wide">Período</div><div id="fx-n" class="text-2xl font-bold leading-tight">${n} <span class="text-sm font-semibold">${n == 1 ? 'mês' : 'meses'}</span></div></div>
      <div class="flex flex-wrap items-center gap-1.5 self-center">${btn('Quadrimestre', 'Primeiros 4 meses da base', "fluxo.pre('q')")}${btn('Todos os meses', 'Todos os meses com dados (' + ML.length + ')', "fluxo.pre('all')")}${difere ? btn('↺ Padrão', 'Voltar ao período ' + (rasc ? 'do rascunho' : 'publicado') + ' (' + mlb(pd.de) + ' a ' + mlb(pd.ate) + ')', "fluxo.pre('pub')").replace('<button ', '<button id="fx-padrao" ') : ''}</div>
      <div class="text-xs self-center">Dados de ${mlb(ML[0])} a ${mlb(ML[ML.length - 1])} · ${ML.length} meses</div>
      ${info}</div>`
  }
  const tabs = () => `<div class="flex flex-wrap gap-1">${[['m', 'Fluxo do Mês (4 semanas)'], ['q', 'Fluxo Quadrimestral']].map(([k, n]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium ${S.tab == k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="fluxo.t('${k}')">${n}</button>`).join('')}</div>`;
  /* ícones (SVG de traço, herdam a cor do selo) */
  const SV_ = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IC = {
      cofre: SV_('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
      sobe: SV_('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
      desce: SV_('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>'),
      balanca: SV_('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
      bandeira: SV_('<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.3 2q2 0 3.1-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.5"/>')
    },
    TOM = { ind: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300', ver: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', verm: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', amb: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    sel_ = (i, t) => `<span class="shrink-0 w-9 h-9 rounded-xl grid place-items-center ${TOM[t]}">${IC[i]}</span>`;
  /* cartão de valor: título + ícone no alto, valor numa linha só (nunca quebra o sinal “-”) com fonte que se ajusta à largura do cartão */
  const kp = (t, v, s, i, tom) => CRT.kpi({ t, v, s, ic: i, tom: tom == 'ver' || tom == 'verm' || tom == 'amb' || tom == 'ind' ? tom : 'ind', mx: 1.5 });   // valor na cor padrão do tema (sem verde/vermelho/roxo); só o selo do ícone é colorido
  function alertas(R, rm) {
    const A = [], T = R.T;
    const neg = R.cols.map((c, i) => [c, R.acc[i]]).filter(x => x[1] != null && x[1] < 0); if (neg.length) A.push(['warn', 'Saldo acumulado <b>negativo</b> em ' + neg.map(x => x[0].lb + (x[0].w < 0 ? '' : ' ' + x[0].sb) + ': ' + f(x[1])).join(' · ') + '. Avalie a necessidade de aporte.'])
    const ss = rm.filter(m => OP[m] == null); if (ss.length) A.push(['warn', 'Sem <b>saldo inicial</b> lançado para ' + ss.map(mlb).join(', ') + ': o saldo acumulado e o saldo final ficam em branco ' + (ss.length == 1 ? 'nesse mês' : 'nesses meses') + '. ' + (adm() ? 'Informe o Investimento e o Contamax do mês no cartão Saldo inicial ou em ⚙ Parâmetros.' : 'Peça ao administrador para informar o saldo inicial.')]) /* pedido AV: sem saldo lançado, os meses até o primeiro lançamento ficam sem acumulado */
    const sem = rm.filter(m => !B.par.ent[m] || !tot(ent(m))); if (sem.length) A.push(['warn', 'Sem <b>entradas</b> informadas para ' + sem.map(mlb).join(', ') + ': o fluxo considera R$ 0,00 de entrada nesses meses' + (adm() ? ' (ajuste em ⚙ Parâmetros).' : '. Peça ao administrador para informar em Parâmetros.')]);
    const ex = cats().filter(c => !CATS0.includes(c)); if (ex.length) A.push(['warn', 'Categoria(s) fora das 15 do fluxo: <b>' + ex.map(esc).join(', ') + '</b>. Entram nos totais em linhas próprias.']);
    const top = R.CT.map(k => [k, R.TC[k].t]).sort((a, b) => b[1] - a[1])[0]; if (top && T.sai && top[1] / T.sai > .3) A.push(['info', 'Concentração: <b>' + esc(top[0]) + '</b> responde por <b>' + (top[1] / T.sai * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</b> das saídas do período.']);
    return A
  }
  /* coluna filtrada (índice em R.cols) e categoria filtrada — somem sozinhas quando deixam de existir no período mostrado */
  const fpIdx = R => { if (!FP) return -1; const i = R.cols.findIndex(c => c.a == FP); if (i < 0) FP = null; return i },
    fcOk = R => { if (FC && !R.CT.includes(FC)) FC = null; return FC }, isOpen = k => S.exp || (OPEN[k] != null ? OPEN[k] : FC == k), kq = k => JSON.stringify(k).replace(/"/g, '&quot;'), clb = c => c.lb + (c.sb ? ' ' + c.sb : '');
  /* O clique numa coluna/categoria refaz os gráficos (graficos() destrói e recria). Isso NÃO pode acontecer dentro do próprio evento do gráfico: o Chart.js 4.4.1 continuaria tratando o clique num gráfico já destruído
     (TypeError "handleEvent" no console). Por isso gr()/gc() rodam logo DEPOIS do evento (setTimeout 0), com o índice já lido. */
  function graficos(R) {
    Object.values(CH).forEach(c => c.destroy()); CH = {}; const claro = !document.documentElement.classList.contains('dark'), PAL = claro ? PALC : PAL0, tc = Chart.defaults.color, el1 = document.getElementById('fx-c1'), el2 = document.getElementById('fx-c2'); if (!el1 || !el2) return;
    const sel = fpIdx(R), fc = fcOk(R), an = QUIET ? false : undefined, pt = (e, els) => { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default' };
    const lb = R.cols.map(c => c.sb ? [c.lb, c.sb] : c.lb), sh = R.cols.length <= 6, dl = (o) => ({ display: sh, color: tc, font: { size: 10, weight: 'bold' }, formatter: v => cmp(v), ...o }),
      dim = c => ctx => sel < 0 || ctx.dataIndex == sel ? c : c + '4d', /* coluna filtrada em cor cheia, as demais esmaecidas */
      fino = mx => claro ? { clip: 2, inflateAmount: ctx => { const v = Math.abs(+ctx.raw || 0); return v && v < mx * .012 ? 1.5 : 0 } } : {}; /* tema claro: valor minúsculo (menos de 1,2% do maior) é engrossado em ~3 px para não virar um fio invisível; zero continua sem barra */
    CH.a = new Chart(el1, { type: 'bar', data: { labels: lb, datasets: [{ type: 'bar', label: 'Entradas', data: R.ent, backgroundColor: dim(PAL[1]), ...fino(Math.max(0, ...R.ent, ...(fc ? R.cat[fc] : R.sai))), borderRadius: 5, maxBarThickness: 38, yAxisID: 'y', order: 2, datalabels: dl({ anchor: 'end', align: 'end' }) },
      { type: 'bar', label: fc ? 'Saídas · ' + (fc.length > 26 ? fc.slice(0, 25) + '…' : fc) : 'Saídas', data: fc ? R.cat[fc] : R.sai, backgroundColor: dim(PAL[3]), ...fino(Math.max(0, ...R.ent, ...(fc ? R.cat[fc] : R.sai))), borderRadius: 5, maxBarThickness: 38, yAxisID: 'y', order: 2, datalabels: dl({ anchor: 'end', align: 'end' }) },
      { type: 'line', label: 'Saldo acumulado', data: R.acc, borderColor: PAL[0], backgroundColor: PAL[0], borderWidth: 3, pointRadius: ctx => ctx.dataIndex == sel ? 8 : 4, pointBackgroundColor: ctx => sel < 0 || ctx.dataIndex == sel ? PAL[0] : PAL[0] + '66', tension: .25, yAxisID: 'y1', order: 1, datalabels: dl({ align: 'top', offset: 6, display: R.cols.length <= 8, color: PAL[0] }) }] },
      options: { animation: an, responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, onHover: pt, onClick: (e, _, ch) => { const it = ch.getElementsAtEventForMode(e, 'index', { intersect: false }, true); if (it.length) { const i = it[0].index; setTimeout(() => fluxo.gr(i), 0) } },
        scales: { x: { grid: { display: false } }, y: { display: false, beginAtZero: true, grace: '18%' }, y1: { display: false, position: 'right', grace: '12%' } },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + f(c.parsed.y) } } } } });
    const cs = R.CT.map(k => [k, sel < 0 ? R.TC[k].t : R.cat[k][sel]]).filter(a => a[1] > 0 || a[0] == fc).sort((a, b) => b[1] - a[1]);
    CH.b = new Chart(el2, { type: 'bar', data: { labels: cs.map(a => a[0]), datasets: [{ data: cs.map(a => a[1]), backgroundColor: ctx => !fc || cs[ctx.dataIndex][0] == fc ? PAL[3] : PAL[3] + '4d' /* vermelho = saídas, igual ao gráfico de entradas × saídas; categoria filtrada em cor cheia */, ...fino(Math.max(0, ...cs.map(a => a[1]))), borderRadius: 4, maxBarThickness: 18 }] },
      options: { animation: an, indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 64 } }, interaction: { mode: 'index', axis: 'y', intersect: false }, onHover: pt, onClick: (e, _, ch) => { const it = ch.getElementsAtEventForMode(e, 'index', { axis: 'y', intersect: false }, true); if (it.length && cs[it[0].index]) { const k = cs[it[0].index][0]; setTimeout(() => fluxo.gc(k), 0) } },
        scales: { x: { display: false, beginAtZero: true }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
        plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'end', color: tc, font: { size: 10, weight: 'bold' }, formatter: v => cmp(v) }, tooltip: { callbacks: { label: c => ' ' + f(c.parsed.x) } } } } })
  }
  /* tabela no formato da planilha: ENTRADAS, SAÍDAS, categorias (com origem Outras Fontes / Protheus), saldo, saldo acumulado, aporte */
  function tabela(R) {
    const sel = fpIdx(R), fc = fcOk(R), pc = i => sel < 0 || i < 0 ? '' : i == sel ? 'bg-indigo-500/10' : 'opacity-40', /* coluna filtrada em destaque, as outras esmaecidas */
      nz = v => v == null ? '<span class="text-slate-400">—</span>' : Math.abs(v) < .005 ? '<span class="text-slate-400">–</span>' : fn(v), cl = v => v != null && v < -.005 ? 'text-rose-600' : '',
      fpAt = i => i < 0 ? '' : ` onclick="fluxo.fp(${i})" title="Clique para filtrar este período"`, hv = i => i < 0 ? '' : 'cursor-pointer hover:bg-indigo-500/10',
      td = (v, o = '', at = '') => `<td class="px-3 py-1 text-right whitespace-nowrap ${cl(v)} ${o}"${at}>${nz(v)}</td>`,
      cell = (k, s, i, v) => { const on = fc == k && i == sel; return v < .005 ? `<td class="px-3 py-1 text-right text-slate-400 ${pc(i)}">–</td>` : `<td class="px-3 py-1 text-right whitespace-nowrap text-rose-600 cursor-pointer hover:bg-indigo-500/10 ${on ? 'bg-indigo-500/20 font-bold' : pc(i)}" title="Clique para ver os lançamentos (TOTVS e Outras Fontes) e filtrar esta categoria e este período" onclick="fluxo.cel(${kq(k)},'${s}',${i})">${fn(-v)}</td>` },
      thc = R.cols.map((c, i) => `<th class="px-3 py-2 text-right cursor-pointer select-none ${i == sel ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-500/10 ' + pc(i)}" title="Clique para filtrar este período" onclick="fluxo.fp(${i})">${esc(c.lb)}${c.sb ? '<div class="text-[10px] font-normal normal-case">' + c.sb + '</div>' : ''}</th>`).join(''),
      saAt = i => ` onclick="fluxo.sai(${i})" title="Clique para ver os lançamentos (TOTVS e Outras Fontes) de todas as categorias${i < 0 ? '' : ' neste período'}"`,
      row = (t, a, T, o = {}) => `<tr class="border-t border-slate-200 dark:border-slate-800 ${o.bg || ''} ${o.b ? 'font-bold' : ''}"><td class="px-3 py-1 sticky left-0 z-[1] ${o.bg ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-black'} whitespace-nowrap">${t}</td>${a.map((v, i) => td(v == null ? null : v, (o.c || '') + ' ' + hv(i) + ' ' + pc(i), o.sai ? saAt(i) : fpAt(i))).join('')}${o.sai ? td(T, 'font-bold bg-slate-50 dark:bg-slate-800/60 ' + hv(0), saAt(-1)) : td(T, 'font-bold bg-slate-50 dark:bg-slate-800/60')}</tr>`;
    const neg = a => a.map(v => -v);
    let h = `<div id="fx-tw" class="card p-0 overflow-x-auto"><table class="w-full text-[13px]"><thead class="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr><th class="px-3 py-2 text-left sticky left-0 bg-slate-100 dark:bg-slate-800 min-w-[260px]">Categoria (R$)</th>${thc}<th class="px-3 py-2 text-right">${S.tab == 'm' ? 'Total mês' : 'Total acumulado'}</th></tr></thead><tbody>`;
    h += row('SALDO INICIAL', R.ini, R.T.op, { b: 1, c: 'text-indigo-600 dark:text-indigo-300' });
    h += row('(+) ENTRADAS <span class="font-normal text-xs text-slate-500">(NF líquida de sinal e retenção)</span>', R.ent, R.T.ent, { c: 'text-emerald-600', b: 1 });
    h += row('(−) SAÍDAS', neg(R.sai), -R.T.sai, { b: 1, bg: 'bg-slate-100 dark:bg-slate-800', sai: 1 });
    R.CT.forEach(k => {
      if (fc && k != fc) return; /* categoria filtrada: só ela aparece */
      const op = isOpen(k), tc = R.TC[k]; if (!tc.t && !CATS0.includes(k)) return;
      h += `<tr class="border-t border-slate-200 dark:border-slate-800 font-semibold"><td class="px-3 py-1 sticky left-0 z-[1] ${fc == k ? 'bg-indigo-50 dark:bg-slate-800' : 'bg-white dark:bg-black'} whitespace-nowrap select-none"><span class="inline-block w-5 text-center cursor-pointer rounded hover:bg-indigo-500/20" title="Expandir/recolher as origens (Outras Fontes / Protheus)" onclick="fluxo.tg(${kq(k)})">${op ? '▾' : '▸'}</span><span class="cursor-pointer hover:underline ${fc == k ? 'text-indigo-600 dark:text-indigo-300' : ''}" title="${fc == k ? 'Clique para remover o filtro' : 'Clique para filtrar esta categoria'}" onclick="fluxo.fcat(${kq(k)})">${esc(k)}</span></td>${R.cat[k].map((v, i) => cell(k, '', i, v)).join('')}${cell(k, '', -1, tc.t).replace('px-3 py-1', 'px-3 py-1 bg-slate-50 dark:bg-slate-800/60 font-bold')}</tr>`;
      if (op) [['O', 'Outras Fontes'], ['P', 'Protheus']].forEach(([s, n]) => { h += `<tr class="border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500"><td class="pl-9 pr-3 py-1 sticky left-0 z-[1] bg-white dark:bg-black whitespace-nowrap">${n}</td>${R.sub[k][s].map((v, i) => cell(k, s, i, v)).join('')}${cell(k, s, -1, tc[s])}</tr>` })
    });
    h += row('SALDO DO PERÍODO', R.sal, R.T.sal, { b: 1, bg: 'bg-slate-100 dark:bg-slate-800' });
    h += row('SALDO ACUMULADO', R.acc, R.T.acc, { b: 1, c: 'text-indigo-600 dark:text-indigo-300' });
    const nxt = S.tab == 'm' ? 'semana' : 'mês', ed = adm();
    h += `<tr class="border-t-2 border-slate-300 dark:border-slate-700"><td class="px-3 py-1 sticky left-0 z-[1] bg-white dark:bg-black whitespace-nowrap font-semibold">NECESSIDADE DE APORTE <span class="block font-normal text-[10px] text-slate-500">${ed ? 'digite o valor · ' : ''}entra no saldo da ${nxt} seguinte</span></td>${R.apo.map((v, i) => ed ? `<td class="px-1.5 py-1 ${pc(i)}"><input id="fx-ap${i}" class="inp w-full min-w-[104px] !px-2 !py-0.5 text-right font-semibold" value="${v ? fn(v) : ''}" placeholder="0,00" inputmode="decimal" title="${S.tab == 'm' ? 'Aporte no fim desta semana' : 'Aporte no fim do mês (semana 4)'}" onfocus="this.select()" onchange="fluxo.apo(${i},this.value)"></td>` : td(v, pc(i))).join('')}${td(R.T.apo, 'font-bold bg-slate-50 dark:bg-slate-800/60')}</tr>`;
    return h + '</tbody></table></div>'
  }
  /* valores dos cartões conforme os filtros: período (coluna) muda entradas, saídas, saldos; categoria muda só as saídas */
  function vis(R, i, fc) {
    const a = i < 0, T = R.T, ac = a ? T.acc : (R.acc[i] == null ? null : r2(R.acc[i] + R.apo[i]));
    return { ent: a ? T.ent : R.ent[i], saiAll: a ? T.sai : R.sai[i], sai: fc ? (a ? R.TC[fc].t : R.cat[fc][i]) : (a ? T.sai : R.sai[i]), sal: a ? T.sal : R.sal[i], apo: a ? T.apo : R.apo[i], op: a ? T.op : (R.acc[i] == null ? null : r2(R.acc[i] - R.sal[i])), acc: ac }
  }
  /* o que aparece como sugestão (cinza) nas caixas de um mês sem saldo lançado: a divisão calculada — Investimento vigente e o restante em caixa (Contamax) */
  const sug = (m, k) => OP[m] == null ? '0,00' : fn(k == 'inv' ? IV[m] : r2(OP[m] - IV[m]));
  /* cartão Saldo inicial. mc = o mês a que ele se refere (o da coluna filtrada ou o 1º do período) */
  function kSaldo(T, V, ti, mc) {
    const tt = `<div class="min-w-[15rem]" style="container-type:inline-size">${CRT.titulo('Saldo inicial' + (ti ? ' · ' + esc(ti) : ''), 'cofre', 'ind')}<div class="text-2xl font-bold mt-2 whitespace-nowrap tabular-nums leading-tight">${V.op == null ? '—' : f(V.op)}</div></div>`;
    /* pedido AU: quem não é admin vê SÓ o cartão com o saldo inicial (total); Investimento e Contamax ficam só para o admin, que os usa para atualizar */
    if (!adm()) return `<div class="card py-3 w-full sm:w-fit">${tt}</div>`;
    /* pedido AV: o admin lança o Investimento e o Contamax DO MÊS do cartão; sem lançamento o mês começa com o saldo final do mês anterior */
    const l = B.par.sal[mc], cx = (k, n) => `<label class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">${n}<input id="fx-s${k}" class="inp w-full mt-0.5 !px-2 !py-1 text-right text-sm font-semibold normal-case tracking-normal" value="${l ? fn(l[k]) : ''}" placeholder="${sug(mc, k)}" inputmode="decimal" title="Saldo com que ${mlb(mc)} começa. Apague os dois campos para voltar ao automático (saldo final do mês anterior)." onfocus="this.select()" onchange="fluxo.sal('${mc}','${k}',this.value)"></label>`;
    return `<div class="card py-3 flex flex-wrap items-center gap-x-8 gap-y-3">${tt}
      <div class="grid grid-cols-2 gap-3 flex-1 min-w-[18rem] max-w-xl">${cx('inv', 'Investimento')}${cx('cmx', 'Contamax')}</div>
      <div class="text-[11px] text-slate-500 basis-full xl:basis-auto xl:max-w-xs">Investimento + Contamax de <b>${mlb(mc)}</b> · ${l ? 'lançado' : OP[mc] == null ? 'sem saldo lançado' : 'automático (saldo final do mês anterior)'}${V.op != null && OP[mc] != null && Math.abs(V.op - OP[mc]) > .005 ? ' · o saldo mostrado já inclui a movimentação do mês até a semana escolhida' : ''}</div></div>`
  }
  /* barra de filtros: mostra o que está filtrado (cada item some ao clicar no ✕) ou a dica de uso */
  function fbar(R, sel, fc) {
    const chip = (t, v, a) => `<span class="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white pl-3 pr-1.5 py-0.5 text-xs font-semibold"><span class="font-normal opacity-80">${t}:</span> ${esc(v)}<button type="button" class="ml-0.5 w-5 h-5 rounded-full hover:bg-white/25 leading-none" title="Remover este filtro" onclick="${a}">✕</button></span>`;
    if (sel < 0 && !fc) return ''; /* pedido AF: a legenda “Interativo: clique num valor…” saiu */
    return `<div id="fx-flt" class="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2"><span class="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">🔎 Filtrando</span>
      ${sel >= 0 ? chip('Período', clb(R.cols[sel]), "fluxo.lim('p')") : ''}${fc ? chip('Categoria', fc, "fluxo.lim('c')") : ''}
      <span class="mr-auto"></span><button class="btn2 !py-1 text-xs" title="Lista os lançamentos do filtro" onclick="fluxo.drSel()">Ver lançamentos</button><button class="btn2 !py-1 text-xs" onclick="fluxo.lim()">Limpar filtros</button></div>`
  }
  function dyn() {
    ajusta(); const rm = RM(), mes = S.tab == 'm', R = flow(mes ? colsMes(S.mes) : colsPer(rm)), T = R.T; CUR = R;
    const sel = fpIdx(R), fc = fcOk(R), V = vis(R, sel, fc), ti = sel >= 0 ? clb(R.cols[sel]) : '', cn = fc ? (fc.length > 22 ? fc.slice(0, 21) + '…' : fc) : '';
    const A = alertas(R, mes ? [S.mes] : rm), esc1 = sel >= 0 ? ' · ' + ti : '';
    return `${fbar(R, sel, fc)}${kSaldo(T, V, ti, (sel >= 0 ? R.cols[sel] : R.cols[0]).m)}<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kp('Entradas' + esc1, f(V.ent), '', 'sobe', 'ver')}${kp('Saídas' + (fc ? ' · ' + esc(cn) : esc1), f(-V.sai), '', 'desce', 'verm')}${kp('Saldo do período' + esc1, f(V.sal), '', 'balanca', 'amb')}${kp('Saldo final' + esc1, V.acc == null ? '—' : f(V.acc), '', 'bandeira', 'ind')}</div>
    ${A.length ? `<div class="card"><ul class="space-y-1.5 text-sm">${A.map(a => `<li class="flex gap-2"><span class="${COR[a[0]]}">${ICO[a[0]]}</span><span>${a[1]}</span></li>`).join('')}</ul></div>` : ''}
    <div class="grid lg:grid-cols-5 gap-4"><div class="card lg:col-span-3"><h2 class="font-semibold mb-2">${mes ? 'Entradas × saídas por semana · ' + mlb(S.mes) : 'Entradas × saídas por mês'} e saldo acumulado${fc ? ' <span class="text-xs font-normal text-slate-500">· saídas só de ' + esc(fc) + '</span>' : ''}</h2><div class="relative h-72"><canvas id="fx-c1"></canvas></div></div>
    <div class="card lg:col-span-2"><h2 class="font-semibold mb-2">Saídas por categoria${sel >= 0 ? ' <span class="text-xs font-normal text-slate-500">· ' + esc(ti) + '</span>' : ''}</h2><div class="relative h-72"><canvas id="fx-c2"></canvas></div></div></div>
    <div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold mr-auto">${mes ? 'Fluxo de Caixa Mensal · ' + mlb(S.mes) : 'Fluxo de Caixa · ' + mlb(rm[0]) + ' a ' + mlb(rm[rm.length - 1])}</h2><span id="fx-sv" class="text-xs ${/^⚠/.test(SV) ? 'text-rose-500' : 'text-emerald-600'}">${esc(SV)}</span></div>
    ${tabela(R)}`
  }
  function corpo() {
    if (!B) return vazio(); ajusta(); const rm = RM(), mes = S.tab == 'm';
    return `${perBar()}${tabs()}
    ${mes ? `<div class="flex flex-wrap items-center gap-2"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Mês</span>${rm.map(m => `<button class="px-3 py-1 rounded-lg text-sm font-medium border ${m == S.mes ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="fluxo.mes('${m}')">${mlb(m)}</button>`).join('')}<span class="text-xs text-slate-500 ml-2">Período do fluxo: 01/${S.mes.slice(5)}/${S.mes.slice(0, 4)} a ${eom(S.mes)}/${S.mes.slice(5)}/${S.mes.slice(0, 4)} · semanas: 01–07, 08–14, 15–21 e 22–fim do mês</span></div>`
      : `<div class="text-xs text-slate-500">Período do fluxo: 01/${rm[0].slice(5)}/${rm[0].slice(0, 4)} a ${eom(rm[rm.length - 1])}/${rm[rm.length - 1].slice(5)}/${rm[rm.length - 1].slice(0, 4)} · ${rm.length} ${rm.length == 1 ? 'mês' : 'meses'}</div>`}
    <div id="fx-dyn" class="space-y-4">${dyn()}</div>`
  }
  /* atualiza só a parte de baixo (cartões, gráficos e tabela): quem está digitando não perde o clique nas abas, e o foco volta ao campo seguinte */
  function refresh() { const d = document.getElementById('fx-dyn'); if (!d || !B) return render(); const w = document.getElementById('fx-tw'), sl = w ? w.scrollLeft : 0; d.innerHTML = dyn(); if (CUR) graficos(CUR); const w2 = document.getElementById('fx-tw'); if (w2 && sl) w2.scrollLeft = sl }
  const filtra = () => { QUIET = true; try { refresh() } finally { QUIET = false } }; /* filtro por clique: redesenha sem reanimar os gráficos */
  function keep(fn) { setTimeout(() => { const a = document.activeElement, id = a && a.id; fn(); if (id) { const e = document.getElementById(id); if (e && e !== document.activeElement) { e.focus(); try { e.select() } catch (_) { } } } }, 0) }
  async function grava() {
    B.par.man = true; prep(); ajusta();
    if (PEND) { SV = 'Rascunho atualizado · publique a atualização para valer para todos.'; refresh(); return }
    SV = 'Salvando…'; refresh();
    const say = (t) => { SV = t; const e = document.getElementById('fx-sv'); if (e) { e.textContent = t; e.className = 'text-xs ' + (/^⚠/.test(t) ? 'text-rose-500' : 'text-emerald-600') } };
    try { const r = await BASE.gravar(CHAVE, B, 'saldos e aportes do fluxo de caixa'); ST = r.atualizado_em; META = BASE.fdh(r.atualizado_em) + ' · saldos e aportes'; say('✔ Salvo para todos os usuários.') } catch (x) { say('⚠ Não salvei: ' + (x.message || x)) }
  }
  function render() { VIEW.innerHTML = head() + aviso() + (B ? '<div class="space-y-4 mt-4">' + corpo() + '</div>' : '<div class="mt-4">' + vazio() + '</div>'); if (B && CUR) graficos(CUR) }

  /* ---------- base na nuvem ---------- */
  async function nuvem() {
    if (PEND) return;
    try {
      const r = await BASE.ler(CHAVE);
      if (r && r.dados && r.dados.v == 2 && Array.isArray(r.dados.P)) { const lp = !!r.dados.limpa; META = lp ? '' : BASE.fdh(r.atualizado_em) + (r.arquivo ? ' · ' + r.arquivo : ''); if (r.atualizado_em != ST) { ST = r.atualizado_em; B = lp ? null : r.dados; prep() } render() } /* limpa: a base foi limpa (pedido AV) → tela “nenhuma base publicada” */
      else if (!B) { if (r && r.dados) { MSG = 'A base publicada está no formato antigo. ' + (adm() ? 'Importe de novo a planilha Fluxo de Caixa Quadrimestral.' : 'Peça ao administrador para publicar de novo.'); ERR = true } render() }
    } catch (e) { MSG = 'Não consegui carregar a base: ' + (e.message || e) + '. Confira se o SQL supabase/bases-dados.sql foi executado.'; ERR = true; render() }
  }
  const aberto = () => !!document.querySelector('[data-view="fluxo"]:not(.hidden)');
  async function confere() {
    const c = BASE.cli(); if (!c || document.hidden || !aberto() || PEND) return;
    try { const { data } = await c.from('bases').select('atualizado_em').eq('chave', CHAVE).maybeSingle(); if (data && data.atualizado_em && data.atualizado_em != ST) { const a = ST; await nuvem(); if (ST != a && a) { MSG = B ? '🔄 Base atualizada automaticamente (publicada em ' + META + ').' : '🔄 A base foi limpa pelo administrador: aguarde a nova importação.'; ERR = false; render() } } } catch (e) { }
  }
  setInterval(confere, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) confere() });
  /* clicar fora do gráfico (em área sem controle: fundo da página, cartões, títulos) ou apertar Esc desfaz o filtro de coluna/categoria; botões, campos, a tabela, o quadro de filtros e as janelas não desfazem.
     Dentro do gráfico quem trata é o onClick (o Chart.js o entrega depois que o clique já subiu até aqui); na legenda é um controle; nos eixos e margens do gráfico é "clicar fora" */
  document.addEventListener('click', e => {
    if ((!FP && !FC) || VIEW.classList.contains('hidden')) return;
    const t = e.target, md = document.getElementById('md'); if (!t || !t.closest || !t.isConnected || (md && !md.classList.contains('hidden'))) return; /* !isConnected: o clique foi num controle que acabou de redesenhar a tela */
    if (t.id == 'fx-c1' || t.id == 'fx-c2') {
      const c = t.id == 'fx-c1' ? CH.a : CH.b, x = e.offsetX, y = e.offsetY, dentro = b => b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
      if (c && (dentro(c.chartArea) || dentro(c.legend))) return
    } else if (t.closest('button,a,input,select,textarea,label,summary,#fx-tw,#fx-flt,#fx-per')) return;
    FP = null; FC = null; filtra()
  });
  document.addEventListener('keydown', e => {
    if (e.key != 'Escape' || (!FP && !FC) || VIEW.classList.contains('hidden')) return; const md = document.getElementById('md'), a = document.activeElement;
    if ((md && !md.classList.contains('hidden')) || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) return; FP = null; FC = null; filtra()
  });

  /* ---------- parâmetros (admin) ---------- */
  function parm() {
    if (!adm() || !B) return; const inp = (id, v) => `<input id="${id}" class="inp w-full min-w-[10.5rem] !px-2 !py-1.5 text-right text-sm font-semibold" value="${v ? fn(v) : ''}" placeholder="0,00" inputmode="decimal" onfocus="this.select()">`,
      isl = (id, k, m) => { const l = B.par.sal[m]; return `<input id="${id}" class="inp w-full min-w-[10.5rem] !px-2 !py-1.5 text-right text-sm font-semibold" value="${l ? fn(l[k]) : ''}" placeholder="${sug(m, k)}" inputmode="decimal" onfocus="this.select()">` };
    mo(`<h2 class="text-lg font-bold mb-1">Saldo inicial e entradas por mês</h2><p class="text-sm text-slate-500 mb-3">Valem para todos os usuários assim que você salvar e <b>a importação da planilha não altera estes valores</b>. A necessidade de aporte é digitada direto na tela do fluxo.</p>
    <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Informe Nº<input id="fp-inf" class="inp block mt-0.5 w-44 !px-2 !py-1.5 text-sm font-semibold normal-case tracking-normal" maxlength="20" value="${esc(B.par.inf == null ? '' : B.par.inf)}" placeholder="001/2026"></label>
    <div class="overflow-auto" style="max-height:56vh">
    <h3 class="font-semibold text-sm mb-1">Saldo inicial de cada mês</h3><p class="text-xs text-slate-500 mb-2">Informe o Investimento e o Contamax com que o mês começa (por exemplo, o saldo real do banco). Mês em branco = automático: começa com o saldo final do mês anterior, que varia com as entradas, saídas e aportes.</p>
    <table class="w-full text-xs mb-5"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr><th class="px-2 py-1 text-left">Mês</th><th class="px-1 py-1">Investimento</th><th class="px-1 py-1">Contamax</th><th class="px-2 py-1 text-right">Saldo inicial usado</th></tr></thead>
    <tbody>${ML.map((m, i) => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 font-semibold whitespace-nowrap">${mlb(m)}</td><td class="px-1 py-1">${isl('fp-si' + i, 'inv', m)}</td><td class="px-1 py-1">${isl('fp-sc' + i, 'cmx', m)}</td><td class="px-2 py-1 text-right font-semibold whitespace-nowrap">${OP[m] == null ? '—' : fn(OP[m])}<span class="block text-[10px] font-normal text-slate-500">${B.par.sal[m] ? 'lançado' : OP[m] == null ? 'sem saldo' : 'automático'}</span></td></tr>`).join('')}</tbody></table>
    <h3 class="font-semibold text-sm mb-1">Entradas · realizadas e previstas</h3><p class="text-xs text-slate-500 mb-2">Lance o que já entrou (conforme o recebimento) e o que é previsto. S1 = dias 1–7, S2 = 8–14, S3 = 15–21, S4 = 22–fim do mês.</p>
    <table class="w-full text-xs"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr><th class="px-2 py-1 text-left">Mês</th>${['S1', 'S2', 'S3', 'S4'].map(x => `<th class="px-1 py-1">Entradas ${x}</th>`).join('')}</tr></thead>
    <tbody>${ML.map((m, i) => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 font-semibold whitespace-nowrap">${mlb(m)}</td>${[0, 1, 2, 3].map(w => `<td class="px-1 py-1">${inp('fp-e' + i + '-' + w, ent(m)[w])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p id="fp-e" class="hidden text-sm text-rose-500 mt-2"></p><div class="flex justify-end gap-2 mt-3"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="fluxo.parmOk()">Salvar para todos</button></div>`);
    const w = document.getElementById('mdb'); if (w) w.style.maxWidth = '58rem'
  }
  async function parmOk() {
    const tx = id => document.getElementById(id).value.trim(), v = id => { const s = tx(id); return s === '' ? 0 : num(s) }, er = m => { const x = document.getElementById('fp-e'); x.textContent = m; x.classList.remove('hidden') };
    const e = {}; Object.keys(B.par.ent || {}).forEach(m => { if (!ML.includes(m)) e[m] = B.par.ent[m] }); /* meses fora da lista (antes do 1º mês das bases) ficam como estão */
    const sal = {}; Object.keys(B.par.sal || {}).forEach(m => { if (!ML.includes(m)) sal[m] = B.par.sal[m] });
    for (let i = 0; i < ML.length; i++) {
      const E = []; for (let w = 0; w < 4; w++) { const x = v('fp-e' + i + '-' + w); if (!isFinite(x) || x < 0) return er('Valor inválido em ' + mlb(ML[i]) + ' (use números positivos).'); E.push(r2(x)) } if (tot(E)) e[ML[i]] = E;
      if (tx('fp-si' + i) !== '' || tx('fp-sc' + i) !== '') { const x = v('fp-si' + i), y = v('fp-sc' + i); if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0) return er('Saldo inicial inválido em ' + mlb(ML[i]) + ' (use números positivos).'); sal[ML[i]] = { inv: r2(x), cmx: r2(y) } } /* os dois campos em branco = sem lançamento (automático) */
    }
    const fi = document.getElementById('fp-inf'), inf = fi ? fi.value.trim().slice(0, 20) : (B.par.inf == null ? '' : B.par.inf);
    closeMd(); B.par = { ...B.par, ent: e, sal, inf, ok: true, man: true }; prep(); ajusta();
    if (PEND) { MSG = 'Saldo inicial e entradas atualizados no rascunho. Publique a atualização para valerem para todos.'; ERR = false; render(); return }
    MSG = 'Publicando saldo inicial e entradas…'; ERR = false; render();
    try { const r = await BASE.gravar(CHAVE, B, 'saldo inicial e entradas do fluxo de caixa'); ST = r.atualizado_em; META = BASE.fdh(r.atualizado_em) + ' · saldo inicial e entradas'; MSG = '✔ Saldo inicial e entradas salvos para todos os usuários.'; ERR = false } catch (x) { MSG = '⚠ Não salvei o saldo inicial e as entradas: ' + (x.message || x); ERR = true } render()
  }

  /* ---------- lançamentos de um valor ou de uma barra ----------
     Clicar num valor da tabela ou numa barra dos gráficos abre esta janela (o filtro da tela também é aplicado). No alto ficam as duas origens, cada uma com a sua tabela, a sua contagem e a sua soma:
       "Lançamentos TOTVS" (o Protheus: aba "Prog. Financeira (Protheus)" da planilha) e "Lançamentos (Outras Fontes)" (aba "Prog. Fin. (Outras Fontes)").
     A soma das duas é o valor em que a pessoa clicou. Quem clica numa linha de origem (Protheus / Outras Fontes) abre já na aba dela; nos demais casos abre na primeira origem que tem lançamentos. */
  const ORI = { P: { n: 'Lançamentos TOTVS', v: 'TOTVS', d: 'Títulos do Protheus (TOTVS): aba “Prog. Financeira (Protheus)” da planilha' }, O: { n: 'Lançamentos (Outras Fontes)', v: 'de Outras Fontes', d: 'Aba “Prog. Fin. (Outras Fontes)” da planilha' } };
  let DR = null; /* janela aberta: { k: categoria (null = todas), c: período, L: { P: [...], O: [...] }, aba: 'P' | 'O' } */
  const drSoma = L => L.reduce((q, x) => q + x.v, 0), drOrd = (a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : b.v - a.v;
  function drHtml() {
    const { k, c, L, aba } = DR, n = L.P.length + L.O.length, ac = k == null, getters=aba=='P'?[x=>x.d,x=>x.f,x=>x.tp+' '+x.t,x=>x.h,...(ac?[x=>x.c]:[]),x=>x.v]:[x=>x.d,x=>x.f,x=>x.se,x=>x.rs,x=>x.h,...(ac?[x=>x.c]:[]),x=>x.v], A=window.ORDT?ORDT.order(L[aba],'fluxo-dr-'+aba,getters):L[aba],
      tc = o => `<button type="button" role="tab" id="fx-dt-${o}" data-aba="${o}" aria-selected="${aba == o}" aria-controls="fx-drp" tabindex="${aba == o ? 0 : -1}" title="${ORI[o].d}" class="px-3 py-1.5 rounded-lg text-sm font-medium text-left border ${aba == o ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="fluxo.dra('${o}')">${ORI[o].n}<span class="block text-[11px] font-normal ${aba == o ? 'text-white/85' : 'text-slate-500'}">${L[o].length} ${L[o].length == 1 ? 'lançamento' : 'lançamentos'} · ${f(drSoma(L[o]))}</span></button>`,
      th = (t, r) => `<th class="px-2 py-1 ${r ? 'text-right' : 'text-left'}">${t}</th>`, td = (t, o = '') => `<td class="px-2 py-1 ${o}">${t}</td>`, tr = c2 => `<tr class="border-t border-slate-200 dark:border-slate-800">${c2}</tr>`,
      lg = (t, r) => `<td class="px-2 py-1 max-w-[260px] truncate" title="${esc(t)}">${esc(t) || '—'}</td>`;
    const cab = aba == 'P' ? th('Vencimento') + th('Fornecedor') + th('Título') + th('Histórico') + (ac ? th('Categoria') : '') + th('Valor', 1) : th('Data prevista') + th('Fornecedor') + th('Setor') + th('Responsável') + th('Status') + (ac ? th('Categoria') : '') + th('Valor', 1),
      lin = x => tr(aba == 'P' ? td(br(x.d)) + lg(x.f) + td(esc((x.tp + ' ' + x.t).trim()) || '—') + lg(x.h) + (ac ? td(esc(x.c)) : '') + td(fn(x.v), 'text-right')
        : td(br(x.d)) + lg(x.f) + td(esc(x.se) || '—') + td(esc(x.rs) || '—') + lg(x.h) + (ac ? td(esc(x.c)) : '') + td(fn(x.v), 'text-right')),
      nc = (aba == 'P' ? 5 : 6) + (ac ? 1 : 0);
    return `<h2 class="text-lg font-bold mb-1">${ac ? 'Todas as categorias' : esc(k)}</h2><p class="text-sm text-slate-500 mb-3">${esc(clb(c))} · ${br(c.a)} a ${br(c.b)} · ${n} lançamento(s) · total <b>${f(drSoma(L.P) + drSoma(L.O))}</b></p>
    <div role="tablist" aria-label="Origem dos lançamentos" class="flex flex-wrap gap-2 mb-3" onkeydown="fluxo.drk(event)">${tc('P')}${tc('O')}</div>
    <div id="fx-drp" role="tabpanel" aria-labelledby="fx-dt-${aba}"><div class="overflow-auto" style="max-height:50vh"><table class="w-full text-xs whitespace-nowrap" data-tab="dr${aba}" data-sort-key="fluxo-dr-${aba}"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr>${cab}</tr></thead>
    <tbody>${A.slice(0, 600).map(lin).join('') || `<tr><td class="px-2 py-6 text-center text-slate-500" colspan="${nc}">Nenhum lançamento ${ORI[aba].v}${ac ? '' : ' em ' + esc(k)} neste período.</td></tr>`}</tbody></table></div>${A.length > 600 ? `<p class="text-xs text-slate-500 mt-1">Mostrando os 600 primeiros de ${A.length} lançamentos.</p>` : ''}</div>
    <div class="flex justify-end mt-3"><button class="btn2" onclick="closeMd()">Fechar</button></div>`
  }
  document.addEventListener('report-sort',e=>{if(e.detail?.key?.startsWith('fluxo-dr-')){const w=document.getElementById('fx-drw');if(w&&DR)w.innerHTML=drHtml()}});
  function dr(k, s, i) {
    if (!CUR || (i >= 0 && !CUR.cols[i])) return;
    const c = i >= 0 ? CUR.cols[i] : { a: CUR.cols[0].a, b: CUR.cols[CUR.cols.length - 1].b, lb: 'Todo o período', sb: '' },
      L = IT.filter(x => (k == null || x.c == k) && x.d >= c.a && x.d <= c.b).sort(drOrd), P = L.filter(x => x.s == 'P'), O = L.filter(x => x.s == 'O');
    DR = { k, c, L: { P, O }, aba: s == 'O' || s == 'P' ? s : (P.length || !O.length ? 'P' : 'O') };
    mo('<div id="fx-drw">' + drHtml() + '</div>'); const wd = document.getElementById('mdb'); if (wd) wd.style.maxWidth = k == null ? '80rem' : '66rem' /* todas as categorias tem a coluna Categoria: janela mais larga para o Valor não ficar escondido */
  }

  /* ---------- Excel ---------- */
  /* Excel na planilha ORIGINAL completa: bases Protheus e Outras Fontes + UM Mensal (4 semanas do 1º mês do período) + o Quadrimestral (4 meses; meses além do 4º vão para Quadri. 2…), tudo ligado por fórmulas e hiperlinks */
  async function xl() {
    if (!B) return; if (!completa()) { MSG = '⚠ Não gerei o Excel: a base publicada é de uma versão anterior e não guarda as colunas completas das abas Protheus e Outras Fontes. ' + (adm() ? 'Clique em ⬆ Atualizar base, escolha a planilha .xlsm e depois em Publicar atualização.' : 'Peça ao administrador para importar a planilha .xlsm de novo e publicar.'); ERR = true; render(); return } ajusta(); const rm = RM(), P2 = n => String(n).padStart(2, '0'), cats15 = CATS0.slice(0, 15), base = B.par, qn = n => "'" + String(n).replace(/'/g, "''") + "'";
    const ser = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 + 25569;
    const MN = 'Fluxo de Caixa - Mensal', m0 = rm[0];
    const abre = m => { const o = OP[m]; return o == null ? [0, 0] : [r2(o - IV[m]), r2(IV[m])] }, /* [caixa (C6), aplicações (C7)] — no mês com saldo lançado: Contamax / Investimento; depois, o Investimento vigente e o restante em caixa */
      mk = R => ({ O: cats15.map(k => (R.sub[k] ? R.sub[k].O : [0, 0, 0, 0])), P: cats15.map(k => (R.sub[k] ? R.sub[k].P : [0, 0, 0, 0])), sai: R.sai, ent: R.ent, apo: R.apo, ext: R.CT.some(k => !cats15.includes(k) && R.TC[k].t) }),
      per = (a, b) => '01/' + a.slice(5) + '/' + a.slice(0, 4) + ' a ' + P2(eom(b)) + '/' + b.slice(5) + '/' + b.slice(0, 4), inf = base.inf == null ? '001/2026' : base.inf;
    const abas = [], uso = (arr, n) => [0, 1, 2, 3].map(i => i < n ? (arr[i] || 0) : 0), pad4 = (a, v) => [0, 1, 2, 3].map(i => a[i] != null ? a[i] : v);
    /* igual à planilha: UMA aba mensal (4 semanas) só do 1º mês do período e a quadrimestral (a coluna do 1º mês é ligada à mensal) */
    { const cs = colsMes(m0), R = flow(cs), x = mk(R), [c6, c7] = abre(m0);
      abas.push({ tipo: 'M', nome: MN, per: per(m0, m0), inf, cab: cs.map(c => c.lb + '\n' + c.sb), ent: x.ent, apo: x.apo, O: x.O, P: x.P, sai: x.sai, ext: x.ext, uso: 4,
        dt: cs.map(c => [+m0.slice(0, 4), +m0.slice(5), +c.a.slice(8), +c.b.slice(8)]), c6: { v: c6 }, c7: { v: c7 } }) }
    for (let b = 0, j = 1; b < rm.length; b += 4, j++) {
      const ms = rm.slice(b, b + 4), R = flow(colsPer(ms)), x = mk(R), [c6, c7] = abre(ms[0]), n = ms.length, lig = b == 0;
      abas.push({ tipo: 'Q', nome: j == 1 ? 'Fluxo de Caixa - Quadrimestral' : 'Fluxo de Caixa - Quadri. ' + j, per: per(ms[0], ms[n - 1]), inf, cab: ms.map(m => FXLS.serial(+m.slice(0, 4), +m.slice(5))).concat([null, null, null]).slice(0, 4), ent: uso(x.ent, n), apo: uso(x.apo, n), sai: uso(x.sai, n), ext: x.ext, uso: n,
        dt: pad4(ms.map(m => [+m.slice(0, 4), +m.slice(5), 1, eom(m)]), [0, 0, 1, 1]), O: x.O.map(a => uso(a, n)), P: x.P.map(a => uso(a, n)),
        lig: lig ? MN : null, c6: lig ? { v: c6, f: qn(MN) + '!C6' } : { v: c6 }, c7: lig ? { v: c7, f: qn(MN) + '!C7' } : { v: c7 } })
    }
    /* as abas Protheus e Outras Fontes saem com as linhas ORIGINAIS da planilha (todas as colunas, na mesma ordem). Base publicada por versão antiga não as guarda: não exporta uma versão incompleta */
    const RP = B.RP, RO = B.RO, semF = false;
    const ativa = S.tab == 'm' ? 0 : 1; /* abre na aba Mensal ou na Quadrimestral, conforme a aba da tela */
    try { const out = await FXLS.exportar({ abas, ativa, RP, RO, semFormulas: semF }); await saveAs('fluxo_de_caixa_' + rm[0] + '_a_' + rm[rm.length - 1] + '.xlsx', out) }
    catch (e) { MSG = '⚠ Não consegui gerar a planilha: ' + (e.message || e); ERR = true; render() }
  }

  /* grava o período escolhido como o de todos. Com a planilha em rascunho, vai no rascunho (e sai em “Publicar atualização”). Sem rascunho, RELÊ a base publicada AGORA e troca só o período,
     para não desfazer o que outra pessoa publicou nos últimos segundos (a tela só confere a cada 30 s); se a base publicada agora não tem mais esses meses, não grava. */
  async function pubperOk(de, ate) {
    if (PUBP || !adm() || !B) return; const per = { de, ate, em: new Date().toISOString() }, tx = fPer(per), n = ML.filter(m => m >= de && m <= ate).length;
    if (PEND) { B.par.per = per; PEND.per = true; S.pub = kPer(per); salva(); MSG = '✔ Período ' + tx + ' incluído no rascunho. Publique a atualização para valer para todos.'; ERR = false; render(); return }
    PUBP = true; MSG = 'Publicando o período para todos…'; ERR = false; render();
    try {
      const r = await BASE.ler(CHAVE);
      if (!r || !r.dados || r.dados.v != 2 || !Array.isArray(r.dados.P)) throw new Error('não encontrei a base publicada (publique a planilha antes).');
      const d = { ...r.dados, par: { ...(r.dados.par || {}), per } }, B0 = B;
      B = d; prep(); const ok = ML.includes(de) && ML.includes(ate); B = B0; prep(); /* confere nos meses da base publicada AGORA (troca e desfaz na hora; a tela só muda depois de gravar) */
      if (!ok) throw new Error('a base publicada agora é outra e não tem esses meses: confira o De/Até.');
      const w = await BASE.gravar(CHAVE, d, 'período do fluxo de caixa'); B = d; prep(); ST = w.atualizado_em; META = BASE.fdh(w.atualizado_em) + ' · período'; S.pub = kPer(per); salva();
      MSG = '✔ Período publicado: ' + tx + ' (' + n + ' ' + (n == 1 ? 'mês' : 'meses') + '). Todos os usuários passam a ver este período (quem está com o relatório aberto, em até 30 segundos).'; ERR = false;
      try { uLog('Programação Quadrimestral: publicou o período ' + tx + ' para todos') } catch (e) { }
    } catch (x) { MSG = '⚠ NÃO publicou o período para os demais usuários: ' + (x.message || x); ERR = true }
    finally { PUBP = false; render() }
  }

  /* pedido AV — “🗑 Limpar base”: apaga a base publicada (lançamentos do Protheus e de Outras Fontes) e o rascunho, para importar uma planilha nova.
     Pedido AW: os PARÂMETROS ficam — saldo inicial de cada mês (o saldo real de banco lançado), entradas, aportes, Informe Nº e período publicado; só as bases saem.
     Grava uma base sem lançamentos ({ limpa: true, par: os parâmetros }) na mesma chave (public.bases não permite apagar linhas e nenhum SQL novo é preciso); todos passam a ver “nenhuma base publicada” (quem está com a tela aberta, em até 30 s).
     A próxima importação lê os parâmetros desse registro (up()). */
  const VAZIA = par => ({ v: 2, limpa: true, P: [], O: [], RP: [], RO: [], par: JSON.parse(JSON.stringify(par)) });
  const temPar = p => !!(p && (Object.keys(p.sal || {}).length || Object.keys(p.ent || {}).length || Object.keys(p.apo || {}).length || p.inf || p.per));
  async function limparOk() {
    if (!adm() || !B) return; MSG = 'Limpando a base…'; ERR = false; render();
    try {
      const r = await BASE.gravar(CHAVE, VAZIA(B.par), 'base limpa');
      B = null; PEND = null; ST = r.atualizado_em; META = ''; prep(); S.pub = null; FC = FP = null; SV = ''; MSG = '✔ Base limpa para todos os usuários: as bases (Protheus e Outras Fontes) foram apagadas; o saldo inicial de cada mês, as entradas, os aportes e o Informe Nº foram mantidos. Clique em “⬆ Atualizar base”, escolha a planilha e publique.'; ERR = false;
      try { uLog('Programação Quadrimestral: limpou a base importada (Protheus e Outras Fontes), mantendo o saldo inicial, as entradas e os aportes, para reimportar') } catch (e) { }
    } catch (x) { MSG = '⚠ NÃO limpou a base: ' + (x.message || x); ERR = true }
    render()
  }

  /* ---------- ações ---------- */
  window.fluxo = {
    parse, show() { try { VIEW.dataset.ok = 1 } catch (e) { } render(); nuvem() }, confere, parm, parmOk, dr, xl,
    t(k) { S.tab = k; FP = null; SV = ''; salva(); render() }, mes(m) { S.mes = m; FP = null; SV = ''; salva(); render() }, tg(k) { OPEN[k] = !isOpen(k); filtra() },
    /* filtros por clique (gráficos e tabela) */
    fp(i) { if (!CUR || i == null) return; const c = CUR.cols[i]; if (!c) return; FP = FP == c.a ? null : c.a; filtra() },
    fcat(k) { if (k == null) return; FC = FC == k ? null : k; filtra() },
    /* clique num valor da tabela = filtra categoria + período E abre os lançamentos (um clique só; na linha SAÍDAS = todas as categorias do período); clique numa barra dos gráficos = filtra E abre também.
       Para tirar o filtro: clicar de novo na MESMA barra do gráfico (só desfaz, sem abrir a janela), clicar fora do gráfico (área sem controle), Esc, ✕ no filtro, "Limpar filtros" ou o clique no título da coluna / no nome da categoria */
    cel(k, s, i) { if (!CUR || (i >= 0 && !CUR.cols[i])) return; FC = k; FP = i < 0 ? null : CUR.cols[i].a; filtra(); dr(k, s, i) },
    sai(i) { if (!CUR || (i >= 0 && !CUR.cols[i])) return; FP = i < 0 ? null : CUR.cols[i].a; filtra(); dr(null, '', i) },
    gr(i) { if (!CUR || i == null || !CUR.cols[i]) return; if (FP == CUR.cols[i].a) { FP = null; filtra(); return } FP = CUR.cols[i].a; filtra(); dr(FC, '', i) },
    gc(k) { if (!CUR || k == null) return; if (FC == k) { FC = null; filtra(); return } FC = k; filtra(); dr(k, '', fpIdx(CUR)) },
    dra(a) { const w = document.getElementById('fx-drw'); if (!DR || !w || (a != 'P' && a != 'O')) return; DR.aba = a; w.innerHTML = drHtml(); const b = document.getElementById('fx-dt-' + a); if (b) b.focus() }, /* troca de origem dentro da janela */
    drk(e) { if (!DR) return; if (e.key == 'ArrowLeft' || e.key == 'Home') { e.preventDefault(); fluxo.dra('P') } else if (e.key == 'ArrowRight' || e.key == 'End') { e.preventDefault(); fluxo.dra('O') } },
    lim(w) { if (w != 'c') FP = null; if (w != 'p') FC = null; filtra() },
    drSel() { if (CUR) dr(FC, '', fpIdx(CUR)) },
    /* admin: saldo inicial DE UM MÊS (Investimento / Contamax) digitado no cartão. Mês sem lançamento começa com a divisão calculada (a sugestão em cinza), que só muda no campo digitado.
       Apagar o campo quando o outro é zero tira o lançamento do mês (volta ao automático: saldo final do mês anterior). */
    sal(m, k, v) {
      if (!adm() || !B || !ML.includes(m) || (k != 'inv' && k != 'cmx')) return; const t = String(v).trim(), x = t === '' ? null : num(t);
      if (x != null && (!isFinite(x) || x < 0)) { SV = '⚠ Saldo inválido (use número positivo).'; keep(refresh); return }
      const cur = B.par.sal[m], o = k == 'inv' ? 'cmx' : 'inv', n = cur ? { inv: cur.inv, cmx: cur.cmx } : OP[m] != null ? { inv: IV[m], cmx: r2(OP[m] - IV[m]) } : { inv: 0, cmx: 0 };
      if (x == null && !n[o]) delete B.par.sal[m]; else { n[k] = x == null ? 0 : r2(x); B.par.sal[m] = n }
      keep(grava)
    },
    /* admin: necessidade de aporte digitada na linha do fluxo; entra no saldo acumulado da semana/mês seguinte */
    apo(i, v) {
      if (!adm() || !B || !CUR || !CUR.cols[i]) return; const x = String(v).trim() === '' ? 0 : num(v);
      if (!isFinite(x) || x < 0) { SV = '⚠ Aporte inválido (use número positivo).'; keep(refresh); return }
      const c = CUR.cols[i], a = (B.par.apo[c.m] || [0, 0, 0, 0]).slice();
      if (c.w >= 0) a[c.w] = r2(x);
      else { const r = r2(x - (a[0] + a[1] + a[2])); if (r < 0) { a[0] = a[1] = a[2] = 0; a[3] = r2(x) } else a[3] = r }
      if (tot(a)) B.par.apo[c.m] = a; else delete B.par.apo[c.m];
      keep(grava)
    },
    per(k, v) { if (!B) return; S[k] = v; FP = null; if (k == 'de' && S.ate < S.de) S.ate = S.de; if (k == 'ate' && S.ate < S.de) S.de = S.ate; salva(); render() },
    pre(t) { if (!B) return; FP = null; if (t == 'pub') { const p = padrao(); S.de = p.de; S.ate = p.ate } else { S.de = ML[0]; S.ate = t == 'all' ? ML[ML.length - 1] : ML[Math.min(3, ML.length - 1)] } salva(); render() },
    /* “Publicar período para todos” (admin): confirma e grava o De/Até da tela como o período com que todos abrem o relatório (pubperOk) */
    pubper() {
      if (!adm() || !B || !ML.length || PUBP) return; MSG = ''; ERR = false; ajusta();
      const p = padrao(), n = RM().length, tx = mlb(S.de) + ' a ' + mlb(S.ate), de = S.de, ate = S.ate;
      if (de == p.de && ate == p.ate) { render(); return } /* já é o período padrão: nada a fazer */
      dlg('Publicar o período para todos?', `Todos os usuários passarão a abrir a Programação Financeira Quadrimestral no período <b>${tx}</b> (${n} ${n == 1 ? 'mês' : 'meses'}), no lugar de ${mlb(p.de)} a ${mlb(p.ate)}. `
        + (PEND ? 'Como a planilha nova ainda está em rascunho, o período só vale para todos quando você clicar em <b>Publicar atualização</b>.' : 'Quem estiver com o relatório aberto vê a mudança em até 30 segundos. Fica registrado na Auditoria.'), () => pubperOk(de, ate))
    },
    up(i) {
      if (!adm()) { i.value = ''; return } const fl = i.files[0]; i.value = ''; if (!fl) return; const rd = new FileReader();
      rd.onload = async () => {
        try {
          const x = parse(XLSX.read(rd.result, { type: 'array', cellDates: true }));
          /* PEDIDO AT: a planilha só ATUALIZA as bases. Os parâmetros — saldo inicial (Investimento e Contamax), data-base, entradas, aportes, Informe Nº e período publicado — são os que já estão no site
             (a base em tela, com os rascunhos; sem ela, a publicada AGORA — inclusive a base LIMPA, que guarda os parâmetros) e nada deles é lido da planilha. Sem base nenhuma (1ª importação) eles começam zerados. Se não der para conferir a base publicada, não segue:
             publicar com os parâmetros zerados apagaria o que foi lançado. */
          let at = B && B.par ? B : null;
          if (!at) { try { const r = await BASE.ler(CHAVE); if (r && r.dados && r.dados.v == 2 && r.dados.par && (!r.dados.limpa || temPar(r.dados.par))) at = r.dados } catch (e) { throw new Error('não consegui conferir a base publicada para manter o saldo inicial, as entradas e os aportes (' + (e.message || e) + '). Tente de novo.') } }
          const mant = !!at; if (mant) x.par = JSON.parse(JSON.stringify(at.par))
          if (JSON.stringify(x).length > MAXB) throw new Error('a planilha é grande demais para publicar.');
          B = x; prep(); FC = FP = null; SV = ''; const n = x.P.length + x.O.length; PEND = { arq: fl.name, n, per: !!(PEND && PEND.per && B.par.per) }; /* per: o período em tela foi escolhido neste rascunho */
          let sp = ''; if (B.par.per && !perPub()) { const q = fPer(B.par.per); delete B.par.per; PEND.per = false; sp = q ? ' O período publicado (' + q + ') não existe nesta planilha: escolha o período e clique em “📤 Publicar período para todos”.' : '' } /* meses que a planilha nova não tem: volta ao padrão */
          const sem = ML.filter(m => !tot(ent(m))), ss = ML.filter(m => OP[m] == null), ab = ss.length ? ' ⚠ Sem saldo inicial lançado para ' + ss.map(mlb).join(', ') + ': informe o Investimento e o Contamax do mês no cartão Saldo inicial ou em ⚙ Parâmetros.' : '';
          ajusta(); ERR = false; MSG = n + ' lançamentos lidos de ' + fl.name + ' (' + x.P.length + ' Protheus + ' + x.O.length + ' Outras Fontes). '
            + (mant ? 'Só as duas abas de base foram lidas: o saldo inicial de cada mês, as entradas e os aportes continuam como estão no site.' + (sem.length ? ' Sem entradas lançadas em ' + sem.map(mlb).join(', ') + ' (⚙ Parâmetros).' : '') : 'Primeira importação: o saldo inicial e as entradas começam zerados — informe-os no cartão Saldo inicial e em ⚙ Parâmetros.')
            + ab + sp + ' Confira o fluxo e clique em “Publicar atualização” para liberar a todos.'; S.tab = S.tab || 'q'; render()
        } catch (e) { MSG = 'Não foi possível ler a planilha: ' + (e.message || e); ERR = true; render() }
      }; rd.readAsArrayBuffer(fl)
    },
    limpar() {
      if (!adm() || !B) return;
      dlg('Limpar a base para reimportar?', 'Apaga <b>para todos os usuários</b> a base publicada (lançamentos do Protheus e de Outras Fontes). <b>Os parâmetros são mantidos</b>: saldo inicial de cada mês (Investimento e Contamax), entradas, necessidade de aporte e Informe Nº.'
        + (PEND ? ' O rascunho ainda não publicado também é descartado (os parâmetros mostrados na tela são mantidos).' : '') + ' Depois é só clicar em <b>⬆ Atualizar base</b>, escolher a planilha nova e publicar. <b>Não dá para desfazer.</b>', limparOk)
    },
    pub() {
      if (!adm() || !PEND || !B) return; const P = PEND; MSG = 'Publicando para todos…'; ERR = false; render();
      BASE.gravar(CHAVE, B, P.arq).then(r => { ST = r.atualizado_em; META = BASE.fdh(r.atualizado_em) + ' · ' + P.arq; PEND = null; MSG = '✔ Base publicada para todos os usuários (' + P.n + ' lançamentos).' + (P.per && fPer(B.par.per) ? ' Período publicado: ' + fPer(B.par.per) + '.' : ''); ERR = false; render(); if (P.per && fPer(B.par.per)) { try { uLog('Programação Quadrimestral: publicou o período ' + fPer(B.par.per) + ' para todos (junto com a planilha ' + P.arq + ')') } catch (e) { } } })
        .catch(e => { MSG = '⚠ NÃO publicou para os demais usuários: ' + (e.message || e); ERR = true; render() })
    },
    desc() { if (!adm() || !PEND) return; PEND = null; B = null; ST = ''; IT = []; ML = []; S.pub = null; /* a tela volta ao período publicado da base publicada */ MSG = 'Atualização descartada: voltou a base publicada.'; ERR = false; render(); nuvem() },
    _: { get B() { return B }, flow, colsMes, colsPer, prep, get ML() { return ML }, get OP() { return OP }, get IV() { return IV }, set B(v) { B = v; prep(); ajusta() }, S, get FC() { return FC }, get FP() { return FP }, get FM() { return FM } }
  };
  render();
})();
