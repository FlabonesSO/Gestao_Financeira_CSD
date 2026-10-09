/* Exporta o Programação Financeira Quadrimestral na planilha ORIGINAL (Fluxo_de_Caixa_Quadrimestral.xlsm): abas "Prog. Financeira (Protheus)" e "Prog. Fin. (Outras Fontes)"
   com a base de dados completa (tabelas Protheus e Outras_Fontes), "Fluxo de Caixa - Mensal" (uma por mês do filtro), "Fluxo de Caixa - Quadrimestral" (uma por bloco de
   4 meses), NATUREZA_CATEGORIA e Base Lista Suspensa. Estilos, logos, botões de navegação, gráfico, bordas, larguras e assinaturas idênticos: o próprio modelo
   (js/core/fluxo_modelo.js, base64) é aberto e só os dados/números são trocados.
   Tudo conectado como na planilha: os valores por categoria são fórmulas SUMIFS sobre as tabelas Protheus e Outras_Fontes (mudou a base, o fluxo recalcula), clicar num
   valor leva à aba da origem (hiperlink), os botões das abas de base levam ao fluxo, o Quadrimestral puxa entradas/aportes dos Mensais e o saldo inicial do mês
   seguinte vem do saldo acumulado do anterior.
   Depende de: JSZip (js/vendor/jszip.min.js) e FLUXO_MODELO. */
window.FXLS = (function () {
  const X = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''),
    colN = c => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0),
    colL = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s },
    N = v => String(+(+v).toFixed(8)), unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    shift = (f, dr, dc) => f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, a, c, b, r) => a + (a ? c : colL(colN(c) + dc)) + b + (b ? r : +r + dr)),
    serial = (y, m) => Date.UTC(y, m - 1, 1) / 864e5 + 25569;

  /* ---- mini avaliador de fórmulas (SUM, + - * /, parênteses, referências e intervalos) ---- */
  function avalia(f, get) {
    const s = f.replace(/\s+/g, ''); let i = 0;
    const pk = () => s[i], rng = () => /^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)/.exec(s.slice(i));
    function expr() { let v = term(); while (pk() == '+' || pk() == '-') { const o = s[i++], r = term(); v = o == '+' ? v + r : v - r } return v }
    function term() { let v = un(); while (pk() == '*' || pk() == '/') { const o = s[i++], r = un(); v = o == '*' ? v * r : v / r } return v }
    function un() { if (pk() == '-') { i++; return -un() } if (pk() == '+') { i++; return un() } return atom() }
    function atom() {
      if (pk() == '(') { i++; const v = expr(); if (s[i++] != ')') throw new Error('fórmula'); return v }
      let m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(s.slice(i)); if (m) { i += m[0].length; return +m[0] }
      if (s.slice(i, i + 4) == 'SUM(') {
        i += 4; let t = 0;
        do { const r = rng(); if (r) { i += r[0].length; for (let c = colN(r[1]); c <= colN(r[3]); c++) for (let w = +r[2]; w <= +r[4]; w++) t += get(colL(c) + w) } else t += expr() } while (s[i++] == ',');
        return t
      }
      m = /^\$?([A-Z]{1,3})\$?(\d+)/.exec(s.slice(i)); if (m) { i += m[0].length; return get(m[1] + m[2]) }
      throw new Error('fórmula não suportada: ' + f)
    }
    const v = expr(); if (i != s.length) throw new Error('fórmula não suportada: ' + f); return v
  }

  /* ---- uma aba: lê as células do modelo, aplica os valores e recalcula as fórmulas que ficam ---- */
  function aba(xml, T, ov, ativa) {
    const cells = {}, ord = [], sh = {}, re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
    while ((m = re.exec(xml))) {
      const [raw, col, row, at, body] = m, b = body || '', ref = col + row, st = /\ss="(\d+)"/.exec(at), fm = /<f([^>]*)>([^<]*)<\/f>/.exec(b) || (/<f([^>]*)\/>/.exec(b) && [0, /<f([^>]*)\/>/.exec(b)[1], '']), vm = /<v>([^<]*)<\/v>/.exec(b);
      const c = { raw, ref, col, row: +row, s: st ? st[1] : '', t: (/\st="(\w+)"/.exec(at) || [])[1], v: vm ? vm[1] : null, f: null };
      if (fm) {
        const si = /si="(\d+)"/.exec(fm[1]);
        if (fm[2]) { c.f = unx(fm[2]); if (si && /t="shared"/.test(fm[1])) sh[si[1]] = { f: c.f, r: +row, c: colN(col) } }
        else if (si && sh[si[1]]) c.f = shift(sh[si[1]].f, +row - sh[si[1]].r, colN(col) - sh[si[1]].c)
      }
      cells[ref] = c; ord.push(c)
    }
    Object.keys(ov).forEach(k => { const o = ov[k]; if (!cells[k]) { const mm = /^([A-Z]+)(\d+)$/.exec(k); cells[k] = { raw: '', ref: k, col: mm[1], row: +mm[2], s: '', t: null, v: null, f: null, novo: true }; ord.push(cells[k]) } const c = cells[k]; c.o = o; c.f = o.f || null; c.t = null; c.v = o.v == null ? null : o.v });
    const memo = {}, num = ref => {
      const c = cells[ref]; if (!c) return 0; if (ref in memo) return memo[ref];
      let v; if (c.o && c.o.f && typeof c.o.v == 'number') v = c.o.v; else if (c.f && !/!|SUMIFS|\[/.test(c.f)) { memo[ref] = 0; v = avalia(c.f, num) } else if (c.o && typeof c.o.v == 'number') v = c.o.v; else if (!c.o && c.t == null && c.v != null) v = +c.v; else v = 0;
      return memo[ref] = isFinite(v) ? v : 0
    };
    const out = xml.replace(re, (raw, col, row) => {
      const c = cells[col + row], at = `r="${c.ref}"${c.s ? ` s="${c.s}"` : ''}`;
      if (c.o) {
        if (c.o.f) return `<c ${at}><f>${X(c.o.f)}</f><v>${N(num(c.ref))}</v></c>`; /* fórmula + valor em cache */
        if (typeof c.o.v == 'string') return `<c ${at} t="inlineStr"><is><t xml:space="preserve">${X(c.o.v)}</t></is></c>`;
        if (c.o.v == null) return `<c ${at}/>`;
        return `<c ${at}><v>${N(c.o.v)}</v></c>`
      }
      if (c.f) {
        if (/!|SUMIFS|\[/.test(c.f)) return c.v == null ? `<c ${at}/>` : `<c ${at}><v>${c.v}</v></c>`; /* não deveria sobrar nenhuma; guarda o valor lido */
        return `<c ${at}><f>${X(c.f)}</f><v>${N(num(c.ref))}</v></c>`
      }
      return raw
    });
    /* células novas (fora do modelo) não existem neste layout; todas as usadas já estão no modelo */
    const val = ref => { const c = cells[ref]; if (!c) return null; if (c.o && c.o.v != null && !c.o.f) return c.o.v; if (c.f) return num(ref); return c.v == null ? null : (c.t == 's' ? null : +c.v) };
    return { xml: out, val }
  }

  /* ---- gráfico: troca o nome da aba e atualiza os valores em cache ---- */
  function grafico(xml, nome, val) {
    const q = "'" + nome.replace(/'/g, "''") + "'";
    xml = xml.replace(/'Fluxo de Caixa - (?:Mensal|Quadrimestral)'!/g, q + '!');
    return xml.replace(/<c:(num|str)Ref><c:f>([^<]*)<\/c:f><c:(?:num|str)Cache>([\s\S]*?)<\/c:(?:num|str)Cache><\/c:\1Ref>/g, (all, kind, f, cache) => {
      const r = /\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)/.exec(f); if (!r) return all;
      const fc = /<c:formatCode>[\s\S]*?<\/c:formatCode>/.exec(cache), pts = []; let k = 0;
      for (let c = colN(r[1]); c <= colN(r[3]); c++, k++) { const v = val(colL(c) + r[2]); if (v != null || kind == 'str') pts.push(`<c:pt idx="${k}"><c:v>${kind == 'num' ? N(v) : X(v == null ? '' : v)}</c:v></c:pt>`) }
      return `<c:${kind}Ref><c:f>${f}</c:f><c:${kind}Cache>${fc ? fc[0] : ''}<c:ptCount val="${k}"/>${pts.join('')}</c:${kind}Cache></c:${kind}Ref>`
    })
  }

  /* células das abas de base (Protheus / Outras Fontes) */
  const cel = (ref, st, v, f) => {
    const a = `r="${ref}"${st ? ` s="${st}"` : ''}`;
    if (v === '' || v == null) return f ? `<c ${a} t="str"><f>${X(f)}</f><v></v></c>` : `<c ${a}/>`;
    if (typeof v == 'number') return `<c ${a}>${f ? `<f>${X(f)}</f>` : ''}<v>${String(v)}</v></c>`;
    return f ? `<c ${a} t="str"><f>${X(f)}</f><v>${X(v)}</v></c>` : `<c ${a} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`
  };
  function baseAba(tpl, est, attr, rows, nc, fcol, fform) {
    const n = Math.max(1, rows.length), last = 4 + n; let x = '';
    for (let i = 0; i < n; i++) {
      const r = 5 + i, es = est[Math.min(i, est.length - 1)] || [], row = rows[i] || [];
      x += `<row r="${r}" ${attr}>` + Array.from({ length: nc }, (_, j) => cel(colL(j + 1) + r, es[j] || '', row[j], j == fcol ? fform(r) : null)).join('') + '</row>'
    }
    return { xml: tpl.replace('@@ROWS@@', () => x).replace('@@DIM@@', 'A1:' + colL(nc) + last), ref: 'A4:' + colL(nc) + last }
  }
  const qn = n => "'" + String(n).replace(/'/g, "''") + "'", NP = 'Prog. Financeira (Protheus)', NO = 'Prog. Fin. (Outras Fontes)';
  const sumO = (r, d) => `-SUMIFS(Outras_Fontes[VALOR],Outras_Fontes[CATEGORIA],B${r},Outras_Fontes[DATA PREVISTA DE PAGAMENTO],">="&DATE(${d[0]},${d[1]},${d[2]}),Outras_Fontes[DATA PREVISTA DE PAGAMENTO],"<="&DATE(${d[0]},${d[1]},${d[3]}))`,
    sumP = (r, d) => `-SUMIFS(Protheus[TÍTULOS A VENCER\nVALOR NOMINAL],Protheus[CATEGORIA],B${r},Protheus[VENCIMENTO REAL],">="&DATE(${d[0]},${d[1]},${d[2]}),Protheus[VENCIMENTO REAL],"<="&DATE(${d[0]},${d[1]},${d[3]}))`;

  /* spec: { ativa: índice (entre as abas de fluxo), RP: linhas da base Protheus (23 colunas), RO: linhas da base Outras Fontes (10 colunas),
       abas: [{ tipo:'M'|'Q', nome, per, inf, c6:{v,f?}, c7:{v,f?}, cab:[4], uso:4, dt:[[ano,mês,dia1,dia2]×4], ent:[4], entF:[fórmula|null], apo:[4], apoF:[…], O:[15][4], P:[15][4], sai:[4], ext:bool }] }
     O/P = saídas POSITIVAS por categoria (ordem das 15 categorias do modelo) e origem; a aba mostra saídas negativas, como a planilha. */
  async function exportar(spec) {
    if (typeof JSZip == 'undefined' || typeof FLUXO_MODELO == 'undefined') throw new Error('modelo da planilha não carregado');
    const mz = await JSZip.loadAsync(FLUXO_MODELO, { base64: true }), z = new JSZip(), rd = p => mz.file(p).async('string'), bin = p => mz.file(p).async('uint8array'), NS = 'http://schemas.openxmlformats.org/', REL = NS + 'officeDocument/2006/relationships', PK = NS + 'package/2006/relationships';
    z.file('xl/styles.xml', await rd('xl/styles.xml')); z.file('xl/theme/theme1.xml', await rd('xl/theme/theme1.xml'));
    for (const m of ['image1.png', 'image2.png', 'image3.svg', 'image4.png', 'image5.svg']) z.file('xl/media/' + m, await bin('xl/media/' + m));
    const T = {}; for (const k of ['P', 'O', 'M', 'Q', 'N', 'L']) T[k] = await rd(`xl/worksheets/tpl${k}.xml`);
    const est = JSON.parse(await rd('estilos.json')), dwg = { P: await rd('xl/drawings/drawingP.xml'), O: await rd('xl/drawings/drawingO.xml'), M: await rd('xl/drawings/drawingM.xml'), Q: await rd('xl/drawings/drawingQ.xml') }, drel = await rd('xl/drawings/_rels/drawingP.xml.rels'),
      cht = { M: await rd('xl/charts/chartM.xml'), Q: await rd('xl/charts/chartQ.xml') }, prn = { M: await bin('xl/printerSettings/printerM.bin'), Q: await bin('xl/printerSettings/printerQ.bin'), L: await bin('xl/printerSettings/printerL.bin') }, tbl = { P: await rd('xl/tables/tableP.xml'), O: await rd('xl/tables/tableO.xml') };
    let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      wsh = '', wrl = '', dn = '', n = 0;
    const WS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml', DR = 'application/vnd.openxmlformats-officedocument.drawing+xml';
    const sel = (xml, ativa, rep) => xml.replace(/<sheetViews>([\s\S]*?)<\/sheetViews>/, (m, v) => rep ? `<sheetViews><sheetView showGridLines="0"${ativa ? ' tabSelected="1"' : ''} zoomScale="85" zoomScaleNormal="85" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>` : '<sheetViews>' + v.replace(' tabSelected="1"', '').replace('<sheetView ', '<sheetView' + (ativa ? ' tabSelected="1"' : '') + ' ') + '</sheetViews>');
    const ativaGlobal = (spec.ativa || 0) + 2, fM = (spec.abas.find(a => a.tipo == 'M') || {}).nome || 'Fluxo de Caixa - Mensal', fQ = (spec.abas.find(a => a.tipo == 'Q') || {}).nome || 'Fluxo de Caixa - Quadrimestral';
    const add = (nome, xml, o) => { /* o: { rels:[[id,tipo,alvo]], extra:[arquivos], hidden } */
      n++; z.file(`xl/worksheets/sheet${n}.xml`, xml); ct += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="${WS}"/>`;
      if (o && o.rels) z.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PK}">${o.rels.map(r => `<Relationship Id="${r[0]}" Type="${REL}/${r[1]}" Target="${r[2]}"/>`).join('')}</Relationships>`);
      wsh += `<sheet name="${X(nome)}" sheetId="${n}"${o && o.hidden ? ' state="hidden"' : ''} r:id="rId${n}"/>`; wrl += `<Relationship Id="rId${n}" Type="${REL}/worksheet" Target="worksheets/sheet${n}.xml"/>`; return n
    };
    const drawing = (k, nn, xml, rel, chartXml) => {
      z.file(`xl/drawings/drawing${nn}.xml`, xml); ct += `<Override PartName="/xl/drawings/drawing${nn}.xml" ContentType="${DR}"/>`; z.file(`xl/drawings/_rels/drawing${nn}.xml.rels`, rel);
      if (chartXml) { z.file(`xl/charts/chart${nn}.xml`, chartXml); ct += `<Override PartName="/xl/charts/chart${nn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` }
    };
    /* 1) bases de dados */
    const dr = drel.replace("#'Fluxo de Caixa - Quadrimestral'!A1", '#' + qn(fQ) + '!A1').replace("#'Fluxo de Caixa - Mensal'!A1", '#' + qn(fM) + '!A1');
    [['P', NP, spec.RP || [], 23, 22, r => spec.semFormulas ? null : `VLOOKUP(S${r},NATUREZA_CATEGORIA!A:F,6,FALSE)`], ['O', NO, spec.RO || [], 10, 6, r => spec.semFormulas ? null : `F${r}+E${r}`]].forEach(([k, nome, rows, nc, fc, ff], i) => {
      const b = baseAba(T[k], est[k], est[k + 'attr'], rows, nc, fc, ff), id = n + 1, tid = i + 1;
      add(nome, sel(b.xml, id == ativaGlobal + 1), { rels: [['rId2', 'table', `../tables/table${tid}.xml`], ['rId1', 'drawing', `../drawings/drawing${id}.xml`]] });
      drawing(k, id, dwg[k], dr);
      z.file(`xl/tables/table${tid}.xml`, tbl[k].replace(/ref="A4:[A-Z]+\d+"/g, `ref="${b.ref}"`)); ct += `<Override PartName="/xl/tables/table${tid}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
    });
    /* 2) abas do fluxo */
    const cl = ['C', 'D', 'E', 'F'], linkO = `<hyperlink ref="@" location="${X(qn(NO))}!A1" display="${X(qn(NO))}!A1"/>`, linkP = `<hyperlink ref="@" location="${X(qn(NP))}!A1" display="${X(qn(NP))}!A1"/>`;
    spec.abas.forEach((a, n0) => {
      const M = a.tipo == 'M', ov = {}, uso = a.uso || 4;
      ov.C6 = a.c6; ov.C7 = a.c7; ov.G6 = { v: a.per }; ov.G7 = { v: a.inf == null ? '' : a.inf };
      cl.forEach((c, i) => {
        if (i >= uso) { for (let r = 10; r <= 61; r++) if (r != 60 && r != 9) ov[c + r] = { v: null }; return } /* coluna sem dados neste bloco: em branco */
        ov[c + 10] = { v: a.cab[i] }; ov[c + 11] = { v: a.ent[i], f: a.entF && a.entF[i] }; ov[c + 61] = { v: a.apo[i], f: a.apoF && a.apoF[i] };
        for (let k = 0; k < 15; k++) { const r = 13 + 3 * k; ov[c + (r + 1)] = { f: sumO(r + 1, a.dt[i]), v: -a.O[k][i] }; ov[c + (r + 2)] = { f: sumP(r + 2, a.dt[i]), v: -a.P[k][i] }; ov[c + r] = { f: `SUM(${c}${r + 1}:${c}${r + 2})` } }
        ov[c + 12] = a.ext ? { v: -a.sai[i] } : { f: [...Array(15)].map((_, k) => c + (13 + 3 * k)).join('+') }
        if (!M && a.lig && i == 0) { /* quadrimestral: a coluna do 1º mês é ligada à aba mensal (='Fluxo de Caixa - Mensal'!G13 …), como na planilha */
          const L = r => ({ f: qn(a.lig) + '!G' + r });
          ov.C11 = { ...L(11), v: a.ent[0] }; ov.C61 = { ...L(61), v: a.apo[0] }; ov.C12 = { ...L(12), v: -a.sai[0] };
          for (let k = 0; k < 15; k++) { const r = 13 + 3 * k; ov['C' + r] = { ...(k == 14 ? { f: 'SUM(C56:C57)' } : L(r)), v: -(a.O[k][0] + a.P[k][0]) }; /* como no anexo, a soma de 'Nota de Débito' é SUM(C56:C57) */ ov['C' + (r + 1)] = { ...L(r + 1), v: -a.O[k][0] }; ov['C' + (r + 2)] = { ...L(r + 2), v: -a.P[k][0] } }
        }
      });
      if (uso < 4) ov.G59 = { f: `${cl[uso - 1]}59+${cl[uso - 1]}61` };
      const id = n + 1, r = aba(T[a.tipo], null, ov, false);
      let xml = sel(r.xml, id == ativaGlobal + 1, true);
      const hl = []; for (let k = 0; k < 15; k++) { hl.push(linkO.replace('@', `C${14 + 3 * k}:${cl[Math.min(3, uso - 1)]}${14 + 3 * k}`)); hl.push(linkP.replace('@', `C${15 + 3 * k}:${cl[Math.min(3, uso - 1)]}${15 + 3 * k}`)) }
      xml = xml.replace('</mergeCells>', () => '</mergeCells><hyperlinks>' + hl.join('') + '</hyperlinks>');
      z.file(`xl/printerSettings/printerSettings${id}.bin`, prn[a.tipo]);
      add(a.nome, xml, { rels: [['rId2', 'drawing', `../drawings/drawing${id}.xml`], ['rId1', 'printerSettings', `../printerSettings/printerSettings${id}.bin`]] });
      drawing(a.tipo, id, dwg[a.tipo], `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PK}"><Relationship Id="rId2" Type="${REL}/image" Target="../media/image1.png"/><Relationship Id="rId1" Type="${REL}/chart" Target="../charts/chart${id}.xml"/></Relationships>`, grafico(cht[a.tipo], a.nome, r.val));
      dn += `<definedName name="_xlnm.Print_Area" localSheetId="${id - 1}">${qn(a.nome)}!$A$1:$I$${M ? 104 : 103}</definedName>`
    });
    /* 3) tabelas de apoio do modelo */
    add('NATUREZA_CATEGORIA', T.N, {});
    const idL = n + 1; z.file(`xl/printerSettings/printerSettings${idL}.bin`, prn.L); add('Base Lista Suspensa', T.L, { hidden: true, rels: [['rId1', 'printerSettings', `../printerSettings/printerSettings${idL}.bin`]] });
    const k = n;
    z.file('[Content_Types].xml', ct + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PK}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${PK}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="${NS}package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Programação Financeira Quadrimestral</dc:title><dc:creator>Gestão Financeira CSD</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${REL}"><bookViews><workbookView activeTab="${ativaGlobal}" tabRatio="868"/></bookViews><sheets>${wsh}</sheets><definedNames>${dn}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PK}">${wrl}<Relationship Id="rId${k + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${k + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`);
    return z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }
  return { exportar, serial, avalia }
})();
