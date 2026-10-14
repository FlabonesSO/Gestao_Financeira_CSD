/* Padrão visual das planilhas exportadas (REIDI e Dashboard): tema azul do Consórcio Santa Dulce, cabeçalho com logo, tabelas com bordas só onde há dados,
   colunas dimensionadas pelo conteúdo, valores/datas/percentuais formatados, linhas de grade ocultas, cartões de indicadores e gráficos do "Resumo Executivo".
   Depende de: XP (js/core/xlsx_pro.js) e, opcionalmente, LOGO (js/core/logo.js). */
const XR = (() => {
  'use strict';
  const C = { navy: '00144D', blue: '0F62AC', sky: 'E8F1FB', sky2: 'D3E4F6', line: 'B7C9E2', yel: 'FDB913', verde: '7CBF6A', grn: '1B7F4B', red: 'C62828', ink: '1F2937', mute: '64748B', white: 'FFFFFF', zebra: 'F4F8FD', amb: 'B26A00' };
  /* contabil = formato Contábil do Excel: "R$" encostado à esquerda da célula, valor à direita, casas decimais alinhadas, negativo em vermelho e zero como traço */
  const NF = { moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00;"–"', contabil: '_-"R$"\\ * #,##0.00_-;[Red]-"R$"\\ * #,##0.00_-;_-"R$"\\ * "–"??_-;_-@_-', data: 'dd/mm/yyyy', pct: '0.0%;[Red]-0.0%;"–"', pct0: '0%;[Red]-0%;"–"', pct2: '0.00%;[Red]-0.00%', int: '#,##0;[Red]-#,##0;"–"', moedaZ: '"R$" #,##0.00;[Red]-"R$" #,##0.00', mes: 'mmm/yyyy', mi: '#,##0.0,,"M"', dec: '#,##0.00', texto: '@' };
  const A1 = XP.A1, serial = XP.serial, L = XP.colL;
  /* centavos exatos (arredonda "meio centavo para longe do zero", como o ROUND do Excel; o zero sai sem sinal): soma de decimais deixa resíduo de ~1e-9 e um saldo zero apareceria como -R$ 0,00 */
  const cent = n => { const a = Math.abs(+n || 0), x = Math.round(+(a * 100).toPrecision(15)) / 100; return x === 0 ? 0 : n < 0 ? -x : x };
  const fit0 = (ws, cols) => cols.reduce((t, c) => t + (ws.cw[c] || ws.colDef), 0);

  /* faixa do topo: banda azul-marinho, logo, título, subtítulo e filete amarelo. last = última coluna usada. Retorna a próxima linha livre */
  function cab(ws, last, o) {
    const logo = typeof LOGO != 'undefined' ? LOGO : null; ws.width(1, 1.7);
    let acc = 0, tc = 2; for (let c = 2; c <= last; c++) { acc += (ws.cw[c] || ws.colDef) * 7 + 5; tc = c + 1; if (acc >= 168) break } if (tc > last) tc = last;
    ws.height(1, 8); ws.height(2, 25); ws.height(3, 25); ws.height(4, 3); ws.height(5, 9);
    for (let c = 2; c <= last; c++) { ws.put(1, c, null, { fg: C.navy }); ws.put(4, c, null, { fg: C.yel }) }
    if (logo) ws.image(logo, 2, 2, 150, 58, 4, 2);
    ws.put(2, tc, o.titulo, { b: 1, sz: 18, c: C.navy, v: 'bottom' }); ws.put(3, tc, o.sub || '', { sz: 10, c: C.mute, v: 'top' });
    return 6
  }
  const sec = (ws, r, c1, c2, txt) => { ws.height(r, 21); ws.merge(r, c1, r, c2, txt, { b: 1, sz: 11, c: C.navy, bb: ['medium', C.blue], v: 'bottom' }); return r + 1 };

  const ST = {
    th: { b: 1, c: C.white, fg: C.blue, h: 'center', v: 'center', w: 1, box: C.navy, sz: 10 },
    td: nf => ({ box: C.line, nf, h: nf ? 'right' : 'left', v: 'center' })
  };
  /* tabela: cols=[{h:'Cabeçalho', g:(linha,i)=>valor | f:(excelRow, i)=>fórmula, nf:'moeda|data|pct|int', al:'left|center|right', w:1 (quebra), tot:'sum'|{f,v}|'Texto'|null, k:'chave'}]
     nf:'texto' = formato Texto ("@"): códigos com zeros à esquerda (ex.: nº do título 00000004) ficam como texto.
     o.cent = true → nas colunas em R$ (moeda/moedaZ) toda fórmula e todo total sai envolvido em ROUND(...;2) e com o valor em cache em centavos (sem resíduo de ponto flutuante: zero é 0, nunca -0,0000000) */
  function tabela(ws, r0, c0, cols, rows, o = {}) {
    const n = cols.length, hh = o.hh || 34; ws.height(r0, hh);
    cols.forEach((c, j) => ws.put(r0, c0 + j, c.h, Object.assign({}, ST.th)));
    const r1 = r0 + 1, r2 = r0 + rows.length, letter = {}; cols.forEach((c, j) => { if (c.k) letter[c.k] = L(c0 + j) });
    rows.forEach((row, i) => {
      const r = r1 + i, z = o.zebra !== false && i % 2 == 1;
      cols.forEach((c, j) => {
        let v = c.g ? c.g(row, i) : null; const nf = c.nf ? NF[c.nf] : null, al = c.al || (c.nf == 'data' ? 'center' : c.nf ? 'right' : 'left');
        if (typeof v == 'number' && !isFinite(v)) v = null;
        const st = { box: C.line, v: 'center', h: al, w: c.w ? 1 : 0, ind: al == 'center' ? 0 : 1, fg: z ? C.zebra : null }; if (nf) st.nf = nf; if (c.b) st.b = 1; if (c.c) st.c = c.c;
        const rd = o.cent && c.nf && /^(moeda|contabil)/.test(c.nf), fx = c.f ? c.f(r, i, letter, row) : null; if (fx) v = { f: rd ? `ROUND(${fx},2)` : fx, v: v == null ? 0 : rd ? cent(v) : v };
        ws.put(r, c0 + j, v, st)
      })
    });
    let rt = r2 + 1;
    if (o.total !== false && cols.some(c => c.tot != null) && rows.length) {
      ws.height(rt, 22);
      cols.forEach((c, j) => {
        const nf = c.nf ? NF[c.nf] : null, rd = o.cent && c.nf && /^(moeda|contabil)/.test(c.nf), st = { b: 1, c: C.navy, fg: C.sky2, box: C.line, bt: ['medium', C.navy], v: 'center', h: nf ? 'right' : 'left', ind: 1 }; if (nf) st.nf = nf;
        let v = null;
        if (c.tot == 'sum') { const s = rows.reduce((t, row, i) => t + (+(c.g ? c.g(row, i) : 0) || 0), 0), f0 = `SUBTOTAL(109,${L(c0 + j)}${r1}:${L(c0 + j)}${r2})`; v = { f: rd ? `ROUND(${f0},2)` : f0, v: rd ? cent(s) : s } }
        else if (c.tot && typeof c.tot == 'object') { const f0 = c.tot.f(rt, letter, r1, r2); v = { f: rd ? `ROUND(${f0},2)` : f0, v: rd ? cent(c.tot.v) : c.tot.v } }
        else if (typeof c.tot == 'string') v = c.tot;
        ws.put(rt, c0 + j, v, st)
      })
    } else rt = null;
    if (o.filter && rows.length) ws.filter = [r0, c0, r2, c0 + n - 1];
    return { r0, r1, r2, rt, end: (rt || r2) + 1, letter, c1: c0, c2: c0 + n - 1 }
  }
  /* bloco mesclado com borda externa (cartões) */
  function blk(ws, r1, c1, r2, c2, v, st, R1, C1, R2, C2, ed) {
    ws.merges.push([r1, c1, r2, c2]);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const s = Object.assign({}, st); if (c == C1) s.bl = ed.l; if (c == C2) s.br = ed.r; if (r == R1) s.bt = ed.t; if (r == R2) s.bb = ed.b;
      ws.put(r, c, r == r1 && c == c1 ? v : null, s)
    }
  }
  /* cartão de indicador: rótulo, valor grande e observação. v = número, texto ou {f,v}; cor = cor do filete superior e do valor.
     o = { w (colunas, padrão 3), rows (linhas, padrão 4 — 5 quando há sub2), hs (altura de cada linha), label, lsz/lc/lind (tamanho/cor/recuo do rótulo — recuo maior abre espaço para um ícone à esquerda), v, nf, sz, cor, vc, fg, sub, sub2, hero }
     hero = cartão em DESTAQUE: fundo azul-marinho, filete amarelo, rótulo e observações claros e valor amarelo e grande.
     sub2 = segunda linha de observação (em itálico). Sem hero/rows/sub2 o cartão é o de sempre (4 linhas) — o Dashboard só aumenta o rótulo com lsz/lc. */
  function kpi(ws, r, c, o) {
    const w = o.w || 3, c2 = c + w - 1, hero = !!o.hero, n = o.rows || (o.sub2 != null ? 5 : 4), hs = o.hs || [20, 17, 17, 20, 17],
      bd = ['thin', hero ? C.navy : C.line], ed = { l: bd, r: bd, t: ['thick', hero ? C.yel : o.cor || C.blue], b: bd }, fg = o.fg || (hero ? C.navy : 'F7FAFE'),
      lc = o.lc || (hero ? C.sky2 : C.mute), vc = o.vc || (hero ? C.yel : o.cor || C.navy), ss = { sz: hero ? 9 : 8, c: hero ? C.sky2 : C.mute, fg, h: 'left', v: 'center', ind: 1, w: 0 };
    for (let i = 0; i < n; i++) ws.height(r + i, hs[i] != null ? hs[i] : hs[hs.length - 1]);
    blk(ws, r, c, r, c2, o.label, { b: 1, sz: o.lsz || (hero ? 9 : 8), c: lc, fg, h: 'left', v: 'center', ind: o.lind || 1 }, r, c, r + n - 1, c2, ed);
    blk(ws, r + 1, c, r + 2, c2, o.v, { b: 1, sz: o.sz || (hero ? 26 : 18), c: vc, fg, h: 'left', v: 'center', ind: 1, nf: NF[o.nf || 'moedaZ'] }, r, c, r + n - 1, c2, ed);
    if (o.sub2 != null) {
      blk(ws, r + 3, c, r + 3, c2, o.sub || '', ss, r, c, r + n - 1, c2, ed);
      blk(ws, r + 4, c, r + n - 1, c2, o.sub2, Object.assign({ i: 1 }, ss), r, c, r + n - 1, c2, ed)
    } else blk(ws, r + 3, c, r + n - 1, c2, o.sub || '', ss, r, c, r + n - 1, c2, ed);
    return r + n
  }
  /* linha de alerta: selo colorido + texto mesclado */
  function alerta(ws, r, c1, c2, tipo, txt) {
    const T = { ok: ['✔', 'E3F4EA', C.grn], warn: ['!', 'FFF3D6', C.amb], info: ['i', C.sky, C.blue] }[tipo] || ['i', C.sky, C.blue], bd = ['thin', C.line];
    ws.height(r, 20);
    ws.put(r, c1, T[0], { b: 1, c: T[2], fg: T[1], h: 'center', v: 'center', sz: 11, bl: bd, bt: bd, bb: bd });
    ws.merge(r, c1 + 1, r, c2, txt, { c: C.ink, fg: T[1], h: 'left', v: 'center', ind: 1, w: 1, bt: bd, bb: bd, br: bd, sz: 10 });
    const len = String(txt).length, per = (c2 - c1) * (ws.cw[c1 + 1] || ws.colDef) * 1.05 + 1; if (len > per) ws.height(r, 15 * Math.ceil(len / per) + 6);
    return r + 1
  }
  /* monta a aba inteira: mede, ajusta larguras, escreve cabeçalho e tabela */
  function dados(wb, nome, o) {
    const ws = wb.sheet(nome, { tab: o.tab || C.blue, grid: false, rod: o.rod || 'Consórcio Santa Dulce', land: o.land });
    const c0 = 2, n = o.cols.length, last = c0 + n - 1, HR = o.hr || 7;
    if (o.antes) o.antes(ws, 7);
    const t = tabela(ws, HR, c0, o.cols, o.rows, { filter: true, hh: o.hh || 38, cent: o.cent, total: o.total });
    const mx = {}; o.cols.forEach((c, j) => { if (c.maxW) mx[c0 + j] = c.maxW }); ws.fit(c0, last, HR, t.rt || t.r2, { maxW: 62, min: 8, max: mx });
    /* o.eq = colunas (posição na lista cols, a partir de 0) que ficam todas com a MESMA largura — a maior entre elas (valores em R$ alinhados em colunas uniformes) */
    if (o.eq && o.eq.length) { const w = Math.max(...o.eq.map(j => ws.cw[c0 + j] || 0)); o.eq.forEach(j => ws.width(c0 + j, w)) }
    o.cols.forEach((c, j) => { if (c.W) ws.width(c0 + j, c.W) });
    let ln = 1; o.cols.forEach((c, j) => { const w = Math.max(4, (ws.cw[c0 + j] || ws.colDef) - 1.5); const words = String(c.h).split(' '); let l = 1, cur = 0; words.forEach(x => { if (cur && cur + 1 + x.length > w) { l++; cur = x.length } else cur += (cur ? 1 : 0) + x.length }); ln = Math.max(ln, l) });
    ws.height(HR, Math.max(24, 13 * ln + 8));
    cab(ws, last, { titulo: o.titulo, sub: o.sub });
    /* faixa de informações (linha 6) */
    ws.height(6, 8);
    ws.freeze = [HR + 1, o.fz == null ? c0 : c0 + o.fz]; ws.o.titles = [HR, HR];
    return { ws, t, last }
  }
  const hoje = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) };
  return { C, NF, cab, sec, tabela, kpi, alerta, dados, hoje, serial, blk, ST, cent }
})();
