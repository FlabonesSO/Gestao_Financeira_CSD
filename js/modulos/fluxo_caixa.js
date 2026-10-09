/* Módulo Programação Financeira Quadrimestral.
   Fonte: a planilha "Fluxo de Caixa Quadrimestral" (.xlsm/.xlsx). O administrador importa o arquivo; o site lê as abas
   "Prog. Financeira (Protheus)" (valor nominal a vencer × vencimento real) e "Prog. Fin. (Outras Fontes)" (valor × data prevista de pagamento),
   agrupa as SAÍDAS pelas 15 categorias do fluxo e monta duas visões:
     • Fluxo do mês, dividido em 4 semanas (01–07, 08–14, 15–21, 22–fim do mês);
     • Fluxo do período por mês (quadrimestre), com FILTRO DE PERÍODO (De/Até) para quando houver 6 meses ou mais de dados.
   Parâmetros (saldo inicial de caixa e de aplicações, ENTRADAS e NECESSIDADE DE APORTE por semana) vêm das abas de fluxo da planilha
   (quando existirem) e podem ser ajustados pelo administrador em "⚙ Parâmetros". Tudo é gravado em public.bases (chave fluxo_projetado)
   e vale para todos os usuários (atualiza sozinho a cada 30 s). O upload só lê o arquivo (rascunho); o botão "Publicar atualização" libera a todos.
   Regras idênticas às da planilha: saldo acumulado = saldo inicial + saldo do período (+ aporte do período anterior); saída = valor positivo da origem, exibida negativa.
   MÓDULO ISOLADO: usa de js/core: $, f, br, N, ROLE, mo/closeMd (janela), BASE (base.js), saveAs, XLSX, Chart. */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="fluxo"]'); if (!VIEW) return;
  const CHAVE = 'fluxo_projetado', LS = 'csd_fluxo_v1', MAXB = 9e6;
  const CATS0 = ['Alimentação', 'Combustível e Lubrificantes', 'Contas de Consumo', 'Equipamentos/Informática', 'Folha e Benefícios', 'Impostos/Tributos e Taxas', 'Locação de Equipamentos/Veículos', 'Locação de Imóveis', 'Materiais/Peças/Ferramentas', 'Reembolso/Prestação de Contas', 'Seguros', 'Serviços de Terceiros', 'Transporte/Logística', 'Viagens/Deslocamento', 'Nota de Débito'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], PAL = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

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
    /* parâmetros: saldos iniciais, entradas e aporte vêm das abas de fluxo da própria planilha (se existirem) */
    const par = { base: '', cx: 0, ap: 0, ent: {}, apo: {}, ok: false }, lin = (a, t) => a && a.find(r => H(r[1]).startsWith(t));
    const mz = rows(n => n.includes('mensal') && !n.includes('quadr')), qd = rows(n => n.includes('quadrimestral') && !/1$/.test(n.trim()));
    [mz, qd].forEach(a => { if (!a) return; const c = lin(a, 'saldo inicial de caixa'), x = lin(a, 'saldo inicial de aplic'); if (c && isFinite(num(c[2])) && !par.ok) { par.cx = r2(num(c[2])); par.ap = x && isFinite(num(x[2])) ? r2(num(x[2])) : 0; par.ok = true } });
    if (mz) {
      const pr = mz.find(r => r.some(x => /\d{2}\/\d{2}\/\d{4}/.test(String(x)))), dd = pr && isoD(String(pr.find(x => /\d{2}\/\d{2}\/\d{4}/.test(String(x)))));
      if (dd) par.base = dd.slice(0, 7);
      const e = lin(mz, '(+) entradas'), t = lin(mz, 'necessidade de aporte'), w = r => [2, 3, 4, 5].map(i => isFinite(num(r[i])) ? r6(num(r[i])) : 0);
      if (par.base && e) par.ent[par.base] = w(e); if (par.base && t) par.apo[par.base] = w(t)
    }
    if (qd) {
      const h = qd.find(r => H(r[1]).startsWith('categoria')), e = lin(qd, '(+) entradas'), t = lin(qd, 'necessidade de aporte');
      if (h) for (let i = 2; i <= 9; i++) { const d = isoD(h[i]); if (!d) continue; const m = d.slice(0, 7);
        if (e && !par.ent[m] && isFinite(num(e[i]))) par.ent[m] = [0, 0, 0, r6(num(e[i]))]; if (t && !par.apo[m] && isFinite(num(t[i]))) par.apo[m] = [0, 0, 0, r6(num(t[i]))] }
    }
    if (!par.base) { const ms = P.map(x => x[3]).concat(O.map(x => x[3])).map(d => d.slice(0, 7)).sort(); par.base = ms[0] }
    par.inf = ''; [mz, qd].forEach(a => { if (!a || par.inf) return; a.forEach(r => { const j = r.findIndex(x => H(x).startsWith('informe')); if (j >= 0 && !par.inf) par.inf = String(r[j + 1] == null ? '' : r[j + 1]).trim() }) }); /* “Informe Nº” do cabeçalho da planilha */
    par.inv = par.ap; par.cmx = par.cx; /* a planilha traz caixa + aplicações; o admin redistribui entre Investimento e Contamax no site */
    return { v: 2, P, O, par, RP, RO }
  }

  /* ---------- cálculo ---------- */
  let B = null, IT = [], IX = {}, ML = [], OP = {}, MT = {};
  function prep() {
    IT = []; IX = {}; MT = {}; OP = {}; ML = [];
    if (!B) return;
    if (B.par.inv == null) { B.par.inv = B.par.ap || 0; B.par.cmx = B.par.cx || 0 } /* bases publicadas antes da divisão Investimento / Contamax */
    B.P.forEach(r => IT.push({ s: 'P', f: r[0], t: r[1], tp: r[2], d: r[3], v: r[4], c: r[5], h: r[6] }));
    B.O.forEach(r => IT.push({ s: 'O', f: r[0], se: r[1], rs: r[2], d: r[3], v: r[4], c: r[5], h: r[6], pe: r[7] }));
    IT.forEach(x => { (IX[x.s + '|' + x.c] = IX[x.s + '|' + x.c] || []).push(x); const m = x.d.slice(0, 7); MT[m] = (MT[m] || 0) + x.v });
    const ms = new Set(IT.map(x => x.d.slice(0, 7))); Object.keys(B.par.ent || {}).forEach(m => ms.add(m)); ms.add(B.par.base);
    const a = [...ms].sort(), z = a[a.length - 1]; for (let m = a[0]; m <= z; m = addM(m, 1)) ML.push(m);
    /* saldo de abertura de cada mês, a partir do mês-base: abertura(base) = caixa + aplicações; abertura(m+1) = abertura(m) + entradas − saídas + aporte */
    let o = r2(B.par.inv + B.par.cmx); ML.filter(m => m >= B.par.base).forEach(m => { OP[m] = o; o = o + tot(ent(m)) - (MT[m] || 0) + tot(apo(m)) })
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
    const L = cols.length - 1, last = R.acc[L];
    R.T = { ent: tot(R.ent), sai: tot(R.sai), sal: tot(R.sal), apo: tot(R.apo), acc: last == null ? null : last + R.apo[L], op: OP[cols[0].m] == null ? null : OP[cols[0].m] };
    R.TC = {}; CT.forEach(k => { R.TC[k] = { t: tot(R.cat[k]), O: tot(R.sub[k].O), P: tot(R.sub[k].P) } });
    return R
  }

  /* ---------- estado ---------- */
  let SV = '', S = { tab: 'q', de: '', ate: '', mes: '', exp: false }, PEND = null, META = '', ST = '', MSG = '', ERR = false, CUR = null, CH = {}, OPEN = {}, FC = null, FP = null, QUIET = false; /* FC = categoria filtrada · FP = início (data) da coluna/período filtrado — filtros só de tela, não são gravados */
  try { Object.assign(S, JSON.parse(localStorage.getItem(LS)) || {}) } catch (e) { }
  const salva = () => { try { localStorage.setItem(LS, JSON.stringify({ tab: S.tab, de: S.de, ate: S.ate, mes: S.mes })) } catch (e) { } }, adm = () => ROLE == 'admin';
  function ajusta() {
    if (!B || !ML.length) return;
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
    <button class="btn2 adm" title="Lê a planilha Fluxo de Caixa Quadrimestral (.xlsm/.xlsx); só publica quando você clicar em Publicar atualização" onclick="document.getElementById('fx-fi').click()">⬆ Atualizar base</button><input id="fx-fi" type="file" accept=".xlsx,.xlsm,.xls" class="hidden" onchange="fluxo.up(this)">
    ${B ? '<button class="btn2 adm" title="Saldo inicial, entradas e aporte" onclick="fluxo.parm()">⚙ Parâmetros</button><button class="btn2" onclick="fluxo.xl()">Excel</button>' : ''}</div>
    ${PEND ? `<div id="fx-pend" class="adm flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm"><span class="mr-auto">⚠ <b>Atualização ainda não publicada</b>: ${PEND.n} linhas lidas de “${esc(PEND.arq)}”. Só você vê estes dados até publicar.</span><button class="btn" onclick="fluxo.pub()">📤 Publicar atualização</button><button class="btn2" onclick="fluxo.desc()">Descartar</button></div>` : ''}
    ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  /* a base guarda as linhas completas das duas abas? (publicações antigas guardavam só as colunas usadas no cálculo) */
  const completa = () => !!(B && Array.isArray(B.RP) && Array.isArray(B.RO) && B.RP.length >= B.P.length && B.RO.length >= B.O.length && B.RP.every(r => r.length == 23) && B.RO.every(r => r.length == 10));
  const aviso = () => B && !completa() ? `<div id="fx-old" class="mt-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">⚠ <b>Base publicada em versão anterior</b>: ela não guarda as colunas completas das abas “Prog. Financeira (Protheus)” e “Prog. Fin. (Outras Fontes)”, então o Excel não será gerado. ${adm() ? 'Clique em <b>⬆ Atualizar base</b>, escolha a planilha .xlsm e depois em <b>Publicar atualização</b> (uma única vez).' : 'Peça ao administrador para importar a planilha .xlsm de novo e publicar.'}</div>` : '';
  const vazio = () => `<div class="card py-12 text-center"><div class="text-4xl mb-2">📊</div><p class="font-semibold">Nenhuma base de fluxo de caixa publicada ainda</p><p class="text-sm text-slate-500 mt-1">${adm() ? 'Clique em “Atualizar base” e escolha a planilha Fluxo de Caixa Quadrimestral (.xlsm).' : 'Peça ao administrador para publicar a planilha do fluxo de caixa.'}</p></div>`;
  function perBar() {
    const sel = (id, v, k) => `<select id="${id}" class="inp !py-1 font-semibold" onchange="fluxo.per('${k}',this.value)">${ML.map(m => `<option value="${m}" ${m == v ? 'selected' : ''}>${mlb(m)}</option>`).join('')}</select>`,
      btn = (l, t, a) => `<button type="button" class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 hover:bg-indigo-500/20" title="${t}" onclick="${a}">${l}</button>`, n = RM().length;
    return `<div id="fx-per" class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 px-4 py-2.5">
      <div class="text-xs font-bold uppercase tracking-wide self-center">📅 Período</div>
      <label class="text-xs font-semibold uppercase tracking-wide">De<span class="block mt-0.5">${sel('fx-de', S.de, 'de')}</span></label>
      <label class="text-xs font-semibold uppercase tracking-wide">Até<span class="block mt-0.5">${sel('fx-ate', S.ate, 'ate')}</span></label>
      <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-center"><div class="text-[10px] font-semibold uppercase tracking-wide">Período</div><div id="fx-n" class="text-2xl font-bold leading-tight">${n} <span class="text-sm font-semibold">${n == 1 ? 'mês' : 'meses'}</span></div></div>
      <div class="flex flex-wrap items-center gap-1.5 self-center">${btn('Quadrimestre', 'Primeiros 4 meses da base', "fluxo.pre('q')")}${btn('Todos os meses', 'Todos os meses com dados (' + ML.length + ')', "fluxo.pre('all')")}</div>
      <div class="text-xs self-center">Dados de ${mlb(ML[0])} a ${mlb(ML[ML.length - 1])} · ${ML.length} meses</div></div>`
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
  const kp = (t, v, s, c, i, tom) => `<div class="card py-3 min-w-0"><div style="container-type:inline-size"><div class="flex items-start justify-between gap-2"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold leading-tight pt-0.5">${t}</div>${sel_(i, tom)}</div>
    <div class="text-lg font-bold mt-1.5 whitespace-nowrap tabular-nums leading-tight ${c || ''}" style="font-size:clamp(.95rem,8.6cqw,1.4rem)">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div></div>`;
  function alertas(R, rm) {
    const A = [], T = R.T;
    const neg = R.cols.map((c, i) => [c, R.acc[i]]).filter(x => x[1] != null && x[1] < 0); if (neg.length) A.push(['warn', 'Saldo acumulado <b>negativo</b> em ' + neg.map(x => x[0].lb + (x[0].w < 0 ? '' : ' ' + x[0].sb) + ': ' + f(x[1])).join(' · ') + '. Avalie a necessidade de aporte.'])
    const sem = rm.filter(m => !B.par.ent[m] || !tot(ent(m))); if (sem.length) A.push(['warn', 'Sem <b>entradas</b> informadas para ' + sem.map(mlb).join(', ') + ': o fluxo considera R$ 0,00 de entrada nesses meses' + (adm() ? ' (ajuste em ⚙ Parâmetros).' : '. Peça ao administrador para informar em Parâmetros.')]);
    const ex = cats().filter(c => !CATS0.includes(c)); if (ex.length) A.push(['warn', 'Categoria(s) fora das 15 do fluxo: <b>' + ex.map(esc).join(', ') + '</b>. Entram nos totais em linhas próprias.']);
    const top = R.CT.map(k => [k, R.TC[k].t]).sort((a, b) => b[1] - a[1])[0]; if (top && T.sai && top[1] / T.sai > .3) A.push(['info', 'Concentração: <b>' + esc(top[0]) + '</b> responde por <b>' + (top[1] / T.sai * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</b> das saídas do período.']);
    return A
  }
  /* coluna filtrada (índice em R.cols) e categoria filtrada — somem sozinhas quando deixam de existir no período mostrado */
  const fpIdx = R => { if (!FP) return -1; const i = R.cols.findIndex(c => c.a == FP); if (i < 0) FP = null; return i },
    fcOk = R => { if (FC && !R.CT.includes(FC)) FC = null; return FC }, isOpen = k => S.exp || (OPEN[k] != null ? OPEN[k] : FC == k), kq = k => JSON.stringify(k).replace(/"/g, '&quot;'), clb = c => c.lb + (c.sb ? ' ' + c.sb : '');
  function graficos(R) {
    Object.values(CH).forEach(c => c.destroy()); CH = {}; const tc = Chart.defaults.color, el1 = document.getElementById('fx-c1'), el2 = document.getElementById('fx-c2'); if (!el1 || !el2) return;
    const sel = fpIdx(R), fc = fcOk(R), an = QUIET ? false : undefined, pt = (e, els) => { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default' };
    const lb = R.cols.map(c => c.sb ? [c.lb, c.sb] : c.lb), sh = R.cols.length <= 6, dl = (o) => ({ display: sh, color: tc, font: { size: 10, weight: 'bold' }, formatter: v => cmp(v), ...o }),
      dim = c => ctx => sel < 0 || ctx.dataIndex == sel ? c : c + '4d'; /* coluna filtrada em cor cheia, as demais esmaecidas */
    CH.a = new Chart(el1, { type: 'bar', data: { labels: lb, datasets: [{ type: 'bar', label: 'Entradas', data: R.ent, backgroundColor: dim(PAL[1]), borderRadius: 5, maxBarThickness: 38, yAxisID: 'y', order: 2, datalabels: dl({ anchor: 'end', align: 'end' }) },
      { type: 'bar', label: fc ? 'Saídas · ' + (fc.length > 26 ? fc.slice(0, 25) + '…' : fc) : 'Saídas', data: fc ? R.cat[fc] : R.sai, backgroundColor: dim(PAL[3]), borderRadius: 5, maxBarThickness: 38, yAxisID: 'y', order: 2, datalabels: dl({ anchor: 'end', align: 'end' }) },
      { type: 'line', label: 'Saldo acumulado', data: R.acc, borderColor: PAL[0], backgroundColor: PAL[0], borderWidth: 3, pointRadius: ctx => ctx.dataIndex == sel ? 8 : 4, pointBackgroundColor: ctx => sel < 0 || ctx.dataIndex == sel ? PAL[0] : PAL[0] + '66', tension: .25, yAxisID: 'y1', order: 1, datalabels: dl({ align: 'top', offset: 6, display: R.cols.length <= 8, color: PAL[0] }) }] },
      options: { animation: an, responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, onHover: pt, onClick: (e, _, ch) => { const it = ch.getElementsAtEventForMode(e, 'index', { intersect: false }, true); if (it.length) fluxo.fp(it[0].index) },
        scales: { x: { grid: { display: false } }, y: { display: false, beginAtZero: true, grace: '18%' }, y1: { display: false, position: 'right', grace: '12%' } },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + f(c.parsed.y) } } } } });
    const cs = R.CT.map(k => [k, sel < 0 ? R.TC[k].t : R.cat[k][sel]]).filter(a => a[1] > 0 || a[0] == fc).sort((a, b) => b[1] - a[1]);
    CH.b = new Chart(el2, { type: 'bar', data: { labels: cs.map(a => a[0]), datasets: [{ data: cs.map(a => a[1]), backgroundColor: ctx => !fc || cs[ctx.dataIndex][0] == fc ? PAL[3] : PAL[3] + '4d' /* vermelho = saídas, igual ao gráfico de entradas × saídas; categoria filtrada em cor cheia */, borderRadius: 4, maxBarThickness: 18 }] },
      options: { animation: an, indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 64 } }, interaction: { mode: 'index', axis: 'y', intersect: false }, onHover: pt, onClick: (e, _, ch) => { const it = ch.getElementsAtEventForMode(e, 'index', { axis: 'y', intersect: false }, true); if (it.length && cs[it[0].index]) fluxo.fcat(cs[it[0].index][0]) },
        scales: { x: { display: false, beginAtZero: true }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
        plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'end', color: tc, font: { size: 10, weight: 'bold' }, formatter: v => cmp(v) }, tooltip: { callbacks: { label: c => ' ' + f(c.parsed.x) } } } } })
  }
  /* tabela no formato da planilha: ENTRADAS, SAÍDAS, categorias (com origem Outras Fontes / Protheus), saldo, saldo acumulado, aporte */
  function tabela(R) {
    const sel = fpIdx(R), fc = fcOk(R), pc = i => sel < 0 || i < 0 ? '' : i == sel ? 'bg-indigo-500/10' : 'opacity-40', /* coluna filtrada em destaque, as outras esmaecidas */
      nz = v => v == null ? '<span class="text-slate-400">—</span>' : Math.abs(v) < .005 ? '<span class="text-slate-400">–</span>' : fn(v), cl = v => v != null && v < -.005 ? 'text-rose-600' : '',
      fpAt = i => i < 0 ? '' : ` onclick="fluxo.fp(${i})" title="Clique para filtrar este período"`, hv = i => i < 0 ? '' : 'cursor-pointer hover:bg-indigo-500/10',
      td = (v, o = '', at = '') => `<td class="px-3 py-1 text-right whitespace-nowrap ${cl(v)} ${o}"${at}>${nz(v)}</td>`,
      cell = (k, s, i, v) => { const on = fc == k && i == sel; return v < .005 ? `<td class="px-3 py-1 text-right text-slate-400 ${pc(i)}">–</td>` : `<td class="px-3 py-1 text-right whitespace-nowrap text-rose-600 cursor-pointer hover:bg-indigo-500/10 ${on ? 'bg-indigo-500/20 font-bold' : pc(i)}" title="${on ? 'Clique de novo para ver os lançamentos' : 'Clique para filtrar esta categoria e este período'}" onclick="fluxo.cel(${kq(k)},'${s}',${i})">${fn(-v)}</td>` },
      thc = R.cols.map((c, i) => `<th class="px-3 py-2 text-right cursor-pointer select-none ${i == sel ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-500/10 ' + pc(i)}" title="Clique para filtrar este período" onclick="fluxo.fp(${i})">${esc(c.lb)}${c.sb ? '<div class="text-[10px] font-normal normal-case">' + c.sb + '</div>' : ''}</th>`).join(''),
      row = (t, a, T, o = {}) => `<tr class="border-t border-slate-200 dark:border-slate-800 ${o.bg || ''} ${o.b ? 'font-bold' : ''}"><td class="px-3 py-1 sticky left-0 z-[1] ${o.bg ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'} whitespace-nowrap">${t}</td>${a.map((v, i) => td(v == null ? null : v, (o.c || '') + ' ' + hv(i) + ' ' + pc(i), fpAt(i))).join('')}${td(T, 'font-bold bg-slate-50 dark:bg-slate-800/60')}</tr>`;
    const neg = a => a.map(v => -v);
    let h = `<div id="fx-tw" class="card p-0 overflow-x-auto"><table class="w-full text-[13px]"><thead class="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr><th class="px-3 py-2 text-left sticky left-0 bg-slate-100 dark:bg-slate-800 min-w-[260px]">Categoria (R$)</th>${thc}<th class="px-3 py-2 text-right">${S.tab == 'm' ? 'Total mês' : 'Total acumulado'}</th></tr></thead><tbody>`;
    h += row('(+) ENTRADAS <span class="font-normal text-xs text-slate-500">(NF líquida de sinal e retenção)</span>', R.ent, R.T.ent, { c: 'text-emerald-600', b: 1 });
    h += row('(−) SAÍDAS', neg(R.sai), -R.T.sai, { b: 1, bg: 'bg-slate-100 dark:bg-slate-800' });
    R.CT.forEach(k => {
      if (fc && k != fc) return; /* categoria filtrada: só ela aparece */
      const op = isOpen(k), tc = R.TC[k]; if (!tc.t && !CATS0.includes(k)) return;
      h += `<tr class="border-t border-slate-200 dark:border-slate-800 font-semibold"><td class="px-3 py-1 sticky left-0 z-[1] ${fc == k ? 'bg-indigo-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'} whitespace-nowrap select-none"><span class="inline-block w-5 text-center cursor-pointer rounded hover:bg-indigo-500/20" title="Expandir/recolher as origens (Outras Fontes / Protheus)" onclick="fluxo.tg(${kq(k)})">${op ? '▾' : '▸'}</span><span class="cursor-pointer hover:underline ${fc == k ? 'text-indigo-600 dark:text-indigo-300' : ''}" title="${fc == k ? 'Clique para remover o filtro' : 'Clique para filtrar esta categoria'}" onclick="fluxo.fcat(${kq(k)})">${esc(k)}</span></td>${R.cat[k].map((v, i) => cell(k, '', i, v)).join('')}${cell(k, '', -1, tc.t).replace('px-3 py-1', 'px-3 py-1 bg-slate-50 dark:bg-slate-800/60 font-bold')}</tr>`;
      if (op) [['O', 'Outras Fontes'], ['P', 'Protheus']].forEach(([s, n]) => { h += `<tr class="border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500"><td class="pl-9 pr-3 py-1 sticky left-0 z-[1] bg-white dark:bg-slate-900 whitespace-nowrap">${n}</td>${R.sub[k][s].map((v, i) => cell(k, s, i, v)).join('')}${cell(k, s, -1, tc[s])}</tr>` })
    });
    h += row('SALDO DO PERÍODO', R.sal, R.T.sal, { b: 1, bg: 'bg-slate-100 dark:bg-slate-800' });
    h += row('SALDO ACUMULADO', R.acc, R.T.acc, { b: 1, c: 'text-indigo-600 dark:text-indigo-300' });
    const nxt = S.tab == 'm' ? 'semana' : 'mês', ed = adm();
    h += `<tr class="border-t-2 border-slate-300 dark:border-slate-700"><td class="px-3 py-1 sticky left-0 z-[1] bg-white dark:bg-slate-900 whitespace-nowrap font-semibold">NECESSIDADE DE APORTE <span class="block font-normal text-[10px] text-slate-500">${ed ? 'digite o valor · ' : ''}entra no saldo da ${nxt} seguinte</span></td>${R.apo.map((v, i) => ed ? `<td class="px-1.5 py-1 ${pc(i)}"><input id="fx-ap${i}" class="inp w-full min-w-[104px] !px-2 !py-0.5 text-right font-semibold" value="${v ? fn(v) : ''}" placeholder="0,00" inputmode="decimal" title="${S.tab == 'm' ? 'Aporte no fim desta semana' : 'Aporte no fim do mês (semana 4)'}" onfocus="this.select()" onchange="fluxo.apo(${i},this.value)"></td>` : td(v, pc(i))).join('')}${td(R.T.apo, 'font-bold bg-slate-50 dark:bg-slate-800/60')}</tr>`;
    return h + '</tbody></table></div>'
  }
  /* valores dos cartões conforme os filtros: período (coluna) muda entradas, saídas, saldos; categoria muda só as saídas */
  function vis(R, i, fc) {
    const a = i < 0, T = R.T, ac = a ? T.acc : (R.acc[i] == null ? null : r2(R.acc[i] + R.apo[i]));
    return { ent: a ? T.ent : R.ent[i], saiAll: a ? T.sai : R.sai[i], sai: fc ? (a ? R.TC[fc].t : R.cat[fc][i]) : (a ? T.sai : R.sai[i]), sal: a ? T.sal : R.sal[i], apo: a ? T.apo : R.apo[i], op: a ? T.op : (R.acc[i] == null ? null : r2(R.acc[i] - R.sal[i])), acc: ac }
  }
  function kSaldo(T, V, ti) {
    const ed = adm(), b = B.par, cx = (k, l) => ed ? `<label class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">${l}<input id="fx-s${k}" class="inp w-full mt-0.5 !px-2 !py-1 text-right text-sm font-semibold normal-case tracking-normal" value="${b[k] ? fn(b[k]) : ''}" placeholder="0,00" inputmode="decimal" onfocus="this.select()" onchange="fluxo.sal('${k}',this.value)"></label>`
      : `<div><div class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${l}</div><div class="text-sm font-semibold">${f(b[k] || 0)}</div></div>`;
    return `<div class="card py-3 flex flex-wrap items-center gap-x-8 gap-y-3"><div class="flex items-center gap-3">${sel_('cofre', 'ind')}<div><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold leading-tight">Saldo inicial${ti ? ' · ' + esc(ti) : ''}</div><div class="text-2xl font-bold mt-0.5 whitespace-nowrap tabular-nums leading-tight">${V.op == null ? '—' : f(V.op)}</div></div></div>
      <div class="grid grid-cols-2 gap-3 flex-1 min-w-[18rem] max-w-xl">${cx('inv', 'Investimento')}${cx('cmx', 'Contamax')}</div>
      <div class="text-[11px] text-slate-500 basis-full xl:basis-auto xl:max-w-xs">Investimento + Contamax em ${mlb(b.base)} (data-base)${ed ? ' · só o admin edita' : ''}${T.op != null && Math.abs(T.op - (b.inv + b.cmx)) > .005 ? ' · o saldo do período já inclui a movimentação desde a data-base' : ''}</div></div>`
  }
  /* barra de filtros: mostra o que está filtrado (cada item some ao clicar no ✕) ou a dica de uso */
  function fbar(R, sel, fc) {
    const chip = (t, v, a) => `<span class="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white pl-3 pr-1.5 py-0.5 text-xs font-semibold"><span class="font-normal opacity-80">${t}:</span> ${esc(v)}<button type="button" class="ml-0.5 w-5 h-5 rounded-full hover:bg-white/25 leading-none" title="Remover este filtro" onclick="${a}">✕</button></span>`;
    if (sel < 0 && !fc) return `<div id="fx-flt" class="text-xs text-slate-500 flex items-center gap-2 px-1"><span>🖱</span><span>Interativo: clique numa barra do gráfico, numa categoria ou num valor da tabela para filtrar · clique de novo no valor filtrado para ver os lançamentos.</span></div>`;
    return `<div id="fx-flt" class="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2"><span class="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">🔎 Filtrando</span>
      ${sel >= 0 ? chip('Período', clb(R.cols[sel]), "fluxo.lim('p')") : ''}${fc ? chip('Categoria', fc, "fluxo.lim('c')") : ''}
      <span class="mr-auto"></span><button class="btn2 !py-1 text-xs" title="Lista os lançamentos do filtro" onclick="fluxo.drSel()">Ver lançamentos</button><button class="btn2 !py-1 text-xs" onclick="fluxo.lim()">Limpar filtros</button></div>`
  }
  function dyn() {
    ajusta(); const rm = RM(), mes = S.tab == 'm', R = flow(mes ? colsMes(S.mes) : colsPer(rm)), T = R.T; CUR = R;
    const sel = fpIdx(R), fc = fcOk(R), V = vis(R, sel, fc), ti = sel >= 0 ? clb(R.cols[sel]) : '', cn = fc ? (fc.length > 22 ? fc.slice(0, 21) + '…' : fc) : '';
    const A = alertas(R, mes ? [S.mes] : rm), esc1 = sel >= 0 ? ' · ' + ti : '';
    const subS = fc ? (V.saiAll ? (V.sai / V.saiAll * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% das saídas ' + (sel >= 0 ? 'de ' + R.cols[sel].lb : 'do período') : '') : (V.sai && V.ent ? (V.sai / V.ent * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% das entradas' : '');
    return `${fbar(R, sel, fc)}${kSaldo(T, V, ti)}<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kp('Entradas' + esc1, f(V.ent), '', 'text-emerald-600', 'sobe', 'ver')}${kp('Saídas' + (fc ? ' · ' + esc(cn) : esc1), f(-V.sai), subS, 'text-rose-600', 'desce', 'verm')}${kp('Saldo do período' + esc1, f(V.sal), fc ? 'considera todas as categorias' : '', V.sal < 0 ? 'text-rose-600' : 'text-emerald-600', 'balanca', 'amb')}${kp('Saldo final' + esc1, V.acc == null ? '—' : f(V.acc), 'após aporte de ' + f(V.apo), V.acc != null && V.acc < 0 ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-300', 'bandeira', 'ind')}</div>
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
      if (r && r.dados && r.dados.v == 2 && Array.isArray(r.dados.P)) { META = BASE.fdh(r.atualizado_em) + (r.arquivo ? ' · ' + r.arquivo : ''); if (r.atualizado_em != ST) { ST = r.atualizado_em; B = r.dados; prep() } render() }
      else if (!B) { if (r && r.dados) { MSG = 'A base publicada está no formato antigo. ' + (adm() ? 'Importe de novo a planilha Fluxo de Caixa Quadrimestral.' : 'Peça ao administrador para publicar de novo.'); ERR = true } render() }
    } catch (e) { MSG = 'Não consegui carregar a base: ' + (e.message || e) + '. Confira se o SQL supabase/bases-dados.sql foi executado.'; ERR = true; render() }
  }
  const aberto = () => !!document.querySelector('[data-view="fluxo"]:not(.hidden)');
  async function confere() {
    const c = BASE.cli(); if (!c || document.hidden || !aberto() || PEND) return;
    try { const { data } = await c.from('bases').select('atualizado_em').eq('chave', CHAVE).maybeSingle(); if (data && data.atualizado_em && data.atualizado_em != ST) { const a = ST; await nuvem(); if (ST != a && a) { MSG = '🔄 Base atualizada automaticamente (publicada em ' + META + ').'; ERR = false; render() } } } catch (e) { }
  }
  setInterval(confere, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) confere() });

  /* ---------- parâmetros (admin) ---------- */
  function parm() {
    if (!adm() || !B) return; const inp = (id, v) => `<input id="${id}" class="inp w-full min-w-[10.5rem] !px-2 !py-1.5 text-right text-sm font-semibold" value="${v ? fn(v) : ''}" placeholder="0,00" inputmode="decimal" onfocus="this.select()">`;
    mo(`<h2 class="text-lg font-bold mb-1">Entradas previstas</h2><p class="text-sm text-slate-500 mb-3">Valem para todos os usuários assim que você salvar. S1 = dias 1–7, S2 = 8–14, S3 = 15–21, S4 = 22–fim do mês. O saldo inicial (Investimento e Contamax) e a necessidade de aporte são digitados direto na tela do fluxo.</p>
    <div class="overflow-auto" style="max-height:52vh"><table class="w-full text-xs"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr><th class="px-2 py-1 text-left">Mês</th>${['S1', 'S2', 'S3', 'S4'].map(s => `<th class="px-1 py-1">Entradas ${s}</th>`).join('')}</tr></thead>
    <tbody>${ML.map((m, i) => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 font-semibold whitespace-nowrap">${mlb(m)}</td>${[0, 1, 2, 3].map(w => `<td class="px-1 py-1">${inp('fp-e' + i + '-' + w, ent(m)[w])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p id="fp-e" class="hidden text-sm text-rose-500 mt-2"></p><div class="flex justify-end gap-2 mt-3"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="fluxo.parmOk()">Salvar para todos</button></div>`);
    const w = document.getElementById('mdb'); if (w) w.style.maxWidth = '58rem'
  }
  async function parmOk() {
    const v = id => { const s = document.getElementById(id).value.trim(); return s === '' ? 0 : num(s) }, er = m => { const x = document.getElementById('fp-e'); x.textContent = m; x.classList.remove('hidden') };
    const e = {}; for (let i = 0; i < ML.length; i++) { const E = []; for (let w = 0; w < 4; w++) { const x = v('fp-e' + i + '-' + w); if (!isFinite(x) || x < 0) return er('Valor inválido em ' + mlb(ML[i]) + ' (use números positivos).'); E.push(r2(x)) } if (tot(E)) e[ML[i]] = E }
    closeMd(); B.par = { ...B.par, ent: e, ok: true, man: true }; prep(); ajusta();
    if (PEND) { MSG = 'Entradas atualizadas no rascunho. Publique a atualização para valerem para todos.'; ERR = false; render(); return }
    MSG = 'Publicando entradas…'; ERR = false; render();
    try { const r = await BASE.gravar(CHAVE, B, 'entradas do fluxo de caixa'); ST = r.atualizado_em; META = BASE.fdh(r.atualizado_em) + ' · entradas'; MSG = '✔ Entradas salvas para todos os usuários.'; ERR = false } catch (x) { MSG = '⚠ Não salvei as entradas: ' + (x.message || x); ERR = true } render()
  }

  /* ---------- lançamentos de uma célula ---------- */
  function dr(k, s, i) {
    if (!CUR) return; const c = i < 0 ? { a: CUR.cols[0].a, b: CUR.cols[CUR.cols.length - 1].b, lb: 'Total' } : CUR.cols[i];
    const L = IT.filter(x => (k == null || x.c == k) && (!s || x.s == s) && x.d >= c.a && x.d <= c.b).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : b.v - a.v), t = L.reduce((q, x) => q + x.v, 0);
    mo(`<h2 class="text-lg font-bold mb-1">${k == null ? 'Todas as categorias' : esc(k)}${s ? ' · ' + (s == 'O' ? 'Outras Fontes' : 'Protheus') : ''}</h2><p class="text-sm text-slate-500 mb-3">${br(c.a)} a ${br(c.b)} · ${L.length} lançamento(s)${L.length > 600 ? ' (mostrando os 600 primeiros)' : ''} · total <b>${f(t)}</b></p>
    <div class="overflow-auto" style="max-height:60vh"><table class="w-full text-xs whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr><th class="px-2 py-1 text-left">Data</th><th class="px-2 py-1 text-left">Origem</th><th class="px-2 py-1 text-left">Fornecedor</th><th class="px-2 py-1 text-left">Descrição</th><th class="px-2 py-1 text-right">Valor</th></tr></thead>
    <tbody>${L.slice(0, 600).map(x => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1">${br(x.d)}</td><td class="px-2 py-1">${x.s == 'O' ? 'Outras Fontes' : 'Protheus'}</td><td class="px-2 py-1 max-w-[260px] truncate" title="${esc(x.f)}">${esc(x.f)}</td><td class="px-2 py-1 max-w-[260px] truncate" title="${esc(x.h)}">${esc(x.h) || '—'}${x.s == 'P' && x.t ? ' <span class="text-slate-400">· ' + esc(x.tp) + ' ' + esc(x.t) + '</span>' : ''}</td><td class="px-2 py-1 text-right">${fn(x.v)}</td></tr>`).join('')}</tbody></table></div>
    <div class="flex justify-end mt-3"><button class="btn2" onclick="closeMd()">Fechar</button></div>`); const wd = document.getElementById('mdb'); if (wd) wd.style.maxWidth = '60rem'
  }

  /* ---------- Excel ---------- */
  /* Excel na planilha ORIGINAL completa: bases Protheus e Outras Fontes + UM Mensal (4 semanas do 1º mês do período) + o Quadrimestral (4 meses; meses além do 4º vão para Quadri. 2…), tudo ligado por fórmulas e hiperlinks */
  async function xl() {
    if (!B) return; if (!completa()) { MSG = '⚠ Não gerei o Excel: a base publicada é de uma versão anterior e não guarda as colunas completas das abas Protheus e Outras Fontes. ' + (adm() ? 'Clique em ⬆ Atualizar base, escolha a planilha .xlsm e depois em Publicar atualização.' : 'Peça ao administrador para importar a planilha .xlsm de novo e publicar.'); ERR = true; render(); return } ajusta(); const rm = RM(), P2 = n => String(n).padStart(2, '0'), cats15 = CATS0.slice(0, 15), base = B.par, qn = n => "'" + String(n).replace(/'/g, "''") + "'";
    const ser = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 + 25569;
    const MN = 'Fluxo de Caixa - Mensal', m0 = rm[0];
    const abre = m => { const o = OP[m]; return o == null ? [0, 0] : [r2(o - base.inv), r2(base.inv)] }, /* [caixa (C6), aplicações (C7)] — no mês-base: Contamax / Investimento */
      mk = R => ({ O: cats15.map(k => (R.sub[k] ? R.sub[k].O : [0, 0, 0, 0])), P: cats15.map(k => (R.sub[k] ? R.sub[k].P : [0, 0, 0, 0])), sai: R.sai, ent: R.ent, apo: R.apo, ext: R.CT.some(k => !cats15.includes(k) && R.TC[k].t) }),
      per = (a, b) => '01/' + a.slice(5) + '/' + a.slice(0, 4) + ' a ' + P2(eom(b)) + '/' + b.slice(5) + '/' + b.slice(0, 4), inf = base.inf == null ? '001/2026' : base.inf;
    const abas = [], uso = (arr, n) => [0, 1, 2, 3].map(i => i < n ? (arr[i] || 0) : 0), pad4 = (a, v) => [0, 1, 2, 3].map(i => a[i] != null ? a[i] : v);
    /* igual à planilha: UMA aba mensal (4 semanas) só do 1º mês do período — o mês seguinte à data-base, no filtro padrão — e a quadrimestral (a coluna do 1º mês é ligada à mensal) */
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

  /* ---------- ações ---------- */
  window.fluxo = {
    parse, show() { try { VIEW.dataset.ok = 1 } catch (e) { } render(); nuvem() }, confere, parm, parmOk, dr, xl,
    t(k) { S.tab = k; FP = null; SV = ''; salva(); render() }, mes(m) { S.mes = m; FP = null; SV = ''; salva(); render() }, tg(k) { OPEN[k] = !isOpen(k); filtra() },
    /* filtros por clique (gráficos e tabela) */
    fp(i) { if (!CUR || i == null) return; const c = CUR.cols[i]; if (!c) return; FP = FP == c.a ? null : c.a; filtra() },
    fcat(k) { if (k == null) return; FC = FC == k ? null : k; filtra() },
    /* clique num valor = filtra categoria + período; clique de novo no mesmo valor (já filtrado) = abre os lançamentos */
    cel(k, s, i) { if (!CUR) return; const key = i < 0 || !CUR.cols[i] ? null : CUR.cols[i].a; if (FC == k && FP == key) return dr(k, s, i); FC = k; FP = key; filtra() },
    lim(w) { if (w != 'c') FP = null; if (w != 'p') FC = null; filtra() },
    drSel() { if (CUR) dr(FC, '', fpIdx(CUR)) },
    /* admin: saldo inicial (Investimento / Contamax) digitado na tela */
    sal(k, v) {
      if (!adm() || !B || (k != 'inv' && k != 'cmx')) return; const x = String(v).trim() === '' ? 0 : num(v);
      if (!isFinite(x) || x < 0) { SV = '⚠ Saldo inválido (use número positivo).'; keep(refresh); return }
      B.par[k] = r2(x); keep(grava)
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
    pre(t) { if (!B) return; FP = null; S.de = ML[0]; S.ate = t == 'all' ? ML[ML.length - 1] : ML[Math.min(3, ML.length - 1)]; salva(); render() },
    up(i) {
      if (!adm()) { i.value = ''; return } const fl = i.files[0]; i.value = ''; if (!fl) return; const rd = new FileReader();
      rd.onload = () => {
        try {
          const x = parse(XLSX.read(rd.result, { type: 'array', cellDates: true }));
          if (!x.par.ok && B && B.par) x.par = { ...B.par }; /* arquivo sem as abas de fluxo: mantém os parâmetros já publicados */
          let mant = false; if (B && B.par && B.par.man && x.par.base == B.par.base) { x.par.inv = B.par.inv; x.par.cmx = B.par.cmx; x.par.apo = B.par.apo; x.par.man = true; mant = true } /* mesma data-base: mantém o que o admin digitou (saldo inicial e aportes) */
          if (JSON.stringify(x).length > MAXB) throw new Error('a planilha é grande demais para publicar.');
          B = x; prep(); FC = FP = null; SV = ''; const n = x.P.length + x.O.length; PEND = { arq: fl.name, n }; ajusta(); ERR = false; MSG = n + ' lançamentos lidos de ' + fl.name + ' (' + x.P.length + ' Protheus + ' + x.O.length + ' Outras Fontes). Confira o fluxo e clique em “Publicar atualização” para liberar a todos.' + (mant ? ' Saldo inicial e aportes digitados foram mantidos.' : ''); S.tab = S.tab || 'q'; render()
        } catch (e) { MSG = 'Não foi possível ler a planilha: ' + (e.message || e); ERR = true; render() }
      }; rd.readAsArrayBuffer(fl)
    },
    pub() {
      if (!adm() || !PEND || !B) return; const P = PEND; MSG = 'Publicando para todos…'; ERR = false; render();
      BASE.gravar(CHAVE, B, P.arq).then(r => { ST = r.atualizado_em; META = BASE.fdh(r.atualizado_em) + ' · ' + P.arq; PEND = null; MSG = '✔ Base publicada para todos os usuários (' + P.n + ' lançamentos).'; ERR = false; render() })
        .catch(e => { MSG = '⚠ NÃO publicou para os demais usuários: ' + (e.message || e); ERR = true; render() })
    },
    desc() { if (!adm() || !PEND) return; PEND = null; B = null; ST = ''; IT = []; ML = []; MSG = 'Atualização descartada: voltou a base publicada.'; ERR = false; render(); nuvem() },
    _: { get B() { return B }, flow, colsMes, colsPer, prep, get ML() { return ML }, get OP() { return OP }, set B(v) { B = v; prep(); ajusta() }, S, get FC() { return FC }, get FP() { return FP } }
  };
  render();
})();
