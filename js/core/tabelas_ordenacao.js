/* Ordenação de relatórios: somente apresentação; nunca grava ou recalcula a base.
   Controles nativos têm prioridade. Linhas de detalhe acompanham sua linha pai. */
(() => {
  'use strict';
  const states = new Map(), originals = new WeakMap();
  const normal = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function number(value) {
    let s = String(value ?? '').trim().replace(/\u00a0/g, ' ');
    if (!s || /^[—–-]+$/.test(s)) return null;
    const money = s.match(/(?:-\s*)?R\$\s*-?\s*[\d.,]+|\(?-?\d[\d.,]*(?:\s*(?:Mi|mil|%))?\)?/i);
    if (!money) return null;
    s = money[0]; const minus = /-|^\(/.test(s), scale = /\bMi\b/i.test(s) ? 1e6 : /\bmil\b/i.test(s) ? 1000 : 1;
    s = s.replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return Number.isFinite(n) ? n * scale * (minus ? -1 : 1) : null;
  }
  function value(cell, numeric) {
    if (!cell) return null;
    const explicit = cell.getAttribute('data-sort-value');
    if (explicit !== null) return numeric ? number(explicit) : normal(explicit);
    // Ignore explanatory text below the amount; preserve live input values.
    const input = cell.querySelector('input:not([type=checkbox]),select');
    const text = input ? input.value : cell.textContent;
    return numeric ? number(text) : normal(text);
  }
  function compare(a, b, direction, numeric, absolute) {
    if (a === null || a === '') return b === null || b === '' ? 0 : 1;
    if (b === null || b === '') return -1;
    if (numeric) return direction * ((absolute ? Math.abs(b) : b) - (absolute ? Math.abs(a) : a));
    return direction * String(b).localeCompare(String(a), 'pt-BR', { numeric: true });
  }
  const ownRows = body => Array.from(body.rows);
  const firstText = row => normal(row.cells[0]?.textContent).replace(/[▾▸⊟⊞★↗︎]/g, '').trim();
  function fixed(row) {
    const t = firstText(row);
    if(depth(row)>0)return false;
    return /^(total(?:\b|\s|\()|subtotal|saldo (?:inicial|final|do periodo|acumulado)|saldo em caixa$|acumulado$|necessidade de aporte|\(\+\) entradas|\(−\) saidas)/.test(t)
      || /^(entrada|saidas|transferencias entre contas)$/.test(t)
      || (row.cells.length === 1 && !row.hasAttribute('data-hist') && !row.querySelector('table'));
  }
  function depth(row) {
    if (row.hasAttribute('data-hist') || (row.cells.length === 1 && row.querySelector('table'))) return 99;
    const c = row.cells[0]; if (!c) return 0;
    const cls = c.className;
    const match = cls.match(/(?:^|\s)pl-(\d+)/);
    if (match) return Number(match[1]);
    const padding = c.style.paddingLeft; return padding ? parseFloat(padding) || 0 : 0;
  }
  function cellAt(row, col) {
    let offset = 0;
    for (const cell of row.cells) { if (col >= offset && col < offset + cell.colSpan) return cell; offset += cell.colSpan; }
    return null;
  }
  function arrange(body, col, dir, numeric, absolute) {
    const rows = ownRows(body);
    for (const row of rows) if (!originals.has(row)) originals.set(row, originalsIndex++);
    if (!dir) { rows.sort((a,b)=>originals.get(a)-originals.get(b)); body.append(...rows); return; }
    const walk = list => {
      const output = []; let run = [];
      const flush = () => {
        if (!run.length) return;
        const groups = [];
        for (const row of run) {
          const d = depth(row), last = groups[groups.length-1];
          if (last && d > last.depth) last.children.push(row);
          else groups.push({row, depth:d, children:[]});
        }
        groups.sort((a,b)=>compare(value(cellAt(a.row,col),numeric),value(cellAt(b.row,col),numeric),dir,numeric,absolute) || originals.get(a.row)-originals.get(b.row));
        for (const g of groups) output.push(g.row,...(g.children.some(r=>depth(r)!==99)?walk(g.children):g.children));
        run = [];
      };
      for (const row of list) { if (fixed(row)) { flush(); output.push(row); } else run.push(row); }
      flush(); return output;
    };
    body.append(...walk(rows));
  }
  let originalsIndex = 0;
  const excluded = /^(acoes|comprovante|arquivo|selecionar|situacao|status)$/;
  function key(table) {
    if(table.dataset.sortKey)return table.dataset.sortKey;
    const owner = table.closest('[data-view],#dash-md,#md') || document.body;
    const tables = Array.from(owner.querySelectorAll('table'));
    const heads = Array.from(table.tHead?.rows[0]?.cells || []).map(h=>normal(h.childNodes[0]?.textContent || h.textContent)).join('|');
    return (owner.getAttribute('data-view') || owner.id || 'relatorio') + ':' + tables.indexOf(table) + ':' + heads;
  }
  function enhance(table) {
    if (!table.tHead || !table.tBodies.length || table.closest('[data-view="usuarios"],#lg')) return;
    const headers = Array.from(table.tHead.rows[table.tHead.rows.length-1]?.cells || []), id=key(table);
    let col=0;
    for (const head of headers) {
      const index=col; col+=head.colSpan;
      if (head.colSpan!==1 || head.querySelector('input')) continue;
      const existing=head.querySelector('[data-ord],button:not([data-report-sort])');
      if (existing) continue; // Dashboard controls already handle complete data and grouped tables.
      let button=head.querySelector('[data-report-sort]');
      const label=normal(button ? head.getAttribute('data-report-label') : head.textContent);
      if (!label || excluded.test(label)) continue;
      if (!button) {
        head.setAttribute('data-report-label',head.textContent.trim());
        button=document.createElement('button');button.type='button';button.className='btn2 report-sort';button.dataset.reportSort=String(index);
        head.append(' ',button);
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          if (/\b(?:srt|[\w]+\.s)\(/.test(head.getAttribute('onclick')||'')) { head.click(); return; }
          const old=states.get(id),dir=!old||old.col!==index?1:old.dir===1?-1:old.dir===-1?0:1;
          const numeric=/valor|saldo|total|pago|recebid|retenc|iss|inss|economia|aplic|rendimento|resgat|invest|conta corrente|entradas|saidas|sem reidi|com reidi|^%$|quinz|^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b|^s[1-4]$/.test(label)
            || /\b20\d{2}\b/.test(label) || Array.from(table.tBodies[0].rows).some(r=>/R\$/.test(cellAt(r,index)?.textContent||''));
          const absolute=/saidas|pago|pagamento|resgates/.test(label) || (numeric && Array.from(table.tBodies[0].rows).some(r=>/text-rose/.test(cellAt(r,index)?.className||'')) && !/saldo|economia/.test(label));
          states.set(id,{col:index,dir,numeric,absolute});
          if(table.hasAttribute('data-sort-key')){document.dispatchEvent(new CustomEvent('report-sort',{detail:{key:id}}));return;}
          runPaused(()=>{ for(const body of table.tBodies) arrange(body,index,dir,numeric,absolute); refreshHeads(table,id); });
          button.focus();
        });
      }
    }
    const state=states.get(id);
    if(state)for(const body of table.tBodies)arrange(body,state.col,state.dir,state.numeric,state.absolute);
    refreshHeads(table,id);
  }
  function refreshHeads(table,id) {
    const state=states.get(id);
    for (const button of table.querySelectorAll('thead [data-report-sort]')) {
      if(button.closest('table')!==table)continue;
      const head=button.parentElement,active=state&&state.col===Number(button.dataset.reportSort)&&state.dir;
      button.textContent=active?(state.dir===1?'▼':'▲'):'⇅';
      const label=head.getAttribute('data-report-label')||'';
      button.setAttribute('aria-label','Ordenar '+label+' por valor ou nome');
      button.title=active?(state.dir===1?'Maior → menor. Clique para inverter.':'Menor → maior. Clique para restaurar.'): 'Ordenar do maior para o menor';
      head.setAttribute('aria-sort',active?(state.dir===1?'descending':'ascending'):'none');
    }
  }
  let queued=false; const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{
    if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()});
  });
  const watch=()=>observer?.observe(document.body,{childList:true,subtree:true,characterData:true});
  function runPaused(fn){observer?.disconnect();try{fn()}finally{watch()}}
  function scan(){runPaused(()=>document.querySelectorAll('main[data-view]:not([data-view="usuarios"]) table,#dash-md table,#md table').forEach(enhance))}
  // Public pure helpers permit small regression tests without changing the application runtime.
  window.ORDT={number,compare,scan,order(list,id,getters){const state=states.get(id),get=state&&getters[state.col];if(!state||!state.dir||!get)return list;return list.map((row,i)=>({row,i})).sort((a,b)=>compare(get(a.row),get(b.row),state.dir,state.numeric,state.absolute)||a.i-b.i).map(x=>x.row)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{scan();watch()},{once:true});else{scan();watch()}
})();
