/* Gerador de planilhas Excel (.xlsx) FORMATADAS — sem dependências além do JSZip (js/vendor/jszip.min.js).
   Recursos: estilos (fonte, preenchimento, bordas, alinhamento, formatos de número/data/%), mesclagem, largura de colunas, painéis congelados,
   filtro automático, linhas de grade ocultas, cor da aba, barras de dados, hiperlinks internos, imagem (logo) e gráficos nativos do Excel
   (colunas, barras, linhas, rosca; combinação com eixo secundário), fórmulas com valor em cache, configuração de impressão.
   Uso:  const wb = XP.book(); const ws = wb.sheet('Nome', { tab:'0F62AC', grid:false });
         ws.put(r, c, valor, estilo)  (linha/coluna a partir de 1; valor = número | texto | {f:'SUM(A1:A3)', v:6} | null)
         const bytes = await wb.save();   → Uint8Array do .xlsx
   Estilo: { b,i,sz,c(cor da fonte),fg(preenchimento),box(cor: borda fina nos 4 lados),bl,br,bt,bb([estilo,cor]),h,v,w(quebra),ind,nf(formato) } */
const XP = (() => {
  'use strict';
  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s },
    A1 = (r, c) => colL(c) + r, AB = (r, c) => '$' + colL(c) + '$' + r, qn = n => "'" + String(n).replace(/'/g, "''") + "'",
    NUM = v => (Math.round(v * 1e9) / 1e9).toString(), argb = c => 'FF' + String(c).replace('#', '').toUpperCase();
  const NS = 'http://schemas.openxmlformats.org/', REL = NS + 'officeDocument/2006/relationships', PK = NS + 'package/2006/relationships', SS = NS + 'spreadsheetml/2006/main', DML = NS + 'drawingml/2006/main', CH = NS + 'drawingml/2006/chart', XDR = NS + 'drawingml/2006/spreadsheetDrawing';
  const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  /* data (AAAA-MM-DD) → número de série do Excel */
  const serial = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 + 25569 : null };

  function book(opt = {}) {
    const fontes = [], fills = [], bords = [], nfs = [], xfs = [], idx = { f: {}, fl: {}, b: {}, n: {}, x: {} }, sheets = [], medias = [], F0 = opt.font || 'Calibri', S0 = opt.sz || 10;
    const get = (arr, map, key, make) => { if (map[key] == null) { map[key] = arr.length; arr.push(make()) } return map[key] };
    fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'); idx.fl['none'] = 0;
    fontes.push(`<font><sz val="${S0}"/><color rgb="FF1F2937"/><name val="${F0}"/><family val="2"/></font>`); idx.f['d'] = 0;
    bords.push('<border><left/><right/><top/><bottom/><diagonal/></border>'); idx.b['0'] = 0;
    xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'); idx.x['{}'] = 0;
    const side = (n, v) => v ? `<${n} style="${v[0]}"><color rgb="${argb(v[1])}"/></${n}>` : `<${n}/>`;
    function estilo(st) {
      st = st || {}; const k = JSON.stringify(st); if (idx.x[k] != null) return idx.x[k];
      const fk = JSON.stringify([st.b, st.i, st.u, st.sz, st.c, st.fn]), fid = (st.b || st.i || st.u || st.sz || st.c || st.fn) ? get(fontes, idx.f, fk, () => `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}${st.u ? '<u/>' : ''}<sz val="${st.sz || S0}"/><color rgb="${argb(st.c || '1F2937')}"/><name val="${st.fn || F0}"/><family val="2"/></font>`) : 0,
        flid = st.fg ? get(fills, idx.fl, st.fg, () => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.fg)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0,
        bl = st.bl || (st.box ? ['thin', st.box] : null), br = st.br || (st.box ? ['thin', st.box] : null), bt = st.bt || (st.box ? ['thin', st.box] : null), bb = st.bb || (st.box ? ['thin', st.box] : null),
        bk = JSON.stringify([bl, br, bt, bb]), bid = (bl || br || bt || bb) ? get(bords, idx.b, bk, () => `<border>${side('left', bl)}${side('right', br)}${side('top', bt)}${side('bottom', bb)}<diagonal/></border>`) : 0;
      let nid = 0; if (st.nf) { nid = get(nfs, idx.n, st.nf, () => st.nf); nid = 164 + nfs.indexOf(st.nf) }
      const al = (st.h || st.v || st.w || st.ind || st.rot) ? `<alignment${st.h ? ` horizontal="${st.h}"` : ''} vertical="${st.v || 'center'}"${st.w ? ' wrapText="1"' : ''}${st.ind ? ` indent="${st.ind}"` : ''}${st.rot ? ` textRotation="${st.rot}"` : ''}/>` : '';
      const x = `<xf numFmtId="${nid}" fontId="${fid}" fillId="${flid}" borderId="${bid}" xfId="0"${nid ? ' applyNumberFormat="1"' : ''}${fid ? ' applyFont="1"' : ''}${flid ? ' applyFill="1"' : ''}${bid ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
      idx.x[k] = xfs.length; xfs.push(x); return idx.x[k]
    }

    function sheet(nome, o = {}) {
      const S = { nome, o, cells: new Map(), cw: {}, rh: {}, merges: [], links: [], bars: [], charts: [], imgs: [], filter: null, freeze: null, breaks: [], colDef: o.colw || 9, id: sheets.length + 1 };
      const val = (r, c) => { const x = S.cells.get(r * 16384 + c); return x ? x.v : undefined };
      S.val = val;
      S.put = (r, c, v, st) => { S.cells.set(r * 16384 + c, { r, c, v, st: st || null, s: st ? estilo(st) : 0 }); return S };
      S.fillR = (r1, c1, r2, c2, st) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const x = S.cells.get(r * 16384 + c); if (x) { x.st = Object.assign({}, x.st || {}, st); x.s = estilo(x.st) } else S.put(r, c, null, st) } return S };
      /* estilo aplicado a um bloco mesclado (todas as células, para a borda sair completa) */
      S.merge = (r1, c1, r2, c2, v, st) => { S.merges.push([r1, c1, r2, c2]); for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) S.put(r, c, r == r1 && c == c1 ? v : null, st); return S };
      S.width = (c, w) => { S.cw[c] = w; return S }; S.height = (r, h) => { S.rh[r] = h; return S };
      S.brk = r => { S.breaks.push(r - 1); return S };
      S.link = (r, c, alvo, txt) => { S.links.push([r, c, alvo, txt]); return S };
      S.dataBar = (r1, c1, r2, c2, cor) => { S.bars.push([r1, c1, r2, c2, cor]); return S };
      S.chart = spec => { S.charts.push(spec); return S };
      S.image = (dataUrl, r, c, wpx, hpx, ox, oy) => { const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || ''); if (!m) return S; medias.push({ ext: m[1] == 'jpeg' ? 'jpg' : m[1], b64: m[2] }); S.imgs.push({ n: medias.length, r, c, w: wpx, h: hpx, ox: (ox || 0) * 9525, oy: (oy || 0) * 9525 }); return S };
      /* largura de colunas proporcional ao conteúdo (do cabeçalho e dos dados), sem ocultar nada */
      S.fit = (c1, c2, r1, r2, cfg = {}) => {
        for (let c = c1; c <= c2; c++) {
          let mx = 0; const cap = (cfg.max && cfg.max[c]) || cfg.maxW || 60;
          for (let r = r1; r <= r2; r++) {
            const x = S.cells.get(r * 16384 + c); if (!x || x.v == null) continue; let v = x.v, t; const st = x.st || {}, nf = st.nf || '';
            if (v && typeof v == 'object') v = v.v;
            if (typeof v == 'number') t = /R\$/.test(nf) ? (v < 0 ? 4 : 3) + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length : /yy/.test(nf) ? 10 : /%/.test(nf) ? 7 : /#,##0/.test(nf) ? Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }).length + 1 : String(v).length + 1;
            else t = String(v == null ? '' : v).length;
            if (r == r1) { const w = String(v).split(/\s+/).reduce((m, q) => Math.max(m, q.length), 0); t = Math.min(String(v).length, Math.max(w, 11)) * 1.08 } else if (st.b) t *= 1.08;
            mx = Math.max(mx, t)
          }
          S.cw[c] = Math.max(cfg.min || 7, Math.min(cap, Math.ceil(mx * 1.12 + 2.2)))
        }
        return S
      };
      sheets.push(S); return S
    }
    /* ----------- escrita ----------- */
    function xmlSheet(S) {
      const cells = [...S.cells.values()].sort((a, b) => a.r - b.r || a.c - b.c), rows = {}; let maxR = 1, maxC = 1;
      cells.forEach(x => { (rows[x.r] = rows[x.r] || []).push(x); maxR = Math.max(maxR, x.r); maxC = Math.max(maxC, x.c) });
      Object.keys(S.rh).forEach(r => { if (!rows[r]) rows[r] = [] });
      let sd = '';
      Object.keys(rows).map(Number).sort((a, b) => a - b).forEach(r => {
        const h = S.rh[r]; sd += `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>`;
        rows[r].forEach(x => {
          const ref = A1(x.r, x.c), s = x.s ? ` s="${x.s}"` : '', v = x.v;
          if (v == null || v === '') sd += `<c r="${ref}"${s}/>`;
          else if (typeof v == 'number') sd += isFinite(v) ? `<c r="${ref}"${s}><v>${NUM(v)}</v></c>` : `<c r="${ref}"${s}/>`;
          else if (typeof v == 'boolean') sd += `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
          else if (typeof v == 'object') { const cv = v.v; sd += typeof cv == 'string' ? `<c r="${ref}"${s} t="str"><f>${X(v.f)}</f><v>${X(cv)}</v></c>` : `<c r="${ref}"${s}><f>${X(v.f)}</f>${cv == null || !isFinite(cv) ? '' : `<v>${NUM(cv)}</v>`}</c>` }
          else sd += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`
        }); sd += '</row>'
      });
      const cols = Object.keys(S.cw).map(Number).sort((a, b) => a - b).map(c => `<col min="${c}" max="${c}" width="${S.cw[c]}" customWidth="1"/>`).join('');
      const fr = S.freeze, pane = fr ? `<pane${fr[1] > 1 ? ` xSplit="${fr[1] - 1}"` : ''}${fr[0] > 1 ? ` ySplit="${fr[0] - 1}"` : ''} topLeftCell="${A1(fr[0], fr[1])}" activePane="${fr[0] > 1 && fr[1] > 1 ? 'bottomRight' : fr[0] > 1 ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
      const zoom = S.o.zoom || 100;
      let x = HDR + `<worksheet xmlns="${SS}" xmlns:r="${REL}"><sheetPr>${S.o.tab ? `<tabColor rgb="${argb(S.o.tab)}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${A1(maxR, maxC)}"/>`
        + `<sheetViews><sheetView${S.o.grid === false ? ' showGridLines="0"' : ''}${S.o.sel ? ' tabSelected="1"' : ''} zoomScale="${zoom}" zoomScaleNormal="${zoom}" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="${S.o.rowh || 15}" defaultColWidth="${S.colDef}"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sd}</sheetData>`;
      if (S.filter) x += `<autoFilter ref="${A1(S.filter[0], S.filter[1])}:${A1(S.filter[2], S.filter[3])}"/>`;
      if (S.merges.length) x += `<mergeCells count="${S.merges.length}">${S.merges.map(m => `<mergeCell ref="${A1(m[0], m[1])}:${A1(m[2], m[3])}"/>`).join('')}</mergeCells>`;
      S.bars.forEach((b, i) => { x += `<conditionalFormatting sqref="${A1(b[0], b[1])}:${A1(b[2], b[3])}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="${argb(b[4])}"/></dataBar></cfRule></conditionalFormatting>` });
      if (S.links.length) x += `<hyperlinks>${S.links.map(l => `<hyperlink ref="${A1(l[0], l[1])}" location="${X(l[2])}" display="${X(l[3] || '')}"/>`).join('')}</hyperlinks>`;
      x += `<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.55" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="${S.o.land === false ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;8${X(S.o.rod || '')}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`;
      if (S.breaks.length) x += `<rowBreaks count="${S.breaks.length}" manualBreakCount="${S.breaks.length}">${S.breaks.map(b => `<brk id="${b}" max="16383" man="1"/>`).join('')}</rowBreaks>`;
      if (S.charts.length || S.imgs.length) x += '<drawing r:id="rId1"/>';
      return x + '</worksheet>'
    }
    /* ----------- gráficos ----------- */
    const TX = (sz, c, b) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${String(c).replace('#', '')}"/></a:solidFill><a:latin typeface="${F0}"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>`;
    const refStr = (R) => `${qn(R.sh.nome)}!${AB(R.r1, R.c1)}:${AB(R.r2, R.c2)}`, cellsOf = R => { const a = []; for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) { let v = R.sh.val(r, c); if (v && typeof v == 'object') v = v.v; a.push(v) } return a };
    const strRef = R => { const a = cellsOf(R); return `<c:strRef><c:f>${X(refStr(R))}</c:f><c:strCache><c:ptCount val="${a.length}"/>${a.map((v, i) => `<c:pt idx="${i}"><c:v>${X(v == null ? '' : v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>` },
      numRef = (R, nf) => { const a = cellsOf(R); return `<c:numRef><c:f>${X(refStr(R))}</c:f><c:numCache><c:formatCode>${X(nf || 'General')}</c:formatCode><c:ptCount val="${a.length}"/>${a.map((v, i) => typeof v == 'number' ? `<c:pt idx="${i}"><c:v>${NUM(v)}</c:v></c:pt>` : '').join('')}</c:numCache></c:numRef>` };
    const solid = c => `<a:solidFill><a:srgbClr val="${String(c).replace('#', '')}"/></a:solidFill>`;
    function serXml(s, i, kind, cats, spec) {
      const nm = typeof s.name == 'string' ? `<c:tx><c:v>${X(s.name)}</c:v></c:tx>` : `<c:tx>${strRef(s.name)}</c:tx>`, t = s.type || kind;
      const lab = s.labels ? `<c:dLbls><c:numFmt formatCode="${X(s.lnf || spec.lnf || '#,##0')}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${TX(s.lsz || 800, s.lc || '334155', 1)}${t == 'line' ? '<c:dLblPos val="t"/>' : kind == 'doughnut' ? '' : '<c:dLblPos val="outEnd"/>'}<c:showLegendKey val="0"/><c:showVal val="${s.pct ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${s.pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>` : '';
      const catx = `<c:cat>${strRef(cats)}</c:cat>`, valx = `<c:val>${numRef(s.vals, s.nf)}</c:val>`;
      if (kind == 'doughnut') return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${nm}${(s.colors || []).map((c, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr>${solid(c)}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('')}${lab}${catx}${valx}</c:ser>`;
      if (t == 'line') return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${nm}<c:spPr><a:ln w="31750" cap="rnd">${solid(s.color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${solid('FFFFFF')}<a:ln w="22225">${solid(s.color)}</a:ln></c:spPr></c:marker>${lab}${catx}${valx}<c:smooth val="0"/></c:ser>`;
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${nm}<c:spPr>${solid(s.color)}</c:spPr><c:invertIfNegative val="0"/>${(s.colors || []).map((c, k) => `<c:dPt><c:idx val="${k}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${solid(c)}</c:spPr></c:dPt>`).join('')}${lab}${catx}${valx}</c:ser>`
    }
    function chartXml(spec) {
      const kind = spec.kind, cats = spec.cats, horiz = kind == 'bar', ss = spec.series, sec = ss.filter(s => s.axis == 2), pri = ss.filter(s => s.axis != 2);
      const ttl = spec.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="00144D"/></a:solidFill><a:latin typeface="${F0}"/></a:defRPr></a:pPr><a:r><a:rPr lang="pt-BR" sz="1100" b="1"><a:solidFill><a:srgbClr val="00144D"/></a:solidFill><a:latin typeface="${F0}"/></a:rPr><a:t>${X(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
      const ax = (id, cross, pos, o) => o.cat ? `<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="${horiz ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${o.del ? 1 : 0}"/><c:axPos val="${pos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525">${solid('B7C9E2')}</a:ln></c:spPr>${TX(spec.asz || 800, '475569')}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
        : `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/>${o.min != null ? `<c:min val="${o.min}"/>` : ''}</c:scaling><c:delete val="${o.del ? 1 : 0}"/><c:axPos val="${pos}"/>${o.grid ? `<c:majorGridlines><c:spPr><a:ln w="6350">${solid('E2E8F0')}</a:ln></c:spPr></c:majorGridlines>` : ''}<c:numFmt formatCode="${X(spec.vnf || '#,##0')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${TX(800, '64748B')}<c:crossAx val="${cross}"/><c:crosses val="${o.max ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
      let plot = '', k = 0;
      if (kind == 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${ss.map((s, i) => serXml(s, i, 'doughnut', cats, spec)).join('')}<c:firstSliceAng val="0"/><c:holeSize val="${spec.hole || 58}"/></c:doughnutChart>`;
      else {
        const grp = (arr, axA, axB) => {
          const bars = arr.filter(s => (s.type || kind) != 'line'), lines = arr.filter(s => (s.type || kind) == 'line'); let o = '';
          if (bars.length) o += `<c:barChart><c:barDir val="${horiz ? 'bar' : 'col'}"/><c:grouping val="${spec.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${bars.map(s => serXml(s, k++, kind == 'bar' ? 'bar' : 'col', cats, spec)).join('')}<c:gapWidth val="${spec.gap == null ? 60 : spec.gap}"/>${spec.stacked ? '<c:overlap val="100"/>' : '<c:overlap val="-8"/>'}<c:axId val="${axA}"/><c:axId val="${axB}"/></c:barChart>`;
          if (lines.length) o += `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines.map(s => serXml(s, k++, 'line', cats, spec)).join('')}<c:marker val="1"/><c:axId val="${axA}"/><c:axId val="${axB}"/></c:lineChart>`;
          return o
        };
        plot = grp(pri, 111, 112) + (sec.length ? grp(sec, 113, 114) : '');
        plot += ax(111, 112, horiz ? 'l' : 'b', { cat: 1 }) + ax(112, 111, horiz ? 'b' : 'l', { grid: !horiz, del: horiz });
        if (sec.length) plot += ax(113, 114, 'b', { cat: 1, del: 1 }) + ax(114, 113, 'r', { max: 1, del: spec.secHide !== false ? 0 : 1 })
      }
      const leg = spec.legend === null ? '' : `<c:legend><c:legendPos val="${spec.legend || 'b'}"/><c:overlay val="0"/>${TX(800, '334155')}</c:legend>`;
      return HDR + `<c:chartSpace xmlns:c="${CH}" xmlns:a="${DML}" xmlns:r="${REL}"><c:roundedCorners val="0"/><c:chart>${ttl}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/></c:spPr></c:plotArea>${leg}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525">${solid('B7C9E2')}</a:ln></c:spPr>${TX(900, '334155')}</c:chartSpace>`
    }
    const anchor = (r1, c1, r2, c2, ox = 0, oy = 0) => `<xdr:from><xdr:col>${c1 - 1}</xdr:col><xdr:colOff>${ox}</xdr:colOff><xdr:row>${r1 - 1}</xdr:row><xdr:rowOff>${oy}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`;

    async function save() {
      if (typeof JSZip == 'undefined') throw new Error('JSZip não carregado'); const z = new JSZip();
      let ct = `<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`;
      let wsh = '', wrl = '', dn = '', nCh = 0, nDr = 0;
      medias.forEach((m, i) => z.file(`xl/media/image${i + 1}.${m.ext}`, m.b64, { base64: true }));
      sheets.forEach((S, i) => {
        const n = i + 1; z.file(`xl/worksheets/sheet${n}.xml`, xmlSheet(S)); ct += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
        wsh += `<sheet name="${X(S.nome)}" sheetId="${n}" r:id="rId${n}"/>`; wrl += `<Relationship Id="rId${n}" Type="${REL}/worksheet" Target="worksheets/sheet${n}.xml"/>`;
        if (S.filter) dn += `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${qn(S.nome)}!${AB(S.filter[0], S.filter[1])}:${AB(S.filter[2], S.filter[3])}</definedName>`;
        if (S.o.titles) dn += `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${qn(S.nome)}!$${S.o.titles[0]}:$${S.o.titles[1]}</definedName>`;
        if (S.charts.length || S.imgs.length) {
          nDr++; let dx = HDR + `<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${DML}" xmlns:r="${REL}" xmlns:c="${CH}">`, dr = '', rid = 0;
          S.imgs.forEach(im => { rid++; dr += `<Relationship Id="rId${rid}" Type="${REL}/image" Target="../media/image${im.n}.${medias[im.n - 1].ext}"/>`; dx += `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.c - 1}</xdr:col><xdr:colOff>${im.ox}</xdr:colOff><xdr:row>${im.r - 1}</xdr:row><xdr:rowOff>${im.oy}</xdr:rowOff></xdr:from><xdr:ext cx="${im.w * 9525}" cy="${im.h * 9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${rid + 1}" name="Logo ${rid}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.w * 9525}" cy="${im.h * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>` });
          S.charts.forEach(sp => { rid++; nCh++; z.file(`xl/charts/chart${nCh}.xml`, chartXml(sp)); ct += `<Override PartName="/xl/charts/chart${nCh}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`; dr += `<Relationship Id="rId${rid}" Type="${REL}/chart" Target="../charts/chart${nCh}.xml"/>`;
            dx += `<xdr:twoCellAnchor>${anchor(sp.r1, sp.c1, sp.r2, sp.c2, 0, 0)}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${rid + 1}" name="${X(sp.title || 'Gráfico ' + rid)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CH}"><c:chart r:id="rId${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>` });
          z.file(`xl/drawings/drawing${nDr}.xml`, dx + '</xdr:wsDr>'); ct += `<Override PartName="/xl/drawings/drawing${nDr}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
          z.file(`xl/drawings/_rels/drawing${nDr}.xml.rels`, HDR + `<Relationships xmlns="${PK}">${dr}</Relationships>`);
          z.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, HDR + `<Relationships xmlns="${PK}"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${nDr}.xml"/></Relationships>`)
        }
      });
      const nfx = nfs.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${X(f)}"/>`).join('');
      z.file('xl/styles.xml', HDR + `<styleSheet xmlns="${SS}">${nfs.length ? `<numFmts count="${nfs.length}">${nfx}</numFmts>` : ''}<fonts count="${fontes.length}">${fontes.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${bords.length}">${bords.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
      const act = Math.max(0, sheets.findIndex(s => s.o.sel));
      z.file('xl/workbook.xml', HDR + `<workbook xmlns="${SS}" xmlns:r="${REL}"><bookViews><workbookView activeTab="${act}" tabRatio="850"/></bookViews><sheets>${wsh}</sheets>${dn ? `<definedNames>${dn}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
      wrl += `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/>`;
      z.file('xl/_rels/workbook.xml.rels', HDR + `<Relationships xmlns="${PK}">${wrl}</Relationships>`);
      z.file('_rels/.rels', HDR + `<Relationships xmlns="${PK}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${PK}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
      z.file('docProps/core.xml', HDR + `<cp:coreProperties xmlns:cp="${PK.replace('relationships', 'metadata/core-properties')}" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(opt.titulo || '')}</dc:title><dc:creator>${X(opt.autor || 'Consórcio Santa Dulce')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
      z.file('[Content_Types].xml', HDR + ct + '</Types>');
      return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    }
    return { sheet, save, estilo }
  }
  return { book, serial, colL, A1 }
})();
