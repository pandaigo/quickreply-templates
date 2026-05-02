chrome.runtime.onInstalled.addListener(() => {
  rebuildMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.templates) {
    rebuildMenus();
  }
});

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();

  const { templates = [] } = await chrome.storage.local.get('templates');

  chrome.contextMenus.create({
    id: 'qr-parent',
    title: 'QuickReply Templates',
    contexts: ['editable']
  });

  if (templates.length === 0) {
    chrome.contextMenus.create({
      id: 'qr-empty',
      parentId: 'qr-parent',
      title: '(No templates yet)',
      contexts: ['editable'],
      enabled: false
    });
  } else {
    for (const t of templates) {
      chrome.contextMenus.create({
        id: 'qr-tpl-' + t.id,
        parentId: 'qr-parent',
        title: truncate(t.name, 40),
        contexts: ['editable']
      });
    }
  }

  chrome.contextMenus.create({
    id: 'qr-sep',
    parentId: 'qr-parent',
    type: 'separator',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'qr-manage',
    parentId: 'qr-parent',
    title: 'Manage Templates...',
    contexts: ['editable']
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'qr-manage') {
    chrome.action.openPopup?.() || chrome.tabs.create({ url: 'popup.html' });
    return;
  }

  const menuId = String(info.menuItemId);
  if (!menuId.startsWith('qr-tpl-')) return;

  const templateId = menuId.slice(7);
  const { templates = [] } = await chrome.storage.local.get('templates');
  const template = templates.find(t => t.id === templateId);
  if (!template || !tab?.id) return;

  const text = expandAutoVars(template.content);

  const stored = await chrome.storage.local.get(['varMemory', 'varRemember']);
  const varMemory = stored.varMemory || {};
  const varRemember = stored.varRemember ?? false;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: insertTextIntoField,
      args: [templateId, text, varMemory, varRemember]
    });

    const ret = results?.[0]?.result;
    if (ret?.save) {
      await chrome.storage.local.set({
        varMemory: ret.varMemory,
        varRemember: ret.varRemember
      });
    }
  } catch (_) {
    // chrome:// 等のページではスクリプト実行不可
  }
});

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

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function insertTextIntoField(templateId, text, allMemory, varRemember) {
  const AUTO = ['date', 'time', 'today'];
  const customVars = [...new Set((text.match(/\{(\w+)\}/g) || []))]
    .filter(v => !AUTO.includes(v.slice(1, -1).toLowerCase()));

  const targetEl = document.activeElement;
  let result = text;
  let saveResult = null;

  if (customVars.length > 0) {
    const dialogResult = await showVarDialog(templateId, customVars, allMemory, varRemember);
    if (!dialogResult) return null;
    for (const [v, val] of Object.entries(dialogResult.values)) {
      result = result.replaceAll(v, val);
    }
    saveResult = dialogResult.memoryUpdate;
  }

  if (targetEl) targetEl.focus();
  const el = targetEl || document.activeElement;
  if (!el) { showToast(false); return saveResult; }

  let ok = false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.setRangeText(result, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    ok = true;
  } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    ok = document.execCommand('insertText', false, result);
  }
  showToast(ok);
  return saveResult;

  function showVarDialog(tplId, vars, memAll, remember) {
    const memory = memAll[tplId] || {};

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
        const escaped = saved.replace(/"/g, '&quot;').replace(/</g, '&lt;');
        html += `<div style="margin-bottom:8px;">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:2px;">${label}</label>
          <input type="text" data-var="${v}" value="${escaped}" style="width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;outline:none;">
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
        let memoryUpdate = null;
        if (shouldRemember) {
          memoryUpdate = {
            save: true,
            varMemory: { ...memAll, [tplId]: { ...memory, ...values } },
            varRemember: true
          };
        } else {
          memoryUpdate = { save: true, varMemory: memAll, varRemember: false };
        }
        panel.remove();
        resolve({ values, memoryUpdate });
      });

      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') panel.querySelector('#qr-var-insert').click();
        if (e.key === 'Escape') panel.querySelector('#qr-var-cancel').click();
      });
    });
  }

  function showToast(success) {
    const existing = document.getElementById('qr-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'qr-toast';
    toast.textContent = success ? '✓ Template inserted' : '✗ Could not insert here';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      background: success ? '#1a1a2e' : '#dc2626', color: '#fff',
      padding: '10px 20px', borderRadius: '8px', fontSize: '14px',
      fontFamily: 'system-ui, sans-serif', zIndex: '2147483647',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transition: 'opacity 0.3s', opacity: '1'
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }
}
