(() => {
  const AUTO_VARS = ['date', 'time', 'today'];
  let triggerMap = {};
  let expanding = false;
  let dialogOpen = false;
  let active = false;

  init();

  async function init() {
    const data = await chrome.storage.local.get(['isPaid', 'templates']);
    if (data.isPaid) {
      activateExpansion(data.templates || []);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.isPaid?.newValue && !active) {
        chrome.storage.local.get('templates').then(d => {
          activateExpansion(d.templates || []);
        });
      }

      if (changes.templates && active) {
        loadTriggers(changes.templates.newValue || []);
      }
    });
  }

  function activateExpansion(templates) {
    active = true;
    loadTriggers(templates);
    document.addEventListener('input', onInput, true);
  }

  function loadTriggers(templates) {
    triggerMap = {};
    for (const t of templates) {
      if (t.trigger) triggerMap[t.trigger] = t;
    }
  }

  function onInput(e) {
    if (expanding || dialogOpen) return;
    if (Object.keys(triggerMap).length === 0) return;

    const el = e.target;
    if (!el) return;

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      handleInputField(el);
    } else if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
      handleContentEditable(el);
    }
  }

  async function handleInputField(el) {
    const pos = el.selectionStart;
    if (pos == null) return;

    const textBefore = el.value.slice(0, pos);

    for (const [trigger, tpl] of Object.entries(triggerMap)) {
      if (!textBefore.endsWith(trigger)) continue;

      expanding = true;
      const before = el.value.slice(0, pos - trigger.length);
      const after = el.value.slice(pos);
      el.value = before + after;
      el.selectionStart = el.selectionEnd = before.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      expanding = false;

      const result = await processTemplate(tpl.id, tpl.content);
      if (result === null) return;

      expanding = true;
      const curPos = el.selectionStart;
      el.setRangeText(result, curPos, curPos, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      expanding = false;
      return;
    }
  }

  async function handleContentEditable(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const offset = range.startOffset;
    const textBefore = node.textContent.slice(0, offset);

    for (const [trigger, tpl] of Object.entries(triggerMap)) {
      if (!textBefore.endsWith(trigger)) continue;

      expanding = true;
      const delRange = document.createRange();
      delRange.setStart(node, offset - trigger.length);
      delRange.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(delRange);
      document.execCommand('delete', false);
      expanding = false;

      const result = await processTemplate(tpl.id, tpl.content);
      if (result === null) return;

      expanding = true;
      el.focus();
      document.execCommand('insertText', false, result);
      expanding = false;
      return;
    }
  }

  async function processTemplate(templateId, content) {
    let text = expandAutoVars(content);

    const customVars = [...new Set((text.match(/\{(\w+)\}/g) || []))]
      .filter(v => !AUTO_VARS.includes(v.slice(1, -1).toLowerCase()));

    if (customVars.length > 0) {
      dialogOpen = true;
      const values = await showVarDialog(templateId, customVars);
      dialogOpen = false;
      if (!values) return null;
      for (const [v, val] of Object.entries(values)) {
        text = text.replaceAll(v, val);
      }
    }

    return text;
  }

  function expandAutoVars(text) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');

    return text
      .replace(/\{date\}/gi, `${yyyy}-${mm}-${dd}`)
      .replace(/\{time\}/gi, `${hh}:${mi}`)
      .replace(/\{today\}/gi, now.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      }));
  }

  async function showVarDialog(templateId, vars) {
    let allMemory = {};
    let remember = false;
    try {
      const stored = await chrome.storage.local.get(['varMemory', 'varRemember']);
      allMemory = stored.varMemory || {};
      remember = stored.varRemember ?? false;
    } catch (_) {}
    const memory = allMemory[templateId] || {};

    return new Promise((resolve) => {
      const existing = document.getElementById('qr-var-dialog');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.id = 'qr-var-dialog';
      Object.assign(panel.style, {
        position: 'fixed', top: '20px', right: '20px', width: '300px',
        background: '#fff', borderRadius: '12px', padding: '16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25)', zIndex: '2147483647',
        fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#1a1a2e'
      });

      let html = '<div style="font-weight:700;margin-bottom:12px;font-size:15px;">Fill in variables</div>';
      html += '<div style="font-size:11px;color:#888;margin-bottom:10px;">You can copy text from the page and paste here.</div>';
      for (const v of vars) {
        const label = v.slice(1, -1);
        const saved = remember ? (memory[v] || '') : '';
        html += `<div style="margin-bottom:8px;">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:2px;">${label}</label>
          <input type="text" data-var="${v}" value="${escAttr(saved)}" style="width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;outline:none;">
        </div>`;
      }
      html += `<div style="margin-top:10px;display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="qr-var-remember" ${remember ? 'checked' : ''} style="margin:0;">
        <label for="qr-var-remember" style="font-size:12px;color:#666;cursor:pointer;">Remember values</label>
      </div>`;
      html += `<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button id="qr-var-cancel" style="padding:7px 18px;background:#fff;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>
        <button id="qr-var-insert" style="padding:7px 18px;background:#4a90d9;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Insert</button>
      </div>`;

      panel.innerHTML = html;
      document.body.appendChild(panel);

      const firstInput = panel.querySelector('input[data-var]');
      if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select(); }, 50);

      panel.querySelector('#qr-var-cancel').addEventListener('click', () => {
        panel.remove();
        resolve(null);
      });

      panel.querySelector('#qr-var-insert').addEventListener('click', () => {
        const values = {};
        for (const input of panel.querySelectorAll('input[data-var]')) {
          values[input.dataset.var] = input.value;
        }
        const shouldRemember = panel.querySelector('#qr-var-remember').checked;
        try {
          if (shouldRemember) {
            const updated = { ...allMemory, [templateId]: { ...memory, ...values } };
            chrome.storage.local.set({ varMemory: updated, varRemember: true });
          } else {
            chrome.storage.local.set({ varRemember: false });
          }
        } catch (_) {}
        panel.remove();
        resolve(values);
      });

      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') panel.querySelector('#qr-var-insert').click();
        if (e.key === 'Escape') panel.querySelector('#qr-var-cancel').click();
      });
    });
  }

  function escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
