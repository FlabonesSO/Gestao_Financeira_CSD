/* Exporta as compras do REIDI na planilha-modelo ORIGINAL "Projeção Mensal de Compras REIDI" (cores, logo, gráfico, bordas e layout idênticos).
   Em vez de montar uma planilha nova, abre o próprio arquivo-modelo (js/core/reidi_modelo.js, base64), preenche as células e devolve o .xlsx.
   Abas: "Projeção de Compras" (A..N, linhas 4–502, com fórmulas) e "Resumo Executivo" (SUMIFS/COUNTIFS pelo horizonte, gráfico e assinaturas).
   Depende de: JSZip (js/vendor/jszip.min.js), RDB (reidi_dados.js) e saveAs (app.js). */
RDB.exportar = async function (saveFn, over) {
  if (typeof JSZip == 'undefined' || typeof REIDI_MODELO == 'undefined') throw new Error('modelo da planilha não carregado');
  const z = await JSZip.loadAsync(REIDI_MODELO, { base64: true }), cf = Object.assign({}, this.cfg(), over || {}), S = this.serial, LAST = 502, H = Math.max(1, +cf.hor || 30),
    L = this.L.slice().sort((a, b) => a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.f < b.f ? -1 : a.f > b.f ? 1 : 0).slice(0, LAST - 3),
    X = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''),
    N = v => (isFinite(v) ? String(+(+v).toFixed(10)) : '0'), sa = s => s == null || s === '' ? '' : ` s="${s}"`,
    ts = (ref, s, v) => v === '' || v == null ? `<c r="${ref}"${sa(s)}/>` : `<c r="${ref}"${sa(s)} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`,
    tn = (ref, s, v, f) => `<c r="${ref}"${sa(s)}>${f ? `<f>${X(f)}</f>` : ''}<v>${N(v)}</v></c>`,
    tf = (ref, s, f, v) => `<c r="${ref}"${sa(s)} t="str"><f>${X(f)}</f><v>${X(v)}</v></c>`;

  /* ---------- aba Projeção de Compras: mesmos estilos do modelo (linhas preenchidas coloridas, demais em branco) ---------- */
  const DATA = { A: 11, B: 11, C: 11, D: 11, E: 11, F: 18, G: 29, H: 11, I: 12, J: 12, K: 47, L: 35, M: 38, N: 39 },
    BLANK = { A: 11, B: 11, C: 11, D: 11, E: 11, F: 18, G: 11, H: 11, I: 12, J: 12, K: 12, L: 19, M: 12, N: 19 };
  let rows = '';
  for (let r = 4; r <= LAST; r++) {
    const x = L[r - 4], st = x ? DATA : BLANK, af = `IF(B${r}<>"",ROW(B${r})-3,"")`; let c = '';
    const an = (v, str) => { const t = str ? ' t="str"' : '', val = str ? '<v/>' : `<v>${N(v)}</v>`;
      if (r == 4 || r > 51) return r > 51 && !x ? `<c r="A${r}"${sa(st.A)}/>` : `<c r="A${r}"${sa(st.A)}${t}><f>${X(af)}</f>${val}</c>`;
      return r == 5 ? `<c r="A${r}"${sa(st.A)}${t}><f t="shared" ref="A5:A51" si="0">${X(af)}</f>${val}</c>` : `<c r="A${r}"${sa(st.A)}${t}><f t="shared" si="0"/>${val}</c>` };
    if (x) {
      const ec = x.vo - x.vn, et = this.teor(x.vo, x.pc);
      c = an(r - 3, false) + ts('B' + r, st.B, x.f) + ts('C' + r, st.C, x.i) + ts('D' + r, st.D, x.cat) + (/^\d+$/.test(x.ped) ? tn('E' + r, st.E, +x.ped) : ts('E' + r, st.E, x.ped || '-')) +
        tn('F' + r, st.F, S(x.dt)) + tn('G' + r, st.G, x.pc) + ts('H' + r, st.H, x.rp) + tn('I' + r, st.I, x.vo) + tn('J' + r, st.J, x.vn) +
        tn('K' + r, st.K, ec, `I${r}-J${r}`) + tn('L' + r, st.L, x.vo ? ec / x.vo : 0, `K${r}/I${r}`) + tn('M' + r, st.M, et, `I${r}*G${r}*0.9`) + tn('N' + r, st.N, x.vo ? et / x.vo : 0, `M${r}/I${r}`)
    } else {
      c = an(0, true) + 'BCDEFGHIJKLMN'.split('').map(k => `<c r="${k}${r}"${sa(st[k])}/>`).join('')
    }
    rows += `<row r="${r}" spans="1:14" x14ac:dyDescent="0.3">${c}</row>`
  }
  let s1 = await z.file('xl/worksheets/sheet1.xml').async('string'); if (!s1.includes('@@ROWS@@')) throw new Error('modelo inválido');
  z.file('xl/worksheets/sheet1.xml', s1.replace('@@ROWS@@', () => rows));

  /* ---------- aba Resumo Executivo: fórmulas do modelo, com o horizonte configurado ---------- */
  const PC = "'Projeção de Compras'", rg = c => `${PC}!$${c}$4:$${c}$${LAST}`, ref = S(cf.ref), r5 = '$B$5', win = (a, b) => `${rg('F')},">="&${r5}+${a},${rg('F')},"<="&${r5}+${b}`,
    inW = (a, b) => L.filter(x => S(x.dt) >= ref + a && S(x.dt) <= ref + b), sv = (a, b, k) => inW(a, b).reduce((t, x) => t + (k == 'vn' ? x.vn : k == 'et' ? this.teor(x.vo, x.pc) : x.vo - x.vn), 0),
    p2 = v => String(v).padStart(2, '0'), dmm = k => { const d = new Date((ref + k - 25569) * 864e5); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) },
    b1 = Math.min(14, H), per = [[0, b1], [15, H]], PER = per.map(([a, b]) => ({ lb: dmm(a) + ' - ' + dmm(b), n: inW(a, b).length, vn: sv(a, b, 'vn'), ec: sv(a, b, 'ec'), et: sv(a, b, 'et') })),
    tot = { n: PER[0].n + PER[1].n, vn: PER[0].vn + PER[1].vn, ec: PER[0].ec + PER[1].ec, et: PER[0].et + PER[1].et }, tr1 = new Date((S(this.pagto(cf.ref).slice(0, 10)) - 3 - 25569) * 864e5),
    dd = p2(tr1.getUTCDate()) + '/' + p2(tr1.getUTCMonth() + 1), transf = Math.max(0, Math.ceil((tot.vn - cf.saldo) / this.PASSO - 1e-9) * this.PASSO), d = cf.resp.d || [];
  let s2 = await z.file('xl/worksheets/sheet2.xml').async('string');
  const patch = (ref, build) => { const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)'), m = s2.match(re); if (!m) throw new Error('célula ' + ref + ' não encontrada no modelo'); const sm = m[1].match(/ s="(\d+)"/); s2 = s2.replace(re, () => build(sm ? sm[1] : '')) };
  patch('B3', s => ts('B3', s, cf.doc)); patch('B5', s => tn('B5', s, ref)); patch('E5', s => ts('E5', s, cf.hor + ' dias')); patch('B7', s => tn('B7', s, cf.saldo));
  patch('A9', s => ts('A9', s, 'Valor total das compras – próximos ' + cf.hor + ' dias'));
  patch('A10', s => ts('A10', s, 'Economia REIDI real (negociada)'));
  s2 = s2.replace(/(<row r="12"[^>]*>)/, (m) => m + ts('A12', 2, 'Economia REIDI teórica (alíquota × 90%)') + tn('B12', 8, sv(0, H, 'et'), `SUMIFS(${rg('M')},${win(0, H)})`));
  patch('B9', s => tn('B9', s, sv(0, H, 'vn'), `SUMIFS(${rg('J')},${win(0, H)})`)); patch('B10', s => tn('B10', s, sv(0, H, 'ec'), `SUMIFS(${rg('K')},${win(0, H)})`)); patch('B11', s => tn('B11', s, inW(0, H).length, `COUNTIFS(${win(0, H)})`));
  per.forEach(([a, b], i) => { const r = 17 + i, g = PER[i];
    patch('A' + r, s => tf('A' + r, s, `TEXT($B$5+${a},"dd/mm")&" - "&TEXT($B$5+${b},"dd/mm")`, g.lb)); patch('B' + r, s => tn('B' + r, s, g.n, `COUNTIFS(${win(a, b)})`));
    patch('C' + r, s => tn('C' + r, s, g.vn, `SUMIFS(${rg('J')},${win(a, b)})`)); patch('D' + r, s => tn('D' + r, s, g.ec, `SUMIFS(${rg('K')},${win(a, b)})`)); patch('E' + r, s => tn('E' + r, [12, 17][i], g.et, `SUMIFS(${rg('M')},${win(a, b)})`)) });
  patch('D16', s => ts('D16', s, 'ECONOMIA REIDI REAL')); patch('E16', s => ts('E16', 6, 'ECONOMIA REIDI TEÓRICA'));
  patch('B19', s => tn('B19', s, tot.n, 'SUM(B17:B18)')); patch('C19', s => tn('C19', s, tot.vn, 'SUM(C17:C18)')); patch('D19', s => tn('D19', s, tot.ec, 'SUM(D17:D18)')); patch('E19', s => tn('E19', 14, tot.et, 'SUM(E17:E18)'));
  patch('C21', s => tn('C21', s, cf.saldo, 'B7')); patch('A22', s => ts('A22', s, 'VALOR A TRANSFERIR PARA A BELOV OBRAS ATÉ ' + dd + ' ==>')); patch('C22', s => tn('C22', s, transf, 'MAX(0,ROUNDUP((C19-C21)/5000,0)*5000)'));
  patch('A27', s => ts('A27', s, cf.resp.el)); patch('D27', s => ts('D27', s, cf.resp.cf));
  [31, 34, 37].forEach((r, i) => patch('A' + r, s => ts('A' + r, s, d[i] || '')));
  z.file('xl/worksheets/sheet2.xml', s2);

  /* ---------- gráfico (cache dos valores, para pré-visualizações que não recalculam) ---------- */
  let ch = await z.file('xl/charts/chart1.xml').async('string');
  ch = ch.replace(/<c:cat>[\s\S]*?<\/c:cat>/, () => `<c:cat><c:strRef><c:f>'Resumo Executivo'!$A$17:$A$18</c:f><c:strCache><c:ptCount val="2"/>${PER.map((g, i) => `<c:pt idx="${i}"><c:v>${X(g.lb)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`)
    .replace(/<c:val>[\s\S]*?<\/c:val>/, () => `<c:val><c:numRef><c:f>'Resumo Executivo'!$C$17:$C$18</c:f><c:numCache><c:formatCode>\\R\\$\\ #,##0</c:formatCode><c:ptCount val="2"/>${PER.map((g, i) => `<c:pt idx="${i}"><c:v>${N(g.vn)}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`);
  z.file('xl/charts/chart1.xml', ch);

  const out = await z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await (saveFn || saveAs)('Projecao Mensal de Compras REIDI.xlsx', out); return out
};
