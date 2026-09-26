import { getFiltersFromBackup, type UbolBackup } from "../core/schema.ts";
import {
  extractDomainsFromFilters,
  generateUserscriptHeader,
} from "./workbench.ts";

export const generateUserscriptBundle = (
  backup: UbolBackup,
  options?: { scriptName?: string; version?: string },
): string => {
  const filters = getFiltersFromBackup(backup);
  const domains = extractDomainsFromFilters(filters);
  const header = generateUserscriptHeader(domains, {
    name: options?.scriptName ?? "uBOL In-Page Workbench",
    version: options?.version ?? "1.0.0",
  });

  const serializedFilters = JSON.stringify(filters);
  const serializedBackup = JSON.stringify(backup);

  const runtimeCode = `
(() => {
  'use strict';

  // Seed filters and configuration embedded from uBOL backup
  const initialFilters = ${serializedFilters};
  const initialBackup = ${serializedBackup};

  // 1. Converter Runtime
  function parseUbolToCss(filters, targetDomain, platform) {
    const lines = filters.split('\\n');
    const cssBlocks = [];
    const ifStack = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      if (line.startsWith('!#')) {
        if (line.startsWith('!#if')) {
          const rawExpr = line.slice(4).trim();
          const expr = rawExpr.replace(/^\\((.*)\\)$/, '$1').trim();
          let condition = false;
          if (expr === 'env_mobile') condition = platform === 'mobile';
          else if (expr === '!env_mobile') condition = platform !== 'mobile';
          ifStack.push(condition);
        } else if (line.startsWith('!#else')) {
          if (ifStack.length > 0) ifStack.push(!ifStack.pop());
        } else if (line.startsWith('!#endif')) {
          ifStack.pop();
        }
        continue;
      }

      if (ifStack.some(active => !active)) continue;
      if (line.startsWith('!') || (line.startsWith('#') && !line.startsWith('##') && !line.startsWith('#@#'))) continue;

      const hashIdx = line.indexOf('##');
      if (hashIdx === -1) continue;

      const domainPart = line.slice(0, hashIdx).trim();
      const restPart = line.slice(hashIdx + 2).trim();

      if (domainPart.length > 0) {
        const tokens = domainPart.split(',').map(t => t.trim());
        const target = targetDomain.toLowerCase();
        let excluded = false;
        for (const token of tokens) {
          if (token.startsWith('~')) {
            const neg = token.slice(1).toLowerCase();
            if (target === neg || target.endsWith('.' + neg)) { excluded = true; break; }
          }
        }
        if (excluded) continue;

        const posTokens = tokens.filter(t => !t.startsWith('~'));
        if (posTokens.length > 0) {
          const matched = posTokens.some(t => {
            const pos = t.toLowerCase();
            return pos === '*' || target === pos || target.endsWith('.' + pos);
          });
          if (!matched) continue;
        }
      }

      function extractMatchesMedia(sel) {
        const m = sel.match(/^:matches-media\\(/);
        if (!m) return null;
        const start = m[0].length - 1;
        let depth = 0;
        let close = -1;
        for (let i = start; i < sel.length; i++) {
          if (sel[i] === '(') depth++;
          else if (sel[i] === ')') {
            depth--;
            if (depth === 0) { close = i; break; }
          }
        }
        if (close === -1) return null;
        let mq = sel.slice(start + 1, close).trim();
        const rest = sel.slice(close + 1).trim();
        if (!mq.startsWith('(') && !mq.startsWith('not ') && !mq.startsWith('only ')) mq = '(' + mq + ')';
        return { mediaQuery: mq, restSelector: rest };
      }

      const styleIdx = restPart.indexOf(':style(');
      if (styleIdx === -1) {
        const sel = restPart.trim();
        if (sel.length > 0) {
          const mm = extractMatchesMedia(sel);
          if (mm && mm.restSelector.length > 0) {
            cssBlocks.push('@media ' + mm.mediaQuery + ' {\\n  ' + mm.restSelector + ' {\\n    display: none !important;\\n  }\\n}');
          } else {
            cssBlocks.push(sel + ' {\\n  display: none !important;\\n}');
          }
        }
      } else {
        const selector = restPart.slice(0, styleIdx).trim();
        const openParen = styleIdx + 6;
        let depth = 0;
        let closeParen = -1;
        for (let i = openParen; i < restPart.length; i++) {
          if (restPart[i] === '(') depth++;
          else if (restPart[i] === ')') {
            depth--;
            if (depth === 0) { closeParen = i; break; }
          }
        }
        if (closeParen !== -1 && selector.length > 0) {
          const styleContent = restPart.slice(openParen + 1, closeParen).trim();
          const decls = styleContent.split(';').map(d => d.trim()).filter(Boolean).map(d => '  ' + d + ';').join('\\n');
          const mm = extractMatchesMedia(selector);
          if (mm && mm.restSelector.length > 0) {
            const indented = decls.split('\\n').map(l => '  ' + l).join('\\n');
            cssBlocks.push('@media ' + mm.mediaQuery + ' {\\n  ' + mm.restSelector + ' {\\n' + indented + '\\n  }\\n}');
          } else {
            cssBlocks.push(selector + ' {\\n' + decls + '\\n}');
          }
        }
      }
    }

    return cssBlocks.join('\\n\\n');
  }

  function compileCssToUbolRules(css, domain) {
    if (!css || css.trim().length === 0) return [];
    const prefix = domain && domain.trim().length > 0 ? domain.trim() + '##' : '##';
    const rules = [];

    function processBlock(sel, body, mediaQuery) {
      if (!sel || !body) return;
      const decls = body.split(';').map(d => d.trim()).filter(Boolean);
      const isPureHide = !mediaQuery && decls.length === 1 && decls[0].toLowerCase().startsWith('display:') && decls[0].toLowerCase().includes('none');

      if (isPureHide) {
        rules.push(prefix + sel);
      } else {
        const formatted = decls.map(d => {
          const clean = d.replace(/\\s*!important\\s*$/i, '').trim();
          return clean + ' !important;';
        }).join(' ');

        if (mediaQuery) {
          const subSelectors = sel.split(',').map(s => s.trim()).filter(Boolean);
          for (const sub of subSelectors) {
            rules.push(prefix + ':matches-media(' + mediaQuery + ') ' + sub + ':style(' + formatted + ')');
          }
        } else {
          rules.push(prefix + sel + ':style(' + formatted + ')');
        }
      }
    }

    let i = 0;
    while (i < css.length) {
      const openBrace = css.indexOf('{', i);
      if (openBrace === -1) break;
      const header = css.slice(i, openBrace).trim();
      if (header.startsWith('@media')) {
        let depth = 1;
        let j = openBrace + 1;
        while (j < css.length && depth > 0) {
          if (css[j] === '{') depth++;
          else if (css[j] === '}') depth--;
          j++;
        }
        const mediaBody = css.slice(openBrace + 1, j - 1);
        const mqMatch = header.match(/@media\\s+(.+)$/);
        let mq = mqMatch ? mqMatch[1].trim() : '';
        if (!mq.startsWith('(') && !mq.startsWith('not ') && !mq.startsWith('only ')) mq = '(' + mq + ')';

        const innerBlocks = mediaBody.match(/([^{}]+)\\{([^{}]*)\\}/g) || [];
        for (const ib of innerBlocks) {
          const ob = ib.indexOf('{');
          const cb = ib.lastIndexOf('}');
          processBlock(ib.slice(0, ob).trim(), ib.slice(ob + 1, cb).trim(), mq);
        }
        i = j;
      } else {
        const closeBrace = css.indexOf('}', openBrace);
        if (closeBrace === -1) break;
        processBlock(header, css.slice(openBrace + 1, closeBrace).trim(), null);
        i = closeBrace + 1;
      }
    }

    return rules;
  }

  // 2. Dead Code Analyzer
  function diagnoseDeadCode(hideText, styleCss) {
    const items = [];
    const hideLines = hideText.split(/[\\n,]/).map(s => s.trim()).filter(Boolean);
    for (const sel of hideLines) {
      let count = 0;
      try { count = document.querySelectorAll(sel).length; } catch { count = 0; }
      items.push({ selector: sel, type: 'hide', count });
    }

    const blocks = styleCss.match(/([^{}]+)\\{([^{}]*)\\}/g) || [];
    for (const block of blocks) {
      const open = block.indexOf('{');
      if (open === -1) continue;
      const rawSel = block.slice(0, open).trim();
      if (rawSel.startsWith('@')) continue;
      const subSelectors = rawSel.split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of subSelectors) {
        let count = 0;
        try { count = document.querySelectorAll(sel).length; } catch { count = 0; }
        items.push({ selector: sel, type: 'style', count });
      }
    }
    return items;
  }

  // 3. Web Component / Shadow DOM Modal
  class UbolWorkbenchModal extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    init(domain, platform, hideText, styleText, callbacks) {
      this.domain = domain;
      this.platform = platform;
      this.callbacks = callbacks;
      this.render();
      this.hideArea.value = hideText;
      this.styleArea.value = styleText;
    }

    updateDiagnostics(items) {
      if (!this.diagContainer) return;
      const deadCount = items.filter(i => i.count === 0).length;
      let html = '<div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid #30363d;">' +
        '<span>Analyzed <strong>' + items.length + '</strong> selectors</span>' +
        '<span style="background:' + (deadCount > 0 ? 'rgba(248,81,73,0.2);color:#f85149' : 'rgba(63,185,80,0.2);color:#3fb950') + ';padding:2px 6px;border-radius:4px;font-size:11px;">' +
        (deadCount > 0 ? deadCount + ' Dead' : 'Clean') + '</span></div><div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;margin-top:8px;">';

      for (const item of items) {
        const isDead = item.count === 0;
        html += '<div style="display:flex;align-items:center;justify-content:space-between;background:#0d1117;border:1px solid ' + (isDead ? 'rgba(248,81,73,0.4)' : '#30363d') + ';border-radius:6px;padding:6px 10px;gap:8px;">' +
          '<span style="font-size:11px;color:#8b949e;">' + (item.type === 'hide' ? 'Hide' : 'Style') + '</span>' +
          '<code style="flex:1;font-size:11px;color:#58a6ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + item.selector + '">' + item.selector + '</code>' +
          '<span style="font-size:11px;font-weight:600;color:' + (isDead ? '#f85149' : '#3fb950') + ';">' + (isDead ? '0 matches (dead)' : item.count + ' matches') + '</span></div>';
      }
      html += '</div>';
      this.diagContainer.innerHTML = html;
    }

    render() {
      this.shadowRoot.innerHTML = \`
        <style>
          :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            color: #e6edf3;
            z-index: 2147483647;
            position: fixed;
            bottom: 20px;
            right: 20px;
          }
          * { box-sizing: border-box; }
          .toggle {
            position: fixed; bottom: 20px; right: 20px;
            background: #1f6feb; color: #fff; border: none; border-radius: 9999px;
            padding: 10px 16px; font-weight: 600; cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.5);
          }
          .modal {
            width: 440px; max-height: 560px; background: #161b22;
            border: 1px solid #30363d; border-radius: 12px;
            box-shadow: 0 12px 36px rgba(0,0,0,0.7); display: flex; flex-direction: column; overflow: hidden;
          }
          .modal.collapsed { display: none; }
          .header {
            padding: 12px 16px; background: #0d1117; border-bottom: 1px solid #30363d;
            display: flex; justify-content: space-between; align-items: center;
          }
          .title { font-weight: 700; color: #58a6ff; }
          .badge { background: #21262d; border: 1px solid #30363d; border-radius: 6px; padding: 2px 6px; font-size: 11px; }
          .tab-bar { display: flex; background: #0d1117; border-bottom: 1px solid #30363d; }
          .tab-btn {
            flex: 1; padding: 8px; background: transparent; border: none; border-bottom: 2px solid transparent;
            color: #8b949e; cursor: pointer; font-size: 12px; font-weight: 500;
          }
          .tab-btn.active { color: #58a6ff; border-bottom-color: #58a6ff; font-weight: 600; }
          .content { padding: 12px 16px; flex: 1; overflow-y: auto; }
          .pane { display: none; flex-direction: column; gap: 8px; }
          .pane.active { display: flex; }
          textarea {
            width: 100%; min-height: 220px; background: #0d1117; border: 1px solid #30363d;
            border-radius: 6px; padding: 10px; color: #c9d1d9; font-family: monospace; font-size: 12px;
          }
          .footer {
            padding: 10px 16px; background: #0d1117; border-top: 1px solid #30363d;
            display: flex; justify-content: space-between; align-items: center;
          }
          .btn-export { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-weight: 600; cursor: pointer; }
          .btn-export:hover { background: #2ea043; }
          .btn-sec { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
        </style>
        <button class="toggle" id="open-btn">uBOL</button>
        <div class="modal collapsed" id="modal">
          <div class="header">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="title">uBOL Workbench</span>
              <span class="badge">\${this.domain}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge" style="background:#238636;color:#fff;">\${this.platform === 'mobile' ? 'Mobile' : 'Desktop'}</span>
              <button id="close-btn" style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:16px;">x</button>
            </div>
          </div>
          <div class="tab-bar">
            <button class="tab-btn active" data-tab="hide">Hide Selectors</button>
            <button class="tab-btn" data-tab="style">Style Injection</button>
            <button class="tab-btn" data-tab="diag">Dead Code Diagnostics</button>
          </div>
          <div class="content">
            <div class="pane active" id="pane-hide">
              <span style="font-size:11px;color:#8b949e;">One selector per line or comma-separated (display: none !important;)</span>
              <textarea id="hide-text"></textarea>
            </div>
            <div class="pane" id="pane-style">
              <span style="font-size:11px;color:#8b949e;">CSS declarations (enforcing !important)</span>
              <textarea id="style-text"></textarea>
            </div>
            <div class="pane" id="pane-diag">
              <div id="diag-list"></div>
            </div>
          </div>
          <div class="footer">
            <span style="font-size:11px;color:#3fb950;">Live preview active</span>
            <div style="display:flex;gap:8px;">
              <button class="btn-sec" id="rescan-btn">Rescan</button>
              <button class="btn-export" id="export-btn">Export uBOL JSON</button>
            </div>
          </div>
        </div>
      \`;

      const openBtn = this.shadowRoot.getElementById('open-btn');
      const closeBtn = this.shadowRoot.getElementById('close-btn');
      const modal = this.shadowRoot.getElementById('modal');

      openBtn.onclick = () => { modal.classList.remove('collapsed'); openBtn.style.display = 'none'; };
      closeBtn.onclick = () => { modal.classList.add('collapsed'); openBtn.style.display = 'block'; };

      this.hideArea = this.shadowRoot.getElementById('hide-text');
      this.styleArea = this.shadowRoot.getElementById('style-text');
      this.diagContainer = this.shadowRoot.getElementById('diag-list');

      this.hideArea.oninput = () => this.callbacks.onHideChange(this.hideArea.value);
      this.styleArea.oninput = () => this.callbacks.onStyleChange(this.styleArea.value);

      const tabs = this.shadowRoot.querySelectorAll('.tab-btn');
      const panes = this.shadowRoot.querySelectorAll('.pane');
      tabs.forEach(btn => {
        btn.onclick = () => {
          const tab = btn.dataset.tab;
          tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
          panes.forEach(p => p.classList.toggle('active', p.id === 'pane-' + tab));
          if (tab === 'diag') this.callbacks.onRescan();
        };
      });

      this.shadowRoot.getElementById('rescan-btn').onclick = () => this.callbacks.onRescan();
      this.shadowRoot.getElementById('export-btn').onclick = () => this.callbacks.onExport();
    }
  }

  if (!customElements.get('ubol-workbench')) {
    customElements.define('ubol-workbench', UbolWorkbenchModal);
  }

  // 4. Initialize Client on Page
  const targetDomain = window.location.hostname;
  const platform = window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';

  let styleEl = document.getElementById('ubol-workbench-injected');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ubol-workbench-injected';
    document.head.appendChild(styleEl);
  }

  const initialCss = parseUbolToCss(initialFilters, targetDomain, platform);
  const hideList = [];
  const styleList = [];
  const initialBlocks = initialCss.split('\\n\\n');

  for (const blk of initialBlocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;
    const openBr = trimmed.indexOf('{');
    const closeBr = trimmed.lastIndexOf('}');
    if (openBr === -1 || closeBr === -1) continue;
    const sel = trimmed.slice(0, openBr).trim();
    const body = trimmed.slice(openBr + 1, closeBr).trim();
    if (body === 'display: none !important;') hideList.push(sel);
    else styleList.push(trimmed);
  }

  let currentHide = hideList.join(', ');
  let currentStyle = styleList.join('\\n\\n');

  function applyStyles() {
    const parts = [];
    const cleanHide = currentHide.split(/[\\n,]/).map(s => s.trim()).filter(Boolean).join(', ');
    if (cleanHide) parts.push(cleanHide + ' {\\n  display: none !important;\\n}');
    if (currentStyle.trim()) parts.push(currentStyle.trim());
    styleEl.textContent = parts.join('\\n\\n');
    if (modalEl) modalEl.updateDiagnostics(diagnoseDeadCode(currentHide, currentStyle));
  }

  const modalEl = document.createElement('ubol-workbench');
  modalEl.init(targetDomain, platform, currentHide, currentStyle, {
    onHideChange: (text) => { currentHide = text; applyStyles(); },
    onStyleChange: (text) => { currentStyle = text; applyStyles(); },
    onRescan: () => { modalEl.updateDiagnostics(diagnoseDeadCode(currentHide, currentStyle)); },
    onExport: () => {
      const cleanHide = currentHide.split(/[\\n,]/).map(s => s.trim()).filter(Boolean).sort();
      let exportConfig;
      if (initialBackup && typeof initialBackup === 'object' && Array.isArray(initialBackup.customFilters)) {
        const otherFilters = initialBackup.customFilters.filter(([domain]) => domain !== targetDomain);
        const updatedFilters = cleanHide.length > 0 ? [...otherFilters, [targetDomain, cleanHide]] : otherFilters;
        updatedFilters.sort(([a], [b]) => a.localeCompare(b));

        const styleRules = compileCssToUbolRules(currentStyle, targetDomain).filter(r => r.includes(':style('));
        const otherSandbox = Array.isArray(initialBackup.sandboxFilters)
          ? initialBackup.sandboxFilters.filter(r => {
              const h = r.indexOf('##');
              return h === -1 || r.slice(0, h).trim() !== targetDomain;
            })
          : [];
        const updatedSandbox = [...otherSandbox, ...styleRules].sort();

        exportConfig = {
          ...initialBackup,
          customFilters: updatedFilters,
          ...(updatedSandbox.length > 0 ? { sandboxFilters: updatedSandbox } : {})
        };
      } else {
        const styleRules = compileCssToUbolRules(currentStyle, targetDomain).filter(r => r.includes(':style('));
        exportConfig = {
          version: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
          filteringModes: { none: [], basic: [], optimal: ['all-urls'], complete: [] },
          customFilters: cleanHide.length > 0 ? [[targetDomain, cleanHide]] : [],
          ...(styleRules.length > 0 ? { sandboxFilters: styleRules.sort() } : {})
        };
      }
      const blob = new Blob([JSON.stringify(exportConfig, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ubol-backup-' + targetDomain + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  const mountModal = () => {
    if (document.body) {
      document.body.appendChild(modalEl);
      applyStyles();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(modalEl);
        applyStyles();
      });
    }
  };

  mountModal();
})();
`;

  return `${header}\n\n${runtimeCode}`;
};
