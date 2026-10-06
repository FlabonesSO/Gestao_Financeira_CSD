/* Módulo REIDI · Projeção Mensal de Compras com impacto REIDI.
   Fonte: planilha "Projeção Mensal de Compras REIDI.xlsx" (abas "Resumo Executivo" e "Projeção de Compras").
   O admin importa o Excel ("⬆ Atualizar base"); a base é publicada no Supabase (tabela public.bases, chave 'reidi') e todos os usuários veem.
   Telas: Resumo Executivo (indicadores, gráfico por quinzena, transferência, alertas), Análise Financeira (ganho com o REIDI), Projeção de Compras (tabela filtrável).
   Coluna DATA BASE ATUALIZAÇÃO da planilha: cada linha pertence a uma "foto" (data base); o filtro "Data base de atualização" (topo) escolhe qual foto analisar (padrão: a mais recente; "Todas" soma todas).
   Os responsáveis NÃO aparecem na tela: só no Termo para assinatura (PDF), gerado pelo admin.
   Regras: compras com pagamento previsto do dia 1 ao 15 são pagas no dia 15; do 16 ao fim do mês, no último dia do mês;
   a transferência para a Belov Obras é feita N dias antes (padrão 3). Valor a transferir = máx(0; arredondar p/ cima((compras − saldo) / 5.000) × 5.000) — SEMPRE múltiplo de R$ 5.000 (total e cada transferência), por isso é maior ou igual ao valor da base.
   MÓDULO ISOLADO: usa de js/core: $, f, p, br, N, ROLE, saveAs, LOGO/LR, mo/closeMd (janela), BASE (base.js). */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="reidi"]'), CHAVE = 'reidi', LS = 'csd_reidi_v1', PASSO = 5000;
  if (!VIEW) return;

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pad = n => String(n).padStart(2, '0'), sum = (a, k) => a.reduce((t, x) => t + (+x[k] || 0), 0),
    isoOf = d => new Date(d.getTime() + 432e5).toISOString().slice(0, 10),
    addD = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) },
    eom = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate(),
    dm = iso => iso.slice(8) + '/' + iso.slice(5, 7),
    DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], DSL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
    dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay(), wd = iso => DS[dow(iso)],
    dmw = iso => dm(iso) + ' (' + wd(iso) + ')',
    num = v => {
      if (typeof v == 'number') return v; let s = String(v == null ? '' : v).trim(); if (!s) return NaN;
      const ng = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[^0-9.,]/g, '');
      if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      else if (s.includes(',')) s = s.replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      const n = parseFloat(s); return isNaN(n) ? NaN : ng ? -Math.abs(n) : n
    },
    isoAny = v => {
      if (Object.prototype.toString.call(v) == '[object Date]') return isNaN(v) ? '' : isoOf(v);
      if (typeof v == 'number') return v > 20000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : '';
      const s = String(v == null ? '' : v).trim(), a = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return a ? `${a[3]}-${a[2]}-${a[1]}` : b ? `${b[1]}-${b[2]}-${b[3]}` : ''
    },
    K = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2).replace('.', ',') + ' Mi' : Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil',
    mpdf = n => 'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    short = s => String(s || '').trim().replace(/\s+/g, ' ');

  /* ---------- feriados nacionais e dias úteis (alerta de data de transferência/pagamento) ---------- */
  function pascoa(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((b + 8) / 25), h = Math.floor((b - g + 1) / 3),
      i = (19 * a + b - d - h + 15) % 30, k = Math.floor(c / 4), l = c % 4, m = (32 + 2 * e + 2 * k - i - l) % 7, n = Math.floor((a + 11 * i + 22 * m) / 451),
      mo = Math.floor((i + l - 7 * n + 114) / 31), dy = ((i + l - 7 * n + 114) % 31) + 1; return `${y}-${pad(mo)}-${pad(dy)}`
  }
  const FC = {}, feriados = y => {
    if (FC[y]) return FC[y]; const e = pascoa(y), m = {};
    [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência'], ['10-12', 'N. Sra. Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal']].forEach(([k, n]) => m[`${y}-${k}`] = n);
    m[addD(e, -48)] = 'Carnaval'; m[addD(e, -47)] = 'Carnaval'; m[addD(e, -2)] = 'Sexta-feira Santa'; m[addD(e, 60)] = 'Corpus Christi'; return FC[y] = m
  };
  const motivo = iso => { const w = dow(iso); return w == 0 || w == 6 ? DSL[w] : (feriados(+iso.slice(0, 4))[iso] || '') },
    antDU = iso => { let i = 0; while (motivo(iso) && i++ < 10) iso = addD(iso, -1); return iso };

  /* ---------- estado ---------- */
  const RESP0 = { el: 'Financeiro do Consórcio', cf: 'Gerente Administrativo Financeiro (GAF)', d: ['Diretor Belov', 'Diretor Carioca', 'Diretor CTC'] };
  let B = null, META = '', ST = '', tab = 'res', MSG = '', ERR = false, CH = {}, P = {};
  let PAR = false, MAIS = false, AL = false, ESC = 'hor', FD = false, FQ = '', FCt = '', FRp = '', FP = '', HZ = true, SK = 'dt', SD = 1;
  try { P = JSON.parse(localStorage.getItem(LS)) || {} } catch (e) { P = {} }
  const limpa = () => ['ref', 'hor', 'ant', 'd1', 'saldo'].forEach(k => delete P[k]), salva = () => { try { localStorage.setItem(LS, JSON.stringify(P)) } catch (e) { } };
  const dark = () => document.documentElement.classList.contains('dark');

  /* ---------- leitura da planilha ---------- */
  function parse(wb) {
    const sh = k => wb.SheetNames.find(n => N(n).includes(k)), sp = sh('projecao'), sr = sh('resumo');
    if (!sp) throw new Error('não encontrei a aba "Projeção de Compras". Abas do arquivo: ' + wb.SheetNames.join(' | ') + '.');
    const rd = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }), A = rd(sp),
      hi = A.findIndex(r => r.some(c => N(c).startsWith('fornecedor')));
    if (hi < 0) throw new Error('não encontrei a linha de cabeçalho (coluna FORNECEDOR) na aba "' + sp + '".');
    const H = A[hi].map(N), ix = (...t) => { for (const k of t) { const i = H.findIndex(h => h.includes(k)); if (i >= 0) return i } return -1 },
      c = { f: ix('fornecedor'), i: ix('item', 'descricao'), cat: ix('categoria'), ped: ix('pedido', 'processo'), dt: ix('data pagamento', 'data'), pc: ix('pis', 'cofins'), rp: ix('responsavel'), vo: ix('valor original'), vn: ix('apos negociacao', 'negociacao'), ba: ix('base atualizacao', 'data base') },
      falta = Object.entries({ FORNECEDOR: c.f, 'DATA PAGAMENTO PREVISTA': c.dt, 'VALOR ORIGINAL': c.vo, 'VALOR APÓS NEGOCIAÇÃO REIDI': c.vn }).filter(([, i]) => i < 0).map(([n]) => n);
    if (falta.length) throw new Error('colunas não encontradas na aba "' + sp + '": ' + falta.join(', ') + '.');
    const out = [], t = x => short(x);
    for (let k = hi + 1; k < A.length; k++) {
      const r = A[k], f = t(r[c.f]), dt = isoAny(r[c.dt]), vo = num(r[c.vo]);
      if (!f || !dt || isNaN(vo)) continue;
      let vn = num(r[c.vn]); if (isNaN(vn)) vn = vo; let pc = c.pc < 0 ? 0 : num(r[c.pc]); if (isNaN(pc)) pc = 0; if (pc > 1) pc /= 100;
      out.push({ ba: c.ba < 0 ? '' : isoAny(r[c.ba]), f, i: t(r[c.i]), cat: t(r[c.cat]), ped: t(r[c.ped]), dt, pc, rp: t(r[c.rp]), vo: Math.round(vo * 100) / 100, vn: Math.round(vn * 100) / 100 })
    }
    if (!out.length) throw new Error('nenhuma linha de compra válida (fornecedor, data e valor) na aba "' + sp + '".');
    /* aba Resumo Executivo: nº do documento, data de referência, horizonte, saldo em C/C e responsáveis */
    const S = sr ? rd(sr) : [], lab = k => { for (const r of S) { const i = r.findIndex(x => N(x).startsWith(k)); if (i >= 0) { const v = r.slice(i + 1).find(x => x !== '' && x != null); if (v !== undefined) return v } } },
      mn = out.map(x => x.dt).sort()[0], ref = isoAny(lab('data de referencia')) || mn.slice(0, 8) + '01',
      hor = parseInt(String(lab('horizonte') || '').replace(/\D/g, ''), 10) || 30, sd = num(lab('saldo em c/c')), doc = String(lab('documento') || '').trim();
    out.forEach(x => { if (!x.ba) x.ba = ref });
    const resp = { el: RESP0.el, cf: RESP0.cf, d: RESP0.d.slice() };
    const ie = S.findIndex(r => r.some(x => N(x).startsWith('elaboracao')));
    if (ie >= 0) { const L = S[ie], R = S[ie + 1] || [], ci = L.findIndex(x => N(x).startsWith('conferencia')), ei = L.findIndex(x => N(x).startsWith('elaboracao'));
      if (R[ei]) resp.el = short(R[ei]); if (ci >= 0 && R[ci]) resp.cf = short(R[ci]) }
    const dir = S.map(r => r.find(x => N(x).startsWith('diretor'))).filter(Boolean).map(short); if (dir.length) resp.d = dir.slice(0, 3);
    return { v: 2, doc, ref, hor, saldo: isNaN(sd) ? 0 : sd, resp, c: out }
  }

  /* ---------- cálculo ---------- */
  const bas = () => [...new Set(B.c.map(x => x.ba).filter(Boolean))].sort(),
    baSel = () => { const l = bas(); return P.ba == 'all' ? 'all' : l.includes(P.ba) ? P.ba : (l[l.length - 1] || 'all') },
    baRef = (b = baSel()) => { const l = bas(); if (b == 'all' || b == l[l.length - 1]) return B.ref; const mn = B.c.filter(x => x.ba == b).map(x => x.dt).sort()[0]; return mn ? mn.slice(0, 8) + '01' : B.ref },
    par = (ba = baSel()) => ({ ref: (ba == baSel() && P.ref) || baRef(ba), hor: +P.hor || B.hor || 30, ant: P.ant == null ? 3 : +P.ant, d1: P.d1 == null ? 15 : +P.d1, saldo: P.saldo == null ? (baRef(ba) == B.ref ? (+B.saldo || 0) : 0) : +P.saldo }),
    payDate = (dt, d1) => dt.slice(8) * 1 <= d1 ? dt.slice(0, 8) + pad(d1) : dt.slice(0, 8) + pad(eom(dt)),
    teto = v => Math.max(0, Math.ceil(v / PASSO - 1e-9) * PASSO);
  function calc(ba) {
    const BA = ba == null ? baSel() : ba, q = par(BA), fim = addD(q.ref, q.hor);
    const L = B.c.map((x, k) => ({ x, k })).filter(({ x }) => BA == 'all' || x.ba == BA).map(({ x, k }) => { const pg = payDate(x.dt, q.d1), ec = x.vo - x.vn, et = x.vo * x.pc * .9; return { ...x, k, pg, tr: addD(pg, -q.ant), ec, ecp: x.vo ? ec / x.vo : 0, et, etp: x.vo ? et / x.vo : 0, in: x.dt >= q.ref && x.dt <= fim } }),
      I = L.filter(x => x.in), tot = { n: I.length, vo: sum(I, 'vo'), vn: sum(I, 'vn'), ec: sum(I, 'ec'), et: sum(I, 'et') }, M = {};
    I.forEach(x => { (M[x.pg] = M[x.pg] || { pg: x.pg, tr: x.tr, n: 0, vo: 0, vn: 0, ec: 0, it: [] }); const g = M[x.pg]; g.n++; g.vo += x.vo; g.vn += x.vn; g.ec += x.ec; g.it.push(x) });
    const G = Object.values(M).sort((a, b) => a.pg < b.pg ? -1 : 1), T = teto(tot.vn - q.saldo); let sr = q.saldo, rem = T;
    G.forEach((g, i) => {
      const nd = Math.max(0, g.vn - sr); g.sc = Math.min(g.vn, sr); sr = Math.max(0, sr - g.vn);
      g.tf = i == G.length - 1 ? rem : Math.min(rem, teto(nd)); rem -= g.tf;
      const d = +g.pg.slice(8); g.per = d <= q.d1 ? `01/${g.pg.slice(5, 7)} – ${pad(q.d1)}/${g.pg.slice(5, 7)}` : `${pad(q.d1 + 1)}/${g.pg.slice(5, 7)} – ${pad(eom(g.pg))}/${g.pg.slice(5, 7)}`;
      g.q = (d <= q.d1 ? '1ª' : '2ª') + ' quinzena'; g.mp = motivo(g.pg); g.mt = motivo(g.tr); g.sp = g.mp ? antDU(g.pg) : ''; g.st = g.mp || g.mt ? antDU(addD(g.sp || g.pg, -q.ant)) : ''
    });
    const liq = Math.max(0, tot.vn - q.saldo);
    return { q, fim, L, I, tot, G, T, liq, folga: Math.max(0, T - liq), out: L.length - I.length, outV: sum(L.filter(x => !x.in), 'vn') }
  }
  function alertas(C) {
    const A = [], { q, tot, G, T, I } = C;
    if (T > 0) A.push(['info', 'Transferir para a Belov Obras: ' + G.filter(g => g.tf > 0).map(g => `<b>${f(g.tf)}</b> até <b>${dmw(g.tr)}</b> para pagar em ${dmw(g.pg)}`).join(' · ') + '.']);
    else A.push(['ok', 'O saldo informado cobre todas as compras do período: nenhuma transferência necessária.']);
    const dts = G.filter(g => g.mp || g.mt).map(g => g.mp ? `pagamento de <b>${dmw(g.pg)}</b> cai em ${esc(g.mp)} → pagar em <b>${dmw(g.sp)}</b> e transferir até <b>${dmw(g.st)}</b>` : `transferência até <b>${dmw(g.tr)}</b> cai em ${esc(g.mt)} → transferir até <b>${dmw(g.st)}</b>`);
    if (dts.length) A.push(['warn', '<b>Datas fora de dia útil:</b> ' + dts.join(' · ') + '.']);
    const pv = sum(I.filter(x => N(x.cat).includes('previs')), 'vn');
    if (tot.vn && pv) A.push(['warn', `<b>${p(pv / tot.vn)}</b> do valor (${f(pv)}) ainda está em <b>Previsão</b>, sem pedido de compra: o valor a transferir pode mudar.`]);
    const dup = {}; I.forEach(x => { const k = N(x.f + '|' + x.i + '|' + x.vo); (dup[k] = dup[k] || []).push(x) });
    Object.values(dup).filter(a => a.length > 1).forEach(a => A.push(['info', `Possível duplicidade: <b>${esc(a[0].f)}</b> · ${esc(a[0].i)} · ${f(a[0].vo)} aparece ${a.length}× (${a.map(x => dm(x.dt)).join(', ')}). Confirme se são parcelas distintas.`]));
    if (tot.et && tot.ec < tot.et * .98) A.push(['warn', `A economia real (${f(tot.ec)}) está <b>${p(1 - tot.ec / tot.et)}</b> abaixo da teórica (${f(tot.et)}).`]);
    else if (tot.et) A.push(['ok', `Economia real ${f(tot.ec)} = <b>${p(tot.ec / tot.et)}</b> da teórica (${f(tot.et)}).`]);
    const top = {}; I.forEach(x => top[x.f] = (top[x.f] || 0) + x.vn); const mx = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
    if (mx && tot.vn && mx[1] / tot.vn > .3) A.push(['info', `Concentração: <b>${esc(mx[0])}</b> representa <b>${p(mx[1] / tot.vn)}</b> do valor das compras.`]);
    if (C.out) A.push(['info', `${C.out} compra(s) (${f(C.outV)}) estão fora do horizonte (${br(q.ref)} a ${br(C.fim)}) e não entram nos totais.`]);
    return A
  }

  /* ---------- telas ---------- */
  const ICON = { ok: '✔', warn: '⚠', info: 'ℹ' }, COR = { ok: 'text-emerald-600', warn: 'text-amber-600', info: 'text-indigo-500' };
  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">REIDI</h1><p class="text-sm text-slate-500">Projeção mensal de compras com impacto REIDI${B && B.doc ? ' · Documento nº <b>' + esc(P.doc || B.doc) + '</b>' : ''}${B && baSel() != 'all' ? ' · Data base <b>' + br(baSel()) + '</b>' : ''}${META ? ' · Base publicada em <b>' + esc(META) + '</b>' : ''}</p></div>
  ${B ? `<button class="btn adm" onclick="reidi.termo()">📝 Termo p/ assinatura</button>` : ''}
  <button class="btn2 adm" title="Lê a planilha do REIDI e publica a base para todos os usuários" onclick="document.getElementById('reidi-fi').click()">⬆ Atualizar base</button><input id="reidi-fi" type="file" accept=".xlsx,.xls" class="hidden" onchange="reidi.up(this)">
  ${B ? '<button class="btn2" onclick="reidi.xl()">Excel</button>' : ''}</div>
  ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  const tabs = () => { const l = bas(), b = baSel();
    return `<div class="flex flex-wrap items-center gap-2"><div class="flex flex-wrap gap-1 mr-auto">${[['res', 'Resumo Executivo'], ['fin', 'Análise Financeira'], ['proj', 'Projeção de Compras']].map(([k, n]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium ${tab == k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="reidi.t('${k}')">${n}</button>`).join('')}</div>
    ${l.length ? `<label class="text-xs text-slate-500">Data base de atualização <select class="inp ml-1" onchange="reidi.ba(this.value)">${l.slice().reverse().map(v => `<option value="${v}" ${v == b ? 'selected' : ''}>${br(v)}${v == l[l.length - 1] ? ' (atual)' : ''}</option>`).join('')}${l.length > 1 ? `<option value="all" ${b == 'all' ? 'selected' : ''}>Todas</option>` : ''}</select></label>` : ''}</div>` };
  const vazio = () => `<div class="card py-12 text-center"><div class="text-4xl mb-2">🏗️</div><p class="font-semibold">Nenhuma base do REIDI publicada ainda</p><p class="text-sm text-slate-500 mt-1">${ROLE == 'admin' ? 'Clique em “Atualizar base” e escolha a planilha “Projeção Mensal de Compras REIDI”.' : 'Peça ao administrador para publicar a planilha.'}</p></div>`;
  const card = (t, v, s, c) => `<div class="card text-center"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-2xl font-bold mt-1 ${c || ''}">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div>`;
  const inp = (k, l, v, t, ex) => `<label class="text-xs text-slate-500 block">${l}<input class="inp mt-1 w-full" type="${t || 'number'}" value="${esc(v)}" ${ex || ''} onchange="reidi.p('${k}',this.value)"></label>`;

  function resumo() {
    const C = calc(), { q, tot, G, T } = C, ch = P.ref != null || P.hor != null || P.ant != null || P.d1 != null || P.saldo != null, al = alertas(C), nal = AL ? al.length : 3,
      kp = (t, v, c) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-2xl font-bold mt-0.5 ${c || ''}">${v}</div></div>`,
      lin = G.map(g => `<div class="flex items-baseline justify-between gap-3 py-2 border-t border-slate-200 dark:border-slate-800 first:border-0"><div><div class="text-sm font-medium">${g.q}</div><div class="text-xs text-slate-500">pagar em ${dmw(g.pg)}${g.mp ? ' <span class="text-amber-600">⚠ ' + esc(g.mp) + '</span>' : ''} · transferir até <b class="text-slate-700 dark:text-slate-200">${dmw(g.tr)}</b>${g.mt ? ' <span class="text-amber-600">⚠ ' + esc(g.mt) + '</span>' : ''}</div></div><div class="text-base font-semibold whitespace-nowrap">${f(g.tf)}</div></div>`).join('');
    return `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${kp('Valor das compras · ' + q.hor + ' dias', f(tot.vn))}${kp('Economia REIDI', f(tot.ec), 'text-emerald-600')}${kp('Compras no período', tot.n)}</div>
  <div class="grid lg:grid-cols-5 gap-4">
    <div class="card lg:col-span-3"><h2 class="font-semibold mb-2">Compras por quinzena</h2><div style="height:300px"><canvas id="rc1"></canvas></div></div>
    <div class="card lg:col-span-2 flex flex-col"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Valor a transferir para a Belov Obras</div><div class="text-4xl font-bold text-indigo-500 mt-1">${f(T)}</div>
      <div class="text-xs text-slate-500 mt-1">Compras ${f(tot.vn)}${q.saldo ? ' − saldo ' + f(q.saldo) : ''} = ${f(C.liq)} → arredondado para cima em múltiplos de ${f(PASSO)}${C.folga > .005 ? ' (<b>+' + f(C.folga) + '</b>)' : ''}</div>
      <label class="text-xs text-slate-500 mt-4 block">Saldo em C/C Belov Obras (Santander)</label><input id="reidi-sd" class="inp w-full text-lg font-semibold mt-1" inputmode="decimal" value="${esc(q.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" onchange="reidi.saldo(this.value)" onfocus="this.select()">
      <div class="mt-4">${lin || '<p class="text-sm text-slate-500">Nenhuma compra no horizonte.</p>'}</div></div></div>
  <div class="card"><div class="flex items-center gap-2 mb-2"><h2 class="font-semibold mr-auto">Pontos de atenção</h2>${al.length > 3 ? `<button class="text-sm text-indigo-500 hover:underline" onclick="reidi.tg('al')">${AL ? 'Ver menos' : 'Ver todos (' + al.length + ')'}</button>` : ''}</div>
    <ul class="space-y-1.5 text-sm">${al.slice(0, nal).map(([k, m]) => `<li class="flex gap-2"><span class="${COR[k]} shrink-0">${ICON[k]}</span><span>${m}</span></li>`).join('')}</ul></div>
  <div class="flex flex-wrap gap-2"><button class="btn2" onclick="reidi.tg('mais')">${MAIS ? '▾' : '▸'} Mais análises</button><button class="btn2" onclick="reidi.tg('par')">${PAR ? '▾' : '▸'} Parâmetros do período</button>${ch ? '<button class="btn2" onclick="reidi.rs()" title="Voltar aos valores da planilha">↺ Valores da planilha</button>' : ''}</div>
  ${PAR ? `<div class="card"><div class="grid grid-cols-2 md:grid-cols-4 gap-3">${inp('ref', 'Data de referência', q.ref, 'date')}${inp('hor', 'Horizonte (dias)', q.hor, 'number', 'min="1" max="120"')}${inp('ant', 'Transferir quantos dias antes do pagamento', q.ant, 'number', 'min="0" max="15"')}${inp('d1', 'Pagamento da 1ª quinzena no dia', q.d1, 'number', 'min="1" max="28"')}</div>
    <p class="text-xs text-slate-500 mt-2">Compras previstas do dia 1 ao ${q.d1} são pagas no dia ${q.d1}; as demais, no último dia do mês. Horizonte: ${br(q.ref)} a ${br(C.fim)}. Valor a transferir sempre em múltiplos de ${f(PASSO)}, arredondado para cima sobre (compras − saldo).</p></div>` : ''}
  ${MAIS ? `<div class="grid lg:grid-cols-3 gap-4"><div class="card"><h2 class="font-semibold mb-2">Valor por fornecedor</h2><div style="height:260px"><canvas id="rc2"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Economia: real × teórica</h2><div style="height:260px"><canvas id="rc3"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Valor por responsável</h2><div style="height:260px"><canvas id="rc4"></canvas></div></div></div>` : ''}`
  }
  function tema() {
    const dk = dark(), tx = dk ? '#cbd5e1' : '#334155', BL = dk ? '#3987e5' : '#2a78d6', LA = dk ? '#d95926' : '#eb6834', AQ = dk ? '#199e70' : '#1baf7a', GR = dk ? '#64748b' : '#94a3b8',
      dl = (o = {}) => ({ color: tx, font: { size: 12, weight: '600' }, formatter: v => v ? K(v) : '', ...o }),
      leg = n => n > 1 ? { display: true, position: 'top', align: 'start', labels: { color: tx, boxWidth: 10, boxHeight: 10, font: { size: 11 } } } : { display: false },
      lb = c => c.dataset.label + ': ' + f(c.raw),
      horiz = (labels, ds) => ({ type: 'bar', data: { labels, datasets: ds }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 56 } }, plugins: { legend: leg(ds.length), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 11, weight: '600' } }), tooltip: { callbacks: { label: lb } } }, scales: { x: { display: false, beginAtZero: true, grid: { display: false } }, y: { grid: { display: false }, ticks: { color: tx, font: { size: 11 }, callback(v) { const s = String(this.getLabelForValue(v)); return s.length > 22 ? s.slice(0, 21) + '…' : s } } } } } });
    return { dk, tx, BL, LA, AQ, GR, dl, leg, lb, horiz }
  }
  function graficos() {
    const C = calc(), { tx, BL, LA, AQ, GR, dl, leg, lb, horiz } = tema();
    Object.values(CH).forEach(c => c.destroy()); CH = {};
    const mk = (id, cfg) => { const e = document.getElementById(id); if (e) CH[id] = new Chart(e, cfg) },
      agg = (key, val) => { const m = {}; C.I.forEach(x => m[x[key] || '—'] = (m[x[key] || '—'] || 0) + val(x)); return Object.entries(m).sort((a, b) => b[1] - a[1]) };
    /* gráfico principal: compras × transferência por quinzena */
    mk('rc1', { type: 'bar', data: { labels: C.G.map(g => [g.q, g.per]), datasets: [{ label: 'Valor das compras', data: C.G.map(g => g.vn), backgroundColor: BL, maxBarThickness: 64, borderRadius: 5 }, { label: 'Valor a transferir', data: C.G.map(g => g.tf), backgroundColor: LA, maxBarThickness: 64, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 13, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = C.G[it[0].dataIndex]; return g ? ['Compras: ' + g.n, 'Economia REIDI: ' + f(g.ec), 'Pagamento: ' + dmw(g.pg), 'Transferir até: ' + dmw(g.tr)] : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } });
    if (!MAIS) return;
    const fo = agg('f', x => x.vn).slice(0, 8); mk('rc2', horiz(fo.map(a => a[0]), [{ label: 'Valor das compras', data: fo.map(a => a[1]), backgroundColor: BL, maxBarThickness: 20, borderRadius: 4 }]));
    const ec = agg('f', x => x.ec).slice(0, 8), et = {}; C.I.forEach(x => et[x.f] = (et[x.f] || 0) + x.et);
    mk('rc3', horiz(ec.map(a => a[0]), [{ label: 'Economia real', data: ec.map(a => a[1]), backgroundColor: AQ, maxBarThickness: 14, borderRadius: 4 }, { label: 'Economia teórica', data: ec.map(a => et[a[0]] || 0), backgroundColor: GR, maxBarThickness: 14, borderRadius: 4 }]));
    const rp = agg('rp', x => x.vn); mk('rc4', horiz(rp.map(a => a[0]), [{ label: 'Valor das compras', data: rp.map(a => a[1]), backgroundColor: BL, maxBarThickness: 20, borderRadius: 4 }]))
  }

  /* ---------- Análise Financeira: quanto ganhamos aplicando o REIDI ---------- */
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], pct2 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fdados(C) {
    const it = ESC == 'all' ? C.L : C.I, q = C.q, S = a => ({ n: a.length, vo: sum(a, 'vo'), vn: sum(a, 'vn'), ec: sum(a, 'ec'), et: sum(a, 'et') }),
      grp = (key, lab) => { const m = {}; it.forEach(x => { const k = key(x); (m[k] = m[k] || []).push(x) }); return Object.keys(m).sort().map(k => ({ k, lb: lab ? lab(k) : k, ...S(m[k]) })) };
    const t = S(it), GP = grp(x => x.pg, k => [(+k.slice(8) <= q.d1 ? '1ª' : '2ª') + ' quinzena', MES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4)]),
      FO = grp(x => x.f).map(g => ({ ...g, gap: Math.max(0, g.et - g.ec) })).sort((a, b) => b.ec - a.ec), gap = sum(FO, 'gap'),
      prev = sum(it.filter(x => N(x.cat).includes('previs')), 'ec'), sem = teto(t.vo - q.saldo), com = teto(t.vn - q.saldo), lib = sem - com, b = [];
    if (t.vo) b.push(`A cada <b>R$ 100</b> comprados, o REIDI reduz o custo em <b>R$ ${pct2(t.ec / t.vo * 100)}</b> (${p(t.ec / t.vo)}).`);
    if (FO[0] && t.ec > 0) b.push(`<b>${esc(FO[0].lb)}</b> responde por <b>${p(FO[0].ec / t.ec)}</b> da economia (${f(FO[0].ec)}).`);
    if (t.et) b.push(gap > 1 ? `A economia real é <b>${p(t.ec / t.et)}</b> da teórica: ainda há <b>${f(gap)}</b> a capturar na negociação${FO.filter(g => g.gap > 1).slice(0, 2).length ? ' (' + FO.filter(g => g.gap > 1).sort((x, y) => y.gap - x.gap).slice(0, 2).map(g => esc(g.lb)).join(', ') + ')' : ''}.` : `A economia real é <b>${p(t.ec / t.et)}</b> da teórica: negociação em linha com o benefício tributário.`);
    if (lib > 0) b.push(`Sem o REIDI seria preciso transferir <b>${f(sem)}</b>; com o REIDI, <b>${f(com)}</b>: <b>${f(lib)}</b> de caixa preservado.`);
    if (t.ec > 0 && prev / t.ec > .05) b.push(`<b>${p(prev / t.ec)}</b> da economia (${f(prev)}) vem de compras ainda em <b>Previsão</b>: é estimativa.`);
    return { it, t, GP, FO, gap, sem, com, lib, b }
  }
  function fin() {
    const C = calc(), D = fdados(C), { t, FO, gap, sem, com, lib, b } = D, q = C.q,
      seg = (k, n) => `<button class="px-3 py-1 rounded-md text-sm ${ESC == k ? 'bg-white dark:bg-slate-700 shadow font-medium' : 'text-slate-500'}" onclick="reidi.e('${k}')">${n}</button>`,
      kp = (l, v, s, c) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${l}</div><div class="text-2xl font-bold mt-0.5 ${c || ''}">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-0.5">${s}</div>` : ''}</div>`;
    if (!D.it.length) return `<div class="card py-10 text-center text-slate-500">Nenhuma compra no período. Use “Toda a base” ou ajuste os parâmetros no Resumo Executivo.</div>`;
    return `<div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">${seg('hor', 'Período · ' + q.hor + ' dias')}${seg('all', 'Toda a base')}</div><span class="text-xs text-slate-500">${ESC == 'all' ? 'Todas as ' + t.n + ' compras da planilha' : br(q.ref) + ' a ' + br(C.fim) + ' · ' + t.n + ' compras'}</span></div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kp('Sem REIDI', f(t.vo), 'valor original')}${kp('Com REIDI', f(t.vn), 'após negociação')}${kp('Ganho com o REIDI', f(t.ec), p(t.vo ? t.ec / t.vo : 0) + ' do valor original', 'text-emerald-600')}${kp('Aproveitamento', t.et ? p(t.ec / t.et) : '—', 'economia real ÷ teórica (' + f(t.et) + ')', t.et && t.ec < t.et * .98 ? 'text-amber-600' : 'text-emerald-600')}</div>
  <div class="grid lg:grid-cols-5 gap-4">
    <div class="card lg:col-span-3"><h2 class="font-semibold mb-2">Sem REIDI × Com REIDI</h2><div style="height:300px"><canvas id="rf1"></canvas></div></div>
    <div class="card lg:col-span-2"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Caixa preservado na transferência</div><div class="text-4xl font-bold text-emerald-600 mt-1">${f(lib)}</div>
      <div class="text-xs text-slate-500 mt-1">Transferência sem REIDI ${f(sem)} → com REIDI ${f(com)} (múltiplos de ${f(PASSO)}${q.saldo ? ', saldo ' + f(q.saldo) : ''})</div>
      <ul class="space-y-2 text-sm mt-4">${b.map(x => `<li class="flex gap-2"><span class="text-indigo-500 shrink-0">•</span><span>${x}</span></li>`).join('')}</ul></div></div>
  <div class="card"><h2 class="font-semibold mb-2">Economia por fornecedor · real × teórica</h2><div style="height:${Math.max(180, Math.min(8, FO.length) * 44 + 40)}px"><canvas id="rf2"></canvas></div></div>
  <div class="flex flex-wrap gap-2"><button class="btn2" onclick="reidi.tg('fd')">${FD ? '▾' : '▸'} Detalhe por fornecedor</button></div>
  ${FD ? `<div class="card p-0 overflow-auto" style="max-height:60vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr><th class="px-3 py-2 text-left">Fornecedor</th><th class="px-3 py-2 text-right">Compras</th><th class="px-3 py-2 text-right">Sem REIDI</th><th class="px-3 py-2 text-right">Com REIDI</th><th class="px-3 py-2 text-right">Economia R$</th><th class="px-3 py-2 text-right">%</th><th class="px-3 py-2 text-right">Teórica R$</th><th class="px-3 py-2 text-right">Aproveit.</th><th class="px-3 py-2 text-right">A capturar</th></tr></thead>
    <tbody>${FO.map(g => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${esc(g.lb)}</td><td class="px-3 py-1.5 text-right">${g.n}</td><td class="px-3 py-1.5 text-right">${f(g.vo)}</td><td class="px-3 py-1.5 text-right">${f(g.vn)}</td><td class="px-3 py-1.5 text-right text-emerald-600">${f(g.ec)}</td><td class="px-3 py-1.5 text-right">${g.vo ? p(g.ec / g.vo) : ''}</td><td class="px-3 py-1.5 text-right">${f(g.et)}</td><td class="px-3 py-1.5 text-right">${g.et ? p(g.ec / g.et) : '—'}</td><td class="px-3 py-1.5 text-right ${g.gap > 1 ? 'text-amber-600' : ''}">${g.gap > 1 ? f(g.gap) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2">TOTAL</td><td class="px-3 py-2 text-right">${t.n}</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right text-emerald-600">${f(t.ec)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.ec / t.vo) : ''}</td><td class="px-3 py-2 text-right">${f(t.et)}</td><td class="px-3 py-2 text-right">${t.et ? p(t.ec / t.et) : '—'}</td><td class="px-3 py-2 text-right">${gap > 1 ? f(gap) : '—'}</td></tr></tfoot></table></div>
    <p class="text-xs text-slate-500">Economia teórica = valor original × % PIS/COFINS × 0,9. “A capturar” = economia teórica − real, quando positiva (potencial de negociação).</p>` : ''}`
  }
  function gfin() {
    const C = calc(), D = fdados(C), { tx, BL, AQ, GR, dl, leg, lb, horiz } = tema(); Object.values(CH).forEach(c => c.destroy()); CH = {};
    const mk = (id, cfg) => { const e = document.getElementById(id); if (e) CH[id] = new Chart(e, cfg) };
    mk('rf1', { type: 'bar', data: { labels: D.GP.map(g => [g.lb[0], g.lb[1], 'ganho ' + K(g.ec)]), datasets: [{ label: 'Sem REIDI', data: D.GP.map(g => g.vo), backgroundColor: GR, maxBarThickness: 56, borderRadius: 5 }, { label: 'Com REIDI', data: D.GP.map(g => g.vn), backgroundColor: BL, maxBarThickness: 56, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 12, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = D.GP[it[0].dataIndex]; return g ? ['Compras: ' + g.n, 'Ganho REIDI: ' + f(g.ec) + ' (' + (g.vo ? p(g.ec / g.vo) : '') + ')'] : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } });
    const fo = D.FO.slice(0, 8); mk('rf2', horiz(fo.map(g => g.lb), [{ label: 'Economia real', data: fo.map(g => g.ec), backgroundColor: AQ, maxBarThickness: 14, borderRadius: 4 }, { label: 'Economia teórica', data: fo.map(g => g.et), backgroundColor: GR, maxBarThickness: 14, borderRadius: 4 }]))
  }

  /* ---------- Projeção de Compras ---------- */
  function linhas(C) {
    const q = N(FQ); let r = C.L.filter(x => (!HZ || x.in) && (!FCt || x.cat == FCt) && (!FRp || x.rp == FRp) && (!FP || x.pg == FP) && (!q || N(x.f + ' ' + x.i + ' ' + x.ped).includes(q)));
    const g = x => x[SK]; r = r.slice().sort((a, b) => { const u = g(a), v = g(b); return (typeof u == 'number' ? u - v : String(u).localeCompare(String(v), 'pt-BR', { numeric: true })) * SD }); return r
  }
  const COLS = [['k', 'Nº', 'l'], ['f', 'Fornecedor', 'l'], ['i', 'Item / descrição', 'l'], ['cat', 'Categoria', 'l'], ['ped', 'Nº pedido / processo / NF', 'l'], ['dt', 'Data prevista', 'l'], ['pg', 'Pagamento', 'l'], ['tr', 'Transferir até', 'l'], ['pc', '% PIS/COFINS', 'r'], ['rp', 'Responsável', 'l'], ['vo', 'Valor original', 'r'], ['vn', 'Valor após negociação', 'r'], ['ec', 'Economia real R$', 'r'], ['ecp', '%', 'r'], ['et', 'Economia teórica R$', 'r'], ['etp', '%', 'r'], ['ba', 'Data base atualização', 'l']];
  const cel = (x, k) => k == 'k' ? x.k + 1 : ['dt', 'pg', 'tr', 'ba'].includes(k) ? dm(x[k]) + '/' + x[k].slice(2, 4) : ['pc', 'ecp', 'etp'].includes(k) ? p(x[k]) : ['vo', 'vn', 'ec', 'et'].includes(k) ? f(x[k]) : esc(x[k] || '');
  function proj() {
    const C = calc(), cats = [...new Set(B.c.map(x => x.cat).filter(Boolean))], rps = [...new Set(B.c.map(x => x.rp).filter(Boolean))], pgs = [...new Set(C.L.filter(x => !HZ || x.in).map(x => x.pg))].sort(),
      sel = (id, v, a, l, fn) => `<select class="inp" onchange="reidi.fl('${id}',this.value)"><option value="">${l}</option>${a.map(o => `<option value="${esc(o)}" ${o == v ? 'selected' : ''}>${esc(fn ? fn(o) : o)}</option>`).join('')}</select>`;
    return `<div class="flex flex-wrap items-center gap-2">${sel('cat', FCt, cats, 'Todas as categorias')}${sel('rp', FRp, rps, 'Todos os responsáveis')}${sel('pg', FP, pgs, 'Todas as datas de pagamento', dmw)}
    <input id="reidi-q" class="inp w-64" placeholder="Buscar fornecedor, item ou pedido…" value="${esc(FQ)}" oninput="reidi.fl('q',this.value)"><label class="text-sm flex items-center gap-1.5"><input type="checkbox" ${HZ ? 'checked' : ''} onchange="reidi.fl('hz',this.checked)"> só dentro do horizonte</label><span id="reidi-n" class="text-xs text-slate-500 ml-auto"></span></div><div id="reidi-t"></div>
    <p class="text-xs text-slate-500">Pagamento e transferência seguem o calendário (dia ${C.q.d1} e último dia do mês; transferência ${C.q.ant} dia(s) antes). Economia teórica = valor original × % PIS/COFINS × 0,9.</p>`
  }
  function tbl() {
    const el = document.getElementById('reidi-t'); if (!el || !B) return; const C = calc(), r = linhas(C), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec'), et: sum(r, 'et') };
    el.innerHTML = `<div class="card p-0 overflow-auto" style="max-height:66vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${COLS.map(c => `<th class="px-3 py-2 ${c[2] == 'r' ? 'text-right' : 'text-left'} cursor-pointer select-none" onclick="reidi.s('${c[0]}')">${c[1]}${SK == c[0] ? (SD > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${r.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 ${x.in ? '' : 'opacity-50'}">${COLS.map(c => `<td class="px-3 py-1.5 ${c[2] == 'r' ? 'text-right' : ''} ${c[0] == 'ec' || c[0] == 'ecp' ? 'text-emerald-600' : ''}">${cel(x, c[0])}${c[0] == 'pg' && (x.pg && motivo(x.pg)) ? ' <span class="text-amber-600" title="' + esc(motivo(x.pg)) + '">⚠</span>' : ''}${c[0] == 'tr' && motivo(x.tr) ? ' <span class="text-amber-600" title="' + esc(motivo(x.tr)) + '">⚠</span>' : ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="px-3 py-6 text-center text-slate-500">Nenhuma compra encontrada.</td></tr>`}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="10">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right text-emerald-600">${f(t.ec)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.ec / t.vo) : ''}</td><td class="px-3 py-2 text-right">${f(t.et)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.et / t.vo) : ''}</td><td></td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-n'); if (n) n.textContent = r.length + ' de ' + B.c.length + ' compras · ' + (r.length && !HZ ? 'linhas esmaecidas = fora do horizonte' : '')
  }
  function render() {
    Object.values(CH).forEach(c => c.destroy()); CH = {};
    VIEW.innerHTML = head() + (B ? tabs() + (tab == 'res' ? resumo() : tab == 'fin' ? fin() : proj()) : vazio());
    if (B) { if (tab == 'res') graficos(); else if (tab == 'fin') gfin(); else tbl() }
  }

  /* ---------- base na nuvem ---------- */
  async function nuvem() {
    try {
      const r = await BASE.ler(CHAVE);
      if (r && r.dados && r.dados.v == 2 && Array.isArray(r.dados.c) && r.dados.c.length) {
        META = BASE.fdh(r.atualizado_em) + (r.arquivo ? ' · ' + r.arquivo : ''); if (r.atualizado_em != ST) { ST = r.atualizado_em; B = r.dados; B.c.forEach(x => { if (!x.ba) x.ba = B.ref }); if (P.bst && P.bst != ST) { limpa(); delete P.ba } P.bst = ST; salva() } render()
      } else { if (r && r.dados && !B) { MSG = 'A base publicada está num formato antigo. O administrador deve publicar a planilha de novo.'; ERR = true } if (!B) render() }
    } catch (e) { MSG = 'Não consegui carregar a base do REIDI: ' + (e.message || e) + '. Confira se o SQL supabase/bases-dados.sql foi executado.'; ERR = true; render() }
  }

  /* ---------- Excel ---------- */
  function xl() {
    if (!B) return; const C = calc(), wb = XLSX.utils.book_new(), q = C.q;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PROJEÇÃO MENSAL DE COMPRAS COM IMPACTO REIDI'], ['Documento nº', P.doc || B.doc], ['Data de referência', br(q.ref)], ['Horizonte (dias)', q.hor], ['Saldo em C/C Belov Obras (Santander)', q.saldo], ['Valor total das compras', C.tot.vn], ['Economia tributária estimada (REIDI)', C.tot.ec], ['Nº de compras', C.tot.n], ['Valor a transferir (múltiplo de R$ 5.000, arredondado p/ cima)', C.T], ['Compras − saldo (antes do arredondamento)', C.liq], ['Arredondamento', C.folga], [],
      ['PERÍODO', 'Nº COMPRAS', 'VALOR DAS COMPRAS', 'ECONOMIA REIDI', 'PAGAMENTO EM', 'TRANSFERIR ATÉ', 'A TRANSFERIR'], ...C.G.map(g => [g.per, g.n, g.vn, g.ec, br(g.pg), br(g.tr), g.tf]), ['TOTAL', C.tot.n, C.tot.vn, C.tot.ec, '', '', C.T]]), 'Resumo Executivo');
    { const D = fdados(C), t = D.t; XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ANÁLISE FINANCEIRA · GANHO COM O REIDI'], ['Escopo', ESC == 'all' ? 'Toda a base' : 'Período ' + br(q.ref) + ' a ' + br(C.fim)], [],
      ['Sem REIDI (valor original)', t.vo], ['Com REIDI (após negociação)', t.vn], ['Ganho com o REIDI', t.ec], ['Ganho %', t.vo ? t.ec / t.vo : 0], ['Economia teórica', t.et], ['Aproveitamento', t.et ? t.ec / t.et : 0], ['Transferência sem REIDI', D.sem], ['Transferência com REIDI', D.com], ['Caixa preservado', D.lib], [],
      ['FORNECEDOR', 'COMPRAS', 'SEM REIDI', 'COM REIDI', 'ECONOMIA R$', 'ECONOMIA %', 'TEÓRICA R$', 'A CAPTURAR'], ...D.FO.map(g => [g.lb, g.n, g.vo, g.vn, g.ec, g.vo ? g.ec / g.vo : 0, g.et, g.gap]), ['TOTAL', t.n, t.vo, t.vn, t.ec, t.vo ? t.ec / t.vo : 0, t.et, D.gap]]), 'Análise Financeira') }
    const r = linhas(C); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.map(x => ({ 'Nº': x.k + 1, FORNECEDOR: x.f, 'ITEM/DESCRIÇÃO': x.i, CATEGORIA: x.cat, 'Nº PEDIDO / PROCESSO / NF': x.ped, 'DATA PREVISTA': br(x.dt), PAGAMENTO: br(x.pg), 'TRANSFERIR ATÉ': br(x.tr), '% PIS/COFINS': x.pc, 'RESPONSÁVEL': x.rp, 'VALOR ORIGINAL': x.vo, 'VALOR APÓS NEGOCIAÇÃO REIDI': x.vn, 'ECONOMIA REAL R$': x.ec, 'ECONOMIA REAL %': x.ecp, 'ECONOMIA TEÓRICA R$': x.et, 'ECONOMIA TEÓRICA %': x.etp, 'DATA BASE ATUALIZAÇÃO': br(x.ba) }))), 'Projeção de Compras');
    saveAs('reidi_projecao_compras.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
  }

  /* ---------- Termo para assinatura (PDF) — aqui, e só aqui, aparecem os responsáveis ---------- */
  function termo() {
    if (ROLE != 'admin' || !B) return; const R = P.resp || B.resp || RESP0, d = R.d || RESP0.d, I = (id, l, v, t) => `<label class="block text-sm mb-1">${l}</label><input id="${id}" type="${t || 'text'}" class="inp w-full mb-3" value="${esc(v)}">`;
    mo(`<h2 class="text-lg font-bold mb-1">Termo para assinatura · REIDI</h2><p class="text-sm text-slate-500 mb-4">Resumo Executivo + Projeção de Compras</p>${I('rt-n', 'Documento nº', P.doc || B.doc || '')}${I('rt-d', 'Data do documento', new Date().toISOString().slice(0, 10), 'date')}
    <p class="text-xs font-semibold uppercase text-slate-500 mb-2">Responsáveis (aparecem só no PDF)</p>${I('rt-e', 'Elaboração', R.el || RESP0.el)}${I('rt-c', 'Conferência', R.cf || RESP0.cf)}${I('rt-1', 'Atesto da Diretoria (1)', d[0] || '')}${I('rt-2', 'Atesto da Diretoria (2)', d[1] || '')}${I('rt-3', 'Atesto da Diretoria (3)', d[2] || '')}
    <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="reidi.termoOk()">Gerar PDF</button></div>`)
  }
  function termoOk() {
    const g = id => document.getElementById(id).value.trim(), o = { doc: g('rt-n'), data: g('rt-d'), resp: { el: g('rt-e'), cf: g('rt-c'), d: [g('rt-1'), g('rt-2'), g('rt-3')].filter(Boolean) } };
    P.doc = o.doc; P.resp = o.resp; salva(); closeMd(); pdf(o)
  }
  function pdf(o) {
    const C = calc(), { q, tot, G, T } = C, d = new jspdf.jsPDF('p', 'pt', 'a4'), X = 40, W = 515, HB = [180, 198, 231], LB = [217, 225, 242], PH = 841, asc = s => String(s).replace(/[–—]/g, '-');
    const TT = (t, x, y, sz, b, al) => d.setFont('helvetica', b ? 'bold' : 'normal').setFontSize(sz).setTextColor(0).text(String(t), x, y, { align: al || 'left' }),
      Sx = (t, y) => { TT(t, X, y, 9.5, 1); return y + 8 }, tb = o2 => d.autoTable({ theme: 'grid', tableWidth: W, margin: { left: X, right: X }, styles: { fontSize: 8.5, cellPadding: 3.5, lineColor: [90, 90, 90], lineWidth: .5, textColor: 0 }, headStyles: { fillColor: LB, textColor: 0, fontStyle: 'bold', halign: 'center' }, footStyles: { fillColor: LB, textColor: 0, fontStyle: 'bold' }, ...o2 });
    d.addImage(LOGO, 'PNG', X, 22, 110, 110 / LR);
    d.setFillColor(...HB).rect(X, 76, W, 42, 'F'); TT('PROJEÇÃO MENSAL DE COMPRAS', X + W / 2, 94, 12.5, 1, 'center'); TT('COM IMPACTO REIDI', X + W / 2, 110, 12.5, 1, 'center');
    TT('Documento nº: ' + (o.doc || ''), X + W, 132, 9, 1, 'right'); TT('Data: ' + (o.data ? br(o.data) : ''), X + W, 144, 9, 1, 'right');
    let y = Sx('1. REFERÊNCIA', 164);
    tb({ startY: y, body: [['Data de referência', br(q.ref)], ['Data base de atualização', baSel() == 'all' ? 'Todas' : br(baSel())], ['Horizonte', q.hor + ' dias (' + br(q.ref) + ' a ' + br(C.fim) + ')'], ['Calendário de pagamento', `Compras do dia 1 ao ${q.d1}: pago dia ${q.d1} · demais: último dia do mês · transferência ${q.ant} dia(s) antes`], ['Saldo em C/C Belov Obras (Santander)', mpdf(q.saldo)]], columnStyles: { 0: { fillColor: LB, fontStyle: 'bold', cellWidth: 190 } } });
    y = Sx('2. INDICADORES', d.lastAutoTable.finalY + 16);
    tb({ startY: y, body: [['Valor total das compras – próximos ' + q.hor + ' dias', mpdf(tot.vn)], ['Economia tributária estimada (REIDI)', mpdf(tot.ec)], ['Nº de processos/compras', String(tot.n)]], columnStyles: { 0: { fillColor: LB, fontStyle: 'bold', cellWidth: 300 }, 1: { halign: 'right' } } });
    y = Sx('3. RESUMO POR QUINZENA E CRONOGRAMA DE TRANSFERÊNCIAS', d.lastAutoTable.finalY + 16);
    tb({ startY: y, head: [['PERÍODO', 'Nº COMPRAS', 'VALOR DAS COMPRAS', 'ECONOMIA REIDI', 'PAGAMENTO EM', 'TRANSFERIR ATÉ', 'A TRANSFERIR']], body: G.map(g => [asc(g.per), String(g.n), mpdf(g.vn), mpdf(g.ec), dmw(g.pg), dmw(g.tr), mpdf(g.tf)]), foot: [['TOTAL', String(tot.n), mpdf(tot.vn), mpdf(tot.ec), '', '', mpdf(T)]], styles: { fontSize: 8, cellPadding: 3.5, lineColor: [90, 90, 90], lineWidth: .5, textColor: 0 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 6: { halign: 'right' } } });
    y = d.lastAutoTable.finalY + 14;
    d.setFillColor(...HB).setDrawColor(90).setLineWidth(.5).rect(X, y, W, 34, 'FD'); TT('VALOR A TRANSFERIR PARA A BELOV OBRAS ==>', X + 8, y + 21, 10.5, 1); TT(mpdf(T), X + W - 8, y + 22, 13, 1, 'right'); y += 34;
    d.setFont('helvetica', 'normal').setFontSize(8).setTextColor(60).text(asc(`Compras ${mpdf(tot.vn)}${q.saldo ? ' - saldo ' + mpdf(q.saldo) : ''} = ${mpdf(C.liq)}; arredondado para cima em múltiplos de ${mpdf(PASSO)}${C.folga > .005 ? ' (+' + mpdf(C.folga) + ')' : ''}.`), X, y + 11);
    const obs = G.filter(g => g.mp || g.mt).map(g => g.mp ? `Pagamento de ${dmw(g.pg)} cai em ${g.mp}: sugestão pagar em ${dmw(g.sp)} e transferir até ${dmw(g.st)}.` : `Transferência até ${dmw(g.tr)} cai em ${g.mt}: sugestão transferir até ${dmw(g.st)}.`);
    if (obs.length) { y += 14; TT('Observações', X, y, 9, 1); d.setFont('helvetica', 'normal').setFontSize(8.5); obs.forEach(t => { const l = d.splitTextToSize('- ' + t, W); y += 12; d.text(l, X, y); y += (l.length - 1) * 11 }) }
    if (y > PH - 210) { d.addPage('a4', 'p'); y = 40 } else y += 24;
    TT('RESPONSÁVEIS', X, y, 10, 1); y += 8;
    const R = o.resp || RESP0, box = (x0, y0, w, t, n) => { d.setDrawColor(90).setLineWidth(.5).setFillColor(...LB).rect(x0, y0, w, 16, 'FD'); d.rect(x0, y0 + 16, w, 52, 'S'); TT(t, x0 + w / 2, y0 + 11.5, 8.5, 1, 'center'); d.setFont('helvetica', 'normal').setFontSize(8.5).text(d.splitTextToSize(n || '', w - 10), x0 + 5, y0 + 30); TT('Assinatura:', x0 + 5, y0 + 62, 8.5, 0); d.setDrawColor(120).line(x0 + 58, y0 + 62, x0 + w - 8, y0 + 62) };
    box(X, y, W / 2 - 4, 'ELABORAÇÃO', R.el); box(X + W / 2 + 4, y, W / 2 - 4, 'CONFERÊNCIA', R.cf); y += 68 + 14;
    TT('ATESTO DA DIRETORIA', X, y, 9.5, 1); y += 6; const D = (R.d && R.d.length ? R.d : RESP0.d), w3 = (W - 16) / 3; D.slice(0, 3).forEach((n, i) => box(X + i * (w3 + 8), y, w3, 'DIRETORIA', n));
    /* página 2: Projeção de Compras (paisagem) */
    d.addPage('a4', 'l'); TT('PROJEÇÃO DE COMPRAS', 40, 40, 12, 1); TT('Documento nº ' + (o.doc || '') + ' · horizonte ' + br(q.ref) + ' a ' + br(C.fim), 40, 54, 8.5, 0);
    const r = C.I.slice().sort((a, b) => a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.k - b.k);
    d.autoTable({ theme: 'grid', startY: 64, margin: { left: 40, right: 40, bottom: 40 }, styles: { fontSize: 7, cellPadding: 2.5, lineColor: [90, 90, 90], lineWidth: .4, textColor: 0, overflow: 'linebreak' }, headStyles: { fillColor: LB, textColor: 0, fontStyle: 'bold', halign: 'center' }, footStyles: { fillColor: LB, textColor: 0, fontStyle: 'bold' },
      head: [['Nº', 'FORNECEDOR', 'ITEM/DESCRIÇÃO', 'CATEGORIA', 'PEDIDO/NF', 'DATA PREV.', 'PAGAR EM', 'TRANSF. ATÉ', 'RESPONSÁVEL', 'VALOR ORIGINAL', 'VALOR APÓS NEGOCIAÇÃO', 'ECONOMIA R$', '%']],
      body: r.map(x => [String(x.k + 1), x.f, x.i, x.cat, x.ped, br(x.dt), br(x.pg), br(x.tr), x.rp, mpdf(x.vo), mpdf(x.vn), mpdf(x.ec), p(x.ecp)]),
      foot: [['', 'TOTAL (' + r.length + ')', '', '', '', '', '', '', '', mpdf(tot.vo), mpdf(tot.vn), mpdf(tot.ec), tot.vo ? p(tot.ec / tot.vo) : '']],
      columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right', cellWidth: 34 } } });
    const n = d.internal.getNumberOfPages(); for (let i = 1; i <= n; i++) { d.setPage(i); const w = d.internal.pageSize.getWidth(), h = d.internal.pageSize.getHeight(); d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(110).text('Documento nº ' + (o.doc || '') + ' · Página ' + i + ' de ' + n, w - 40, h - 20, { align: 'right' }) }
    saveAs('reidi_termo_' + String(o.doc || 'documento').replace(/[^\w-]+/g, '-') + '.pdf', d.output('arraybuffer'))
  }

  /* ---------- ações da tela ---------- */
  const tela = () => render();
  window.reidi = {
    show() { try { VIEW.dataset.ok = 1 } catch (e) { } render(); nuvem() }, t(k) { tab = k; tela() }, tg(k) { if (k == 'par') PAR = !PAR; else if (k == 'mais') MAIS = !MAIS; else if (k == 'fd') FD = !FD; else AL = !AL; tela() }, e(v) { ESC = v == 'all' ? 'all' : 'hor'; tela() }, ba(v) { P.ba = v; salva(); tela() },
    p(k, v) { if (v === '') { delete P[k] } else P[k] = k == 'ref' ? v : +v; salva(); tela() }, saldo(v) { const n = num(v); P.saldo = isNaN(n) ? 0 : Math.max(0, n); salva(); tela() },
    rs() { limpa(); salva(); tela() },
    fl(k, v) { if (k == 'cat') FCt = v; else if (k == 'rp') FRp = v; else if (k == 'pg') FP = v; else if (k == 'q') FQ = v; else if (k == 'hz') HZ = !!v; if (k == 'q') tbl(); else tela() },
    s(k) { if (SK == k) SD = -SD; else { SK = k; SD = 1 } tbl() }, xl, termo, termoOk,
    up(i) {
      if (ROLE != 'admin') { i.value = ''; return } const fl = i.files[0]; i.value = ''; if (!fl) return; const rd = new FileReader();
      rd.onload = () => {
        try {
          const x = parse(XLSX.read(rd.result, { type: 'array', cellDates: true })); B = x; delete P.ba; ST = ''; META = ''; ERR = false;
          const M0 = x.c.length + ' compras lidas de ' + fl.name + ' (referência ' + br(x.ref) + ', horizonte ' + x.hor + ' dias).'; MSG = M0 + ' Publicando para todos…'; tela();
          BASE.gravar(CHAVE, x, fl.name).then(r => { ST = r.atualizado_em; limpa(); delete P.ba; P.bst = ST; salva(); META = BASE.fdh(r.atualizado_em) + ' · ' + fl.name; MSG = M0 + ' ✔ Publicado para todos os usuários.'; ERR = false; tela() })
            .catch(e => { MSG = M0 + ' ⚠ Não publicou para os demais usuários: ' + (e.message || e); ERR = true; tela() })
        } catch (e) { MSG = 'Erro ao ler a planilha: ' + (e.message || e); ERR = true; tela() }
      }; rd.readAsArrayBuffer(fl)
    },
    calc: () => B ? calc() : null, parse, alertas: () => B ? alertas(calc()) : [], _set: b => { B = b }
  };
  render();
  /* abre sozinho quando a tela do REIDI fica visível (mesmo que o menu do site seja uma versão antiga e não chame reidi.show) */
  try { new MutationObserver(() => { if (VIEW.classList.contains('hidden')) { delete VIEW.dataset.ok } else if (!VIEW.dataset.ok) { window.reidi.show() } }).observe(VIEW, { attributes: true, attributeFilter: ['class'] }) } catch (e) { }
})();
