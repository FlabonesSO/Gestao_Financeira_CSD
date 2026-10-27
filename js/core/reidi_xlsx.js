/* Exporta as compras do REIDI na planilha-modelo ORIGINAL "Projeção Mensal de Compras REIDI" (cores, logo, gráfico, bordas e layout idênticos).
   Em vez de montar uma planilha nova, abre o próprio arquivo-modelo (js/core/reidi_modelo.js, base64), preenche as células e devolve o .xlsx.
   Abas: "Projeção de Compras" (A..N, linhas 4–502, com fórmulas) e "Resumo Executivo" (SUMIFS/COUNTIFS pelo horizonte, gráfico e assinaturas).
   LINHA DE TOTAL: abaixo do último lançamento, depois de UMA linha em branco, vai a linha "TOTAL" só com a soma de VALOR ORIGINAL (R$), VALOR APÓS NEGOCIAÇÃO REIDI (R$), ECONOMIA REIDI REAL (R$) e
   ECONOMIA REIDI TEÓRICA (R$) (colunas I, J, K e M; os percentuais L e N ficam sem total), em SUBTOTAL(109,…) (igual à soma; com filtro no Excel, soma só as linhas visíveis). A linha em branco mantém o total FORA da área que o Excel ordena e filtra
   (senão ele sumiria ao filtrar por categoria, ou iria para o topo ao ordenar por valor). O Resumo Executivo não é afetado (as somas dele só pegam linhas com data). Sem lançamentos, sem total.
   Ao importar esta mesma planilha, a linha "TOTAL" é ignorada (RDB.ehTotal em reidi_importar.js).
   RESUMO EXECUTIVO: a legenda de A10 é a do modelo, "Economia tributária estimada (REIDI)" (o valor de B10 é a economia REIDI real, coluna K), e o Resumo NÃO tem a linha da economia teórica (A12/B12, retirada a pedido):
   a teórica segue só na tabela por quinzena (coluna E) e na coluna M da aba de lançamentos. Vale para as duas exportações (relatório REIDI e Projeção REIDI), que usam o mesmo modelo.
   SALDO A PAGAR (over.apagar = true; é o que o botão "⬇ Planilha (modelo)" do relatório REIDI pede): quando já há pagamento lançado, cada compra COM pagamento sai só com o que ainda falta pagar
   (RDB.saldoLista/RDB.restante, a mesma conta do Resumo Executivo: valor negociado − pagamentos; valor original e economias na proporção) e as quitadas ficam de fora. SÓ OS NÚMEROS mudam: NENHUMA legenda é
   incluída nem trocada (nada de nota, os rótulos do Resumo e o título do gráfico são os mesmos da planilha completa, que é o padrão). O arquivo só ganha o sufixo " - saldo a pagar" no nome e uma MARCA INTERNA nas
   propriedades (as "Marcas" do arquivo, nada nas células), que o importador usa para recusá-lo (RDB.MARCA_SALDO_PROP). Sem pagamento nenhum, ou sem over.apagar (botão "⬇ Exportar planilha (modelo)" da Projeção REIDI,
   que é a base COMPLETA), a planilha sai exatamente como antes. RDB.expInfo guarda o que foi feito, para a tela avisar.
   PERÍODO (over.periodo = true; é o que o botão "⬇ Planilha (modelo)" do relatório REIDI pede, junto com ref e hor do filtro "Período (De/Até)" da tela): a aba "Projeção de Compras" traz SÓ as compras cuja DATA PAGAMENTO
   PREVISTA (coluna F) está dentro do período, De = ref até Até = ref + horizonte, as duas datas inclusive (a mesma regra do Resumo Executivo da tela e das fórmulas do Resumo da planilha). O período é aplicado ANTES do saldo
   a pagar (as compras de fora nem entram na conta: parciais e quitadas contadas são só as do período) e ANTES do limite de linhas do modelo. A linha de TOTAL, o Resumo e o gráfico ficam, por isso, iguais ao que a aba
   mostra. Sem over.periodo (o "⬇ Exportar planilha (modelo)" da Projeção REIDI) a base sai COMPLETA, como sempre: é a planilha para guardar e para o "⬆ Importar planilha".
   Depende de: JSZip (js/vendor/jszip.min.js), RDB (reidi_dados.js) e saveAs (app.js). */
RDB.exportar = async function (saveFn, over) {
  if (typeof JSZip == 'undefined' || typeof REIDI_MODELO == 'undefined') throw new Error('modelo da planilha não carregado');
  const z = await JSZip.loadAsync(REIDI_MODELO, { base64: true }), cf = Object.assign({}, this.cfg(), over || {}), S = this.serial, LAST = 502, H = Math.max(1, +cf.hor || 30), ref = S(cf.ref),
    ord = this.L.slice().sort((a, b) => a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.f < b.f ? -1 : a.f > b.f ? 1 : 0),
    ordP = cf.periodo ? ord.filter(x => S(x.dt) >= ref && S(x.dt) <= ref + H) : ord, /* periodo = SÓ as compras do período filtrado no relatório (De = ref até Até = ref + horizonte, as duas pontas inclusive, pela DATA PAGAMENTO PREVISTA: as mesmas que o Resumo Executivo conta); sem isso, todas */
    SP = cf.apagar ? this.saldoLista(ordP) : null,   /* o saldo a pagar é calculado DEPOIS do período: as contagens de parciais e quitadas são só as do período */
    net = !!(SP && (SP.parc || SP.quit)), /* net = o relatório pediu o SALDO A PAGAR e já existe pagamento lançado (no período; sem nenhum pagamento a planilha é a de sempre) */
    L = (net ? SP.rows : ordP).slice(0, LAST - 3),
    X = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''),
    N = v => (isFinite(v) ? String(+(+v).toFixed(10)) : '0'), sa = s => s == null || s === '' ? '' : ` s="${s}"`,
    ts = (ref, s, v) => v === '' || v == null ? `<c r="${ref}"${sa(s)}/>` : `<c r="${ref}"${sa(s)} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`,
    tn = (ref, s, v, f) => `<c r="${ref}"${sa(s)}>${f ? `<f>${X(f)}</f>` : ''}<v>${N(v)}</v></c>`,
    tf = (ref, s, f, v) => `<c r="${ref}"${sa(s)} t="str"><f>${X(f)}</f><v>${X(v)}</v></c>`;

  /* ---------- linha de TOTAL: posição e estilos ---------- */
  const T = L.length ? L.length + 5 : 0;   /* 1ª linha depois de uma linha em branco que fica após o último lançamento (4 + n); sem lançamentos, sem total */
  let XF = null;
  if (T) {   /* estilos novos no styles.xml do modelo: negrito, "R$ #,##0.00" (com centavos, como no site) e linha fina em cima; a borda é uma só, as 4 células usam a mesma */
    let st = await z.file('xl/styles.xml').async('string'); const mb = st.match(/<borders count="(\d+)">/), mx = st.match(/<cellXfs count="(\d+)">/);
    if (!mb || !mx || st.split('</borders>').length != 2 || st.split('</cellXfs>').length != 2) throw new Error('modelo inválido');
    const NB = +mb[1], NX = +mx[1], al = '<alignment horizontal="center" vertical="center"/>', alS = '<alignment horizontal="center" vertical="center" shrinkToFit="1"/>';
    XF = { lin: NX, rot: NX + 1, val: NX + 2, ec: NX + 3, et: NX + 4 };   /* linha em branco com borda · rótulo "TOTAL" · valores (I, J) · economia real (K, com o verde do modelo) · economia teórica (M, com o lilás do modelo) */
    st = st.replace(mb[0], () => '<borders count="' + (NB + 1) + '">').replace('</borders>', () => '<border><left/><right/><top style="thin"><color indexed="64"/></top><bottom/><diagonal/></border></borders>')
      .replace(mx[0], () => '<cellXfs count="' + (NX + 5) + '">').replace('</cellXfs>', () =>
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="${NB}" xfId="0" applyBorder="1"/>` +
        `<xf numFmtId="0" fontId="9" fillId="0" borderId="${NB}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${al}</xf>` +
        `<xf numFmtId="164" fontId="9" fillId="0" borderId="${NB}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">${alS}</xf>` +
        `<xf numFmtId="164" fontId="9" fillId="11" borderId="${NB}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alS}</xf>` +
        `<xf numFmtId="164" fontId="9" fillId="8" borderId="${NB}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alS}</xf></cellXfs>`);
    z.file('xl/styles.xml', st)
  }
  const totRow = r => {   /* soma em centavos (sem resíduo de ponto flutuante); o valor guardado serve para quem lê sem recalcular, o Excel recalcula ao abrir */
    const cvo = L.reduce((t, x) => t + this.c(x.vo), 0), cvn = L.reduce((t, x) => t + this.c(x.vn), 0), cet = L.reduce((t, x) => t + (x._et != null ? x._et : this.teor(x.vo, x.pc)), 0), sub = k => `SUBTOTAL(109,${k}4:${k}${r - 1})`, bl = k => `<c r="${k}${r}"${sa(k == 'A' || k == 'N' ? BLANK[k] : XF.lin)}/>`;   /* cet = soma do que está guardado em cada M (a mesma conta da coluna: valor original × alíquota × 90%, sem arredondar) */
    return `<row r="${r}" spans="1:14" x14ac:dyDescent="0.3">${bl('A')}${ts('B' + r, XF.rot, 'TOTAL')}${'CDEFGH'.split('').map(bl).join('')}${tn('I' + r, XF.val, this.r2(cvo), sub('I'))}${tn('J' + r, XF.val, this.r2(cvn), sub('J'))}${tn('K' + r, XF.ec, this.r2(cvo - cvn), sub('K'))}${bl('L')}${tn('M' + r, XF.et, cet, sub('M'))}${bl('N')}</row>`
  };

  /* ---------- aba Projeção de Compras: mesmos estilos do modelo (linhas preenchidas coloridas, demais em branco) ---------- */
  const DATA = { A: 11, B: 11, C: 11, D: 11, E: 11, F: 18, G: 29, H: 11, I: 12, J: 12, K: 47, L: 35, M: 38, N: 39 },
    BLANK = { A: 11, B: 11, C: 11, D: 11, E: 11, F: 18, G: 11, H: 11, I: 12, J: 12, K: 12, L: 19, M: 12, N: 19 };
  let rows = '';
  for (let r = 4; r <= LAST; r++) {
    if (r == T) { rows += totRow(r); continue }
    const x = L[r - 4], st = x ? DATA : BLANK, af = `IF(B${r}<>"",ROW(B${r})-3,"")`; let c = '';
    const an = (v, str) => { const t = str ? ' t="str"' : '', val = str ? '<v/>' : `<v>${N(v)}</v>`;
      if (r == 4 || r > 51) return r > 51 && !x ? `<c r="A${r}"${sa(st.A)}/>` : `<c r="A${r}"${sa(st.A)}${t}><f>${X(af)}</f>${val}</c>`;
      return r == 5 ? `<c r="A${r}"${sa(st.A)}${t}><f t="shared" ref="A5:A51" si="0">${X(af)}</f>${val}</c>` : `<c r="A${r}"${sa(st.A)}${t}><f t="shared" si="0"/>${val}</c>` };
    if (x) {
      const ec = x._ec != null ? x._ec : x.vo - x.vn, et = x._et != null ? x._et : this.teor(x.vo, x.pc);   /* _ec/_et: só nas compras que entram com o SALDO a pagar (RDB.saldoLista) */
      c = an(r - 3, false) + ts('B' + r, st.B, x.f) + ts('C' + r, st.C, x.i) + ts('D' + r, st.D, x.cat) + (/^\d+$/.test(x.ped) ? tn('E' + r, st.E, +x.ped) : ts('E' + r, st.E, x.ped || '-')) +
        tn('F' + r, st.F, S(x.dt)) + tn('G' + r, st.G, x.pc) + ts('H' + r, st.H, x.rp) + tn('I' + r, st.I, x.vo) + tn('J' + r, st.J, x.vn) +
        tn('K' + r, st.K, ec, `I${r}-J${r}`) + tn('L' + r, st.L, x.vo ? ec / x.vo : 0, `K${r}/I${r}`) + tn('M' + r, st.M, et, `I${r}*G${r}*0.9`) + tn('N' + r, st.N, x.vo ? et / x.vo : 0, `M${r}/I${r}`)
    } else {
      c = an(0, true) + 'BCDEFGHIJKLMN'.split('').map(k => `<c r="${k}${r}"${sa(st[k])}/>`).join('')
    }
    rows += `<row r="${r}" spans="1:14" x14ac:dyDescent="0.3">${c}</row>`
  }
  if (T > LAST) rows += totRow(T);   /* 498 ou mais lançamentos: o total cai depois da última linha do modelo */
  let s1 = await z.file('xl/worksheets/sheet1.xml').async('string'); if (!s1.includes('@@ROWS@@')) throw new Error('modelo inválido');
  if (T > LAST) s1 = s1.replace(/<dimension ref="[^"]*"\/>/, () => '<dimension ref="A1:N' + T + '"/>');
  z.file('xl/worksheets/sheet1.xml', s1.replace('@@ROWS@@', () => rows));

  /* ---------- aba Resumo Executivo: fórmulas do modelo, com o horizonte configurado ---------- */
  const PC = "'Projeção de Compras'", rg = c => `${PC}!$${c}$4:$${c}$${LAST}`, r5 = '$B$5', win = (a, b) => `${rg('F')},">="&${r5}+${a},${rg('F')},"<="&${r5}+${b}`,
    inW = (a, b) => L.filter(x => S(x.dt) >= ref + a && S(x.dt) <= ref + b), sv = (a, b, k) => inW(a, b).reduce((t, x) => t + (k == 'vn' ? x.vn : k == 'et' ? (x._et != null ? x._et : this.teor(x.vo, x.pc)) : (x._ec != null ? x._ec : x.vo - x.vn)), 0),
    p2 = v => String(v).padStart(2, '0'), dmm = k => { const d = new Date((ref + k - 25569) * 864e5); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) },
    b1 = Math.min(14, H), per = [[0, b1], [15, H]], PER = per.map(([a, b]) => ({ lb: dmm(a) + ' - ' + dmm(b), n: inW(a, b).length, vn: sv(a, b, 'vn'), ec: sv(a, b, 'ec'), et: sv(a, b, 'et') })),
    tot = { n: PER[0].n + PER[1].n, vn: PER[0].vn + PER[1].vn, ec: PER[0].ec + PER[1].ec, et: PER[0].et + PER[1].et }, tr1 = new Date((S(this.pagto(cf.ref).slice(0, 10)) - 3 - 25569) * 864e5),
    dd = p2(tr1.getUTCDate()) + '/' + p2(tr1.getUTCMonth() + 1), transf = Math.max(0, Math.ceil((tot.vn - cf.saldo) / this.PASSO - 1e-9) * this.PASSO), d = cf.resp.d || [];
  let s2 = await z.file('xl/worksheets/sheet2.xml').async('string');
  const patch = (ref, build) => { const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)'), m = s2.match(re); if (!m) throw new Error('célula ' + ref + ' não encontrada no modelo'); const sm = m[1].match(/ s="(\d+)"/); s2 = s2.replace(re, () => build(sm ? sm[1] : '')) };
  patch('B3', s => ts('B3', s, cf.doc)); patch('B5', s => tn('B5', s, ref)); patch('E5', s => ts('E5', s, cf.hor + ' dias')); patch('B7', s => tn('B7', s, cf.saldo));
  patch('A9', s => ts('A9', s, 'Valor total das compras – próximos ' + cf.hor + ' dias'));
  /* A10 ("Economia tributária estimada (REIDI)") e a linha 12 (vazia) ficam como no modelo: o Resumo não tem a linha da economia teórica (A12/B12); a teórica segue só na tabela por quinzena (coluna E) */
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

  if (net) {   /* MARCA INTERNA do arquivo com saldo (as "Marcas" nas propriedades; nada aparece nas células): é por ela que o importador o reconhece e recusa (RDB.ehArquivoSaldo) */
    const cp = await z.file('docProps/core.xml').async('string');
    if (cp.split('</dc:creator>').length != 2 || cp.includes('<cp:keywords')) throw new Error('modelo inválido');
    z.file('docProps/core.xml', cp.replace('</dc:creator>', () => '</dc:creator><cp:keywords>' + X(this.MARCA_SALDO_PROP) + '</cp:keywords>'), { createFolders: false })   /* sem criar a pasta "docProps/": o arquivo continua com as mesmas entradas do modelo */
  }

  const out = await z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  this.expInfo = { saldo: net, n: L.length, parc: net ? SP.parc : 0, quit: net ? SP.quit : 0 };   /* o que foi feito, para a tela avisar */
  await (saveFn || saveAs)('Projecao Mensal de Compras REIDI' + (net ? ' - saldo a pagar' : '') + '.xlsx', out); return out
};
