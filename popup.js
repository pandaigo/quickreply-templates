const MAX_FREE = 3;

let templates = [];
let isPaid = false;
let editingId = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const data = await chrome.storage.local.get(['templates', 'isPaid']);
  templates = data.templates || [];
  isPaid = data.isPaid || false;
}

async function saveTemplates() {
  await chrome.storage.local.set({ templates });
}

function render() {
  renderTemplateList();
  renderQuota();
}

function renderTemplateList() {
  const list = $('#template-list');
  list.innerHTML = '';

  if (templates.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No templates yet.<br>Click + to create your first one!</p>
      </div>`;
    return;
  }

  for (const tpl of templates) {
    const card = document.createElement('div');
    card.className = 'tpl-card';

    const triggerBadge = tpl.trigger
      ? `<span class="tpl-trigger">${esc(tpl.trigger)}</span>`
      : '';

    card.innerHTML = `
      <div class="tpl-card-header">
        <span class="tpl-name">${esc(tpl.name)}</span>
        ${triggerBadge}
      </div>
      <div class="tpl-preview">${esc(tpl.content)}</div>
      <div class="tpl-actions">
        <button class="btn-edit" data-id="${tpl.id}">Edit</button>
        <button class="btn-delete" data-id="${tpl.id}">Delete</button>
      </div>`;

    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditor(tpl.id);
    });

    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTemplate(tpl.id);
    });

    list.appendChild(card);
  }
}

function renderQuota() {
  const info = $('#quota-info');
  if (isPaid) {
    info.innerHTML = `<span class="pro">Pro</span> — ${templates.length} templates`;
  } else {
    const cls = templates.length >= MAX_FREE ? 'warn' : '';
    info.innerHTML = `<span class="${cls}">${templates.length}/${MAX_FREE}</span> free templates`;
  }
}

function bindEvents() {
  $('#btn-add').addEventListener('click', () => {
    if (!isPaid && templates.length >= MAX_FREE) {
      showUpgrade();
      return;
    }
    openEditor(null);
  });

  $('#btn-close').addEventListener('click', closeEditor);
  $('#btn-cancel').addEventListener('click', closeEditor);
  $('#btn-save').addEventListener('click', saveTemplate);

  for (const btn of $$('.var-btn')) {
    btn.addEventListener('click', () => {
      const textarea = $('#tpl-content');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.slice(0, start) + btn.dataset.var + val.slice(end);
      textarea.focus();
      const pos = start + btn.dataset.var.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  $('#btn-import').addEventListener('click', () => {
    if (!isPaid) { showUpgrade(); return; }
    $('#import-file').click();
  });

  $('#import-file').addEventListener('change', handleImport);

  $('#btn-export').addEventListener('click', () => {
    if (!isPaid) { showUpgrade(); return; }
    handleExport();
  });

  $('#btn-upgrade').addEventListener('click', () => {
    // ExtensionPay統合後にここで決済ページを開く
    alert('Payment integration coming soon.\nFor testing, templates are unlimited.');
    isPaid = true;
    chrome.storage.local.set({ isPaid: true });
    closeUpgrade();
    render();
  });

  $('#btn-upgrade-close').addEventListener('click', closeUpgrade);
}

function openEditor(id) {
  editingId = id;
  const tpl = id ? templates.find(t => t.id === id) : null;

  $('#editor-title').textContent = tpl ? 'Edit Template' : 'New Template';
  $('#tpl-name').value = tpl ? tpl.name : '';
  $('#tpl-trigger').value = tpl ? (tpl.trigger || '') : '';
  $('#tpl-content').value = tpl ? tpl.content : '';

  const proBadge = $('#trigger-pro');
  if (isPaid) {
    proBadge.textContent = 'Active';
    proBadge.className = 'pro-badge unlocked';
  } else {
    proBadge.textContent = 'Pro';
    proBadge.className = 'pro-badge';
  }

  $('#main-view').classList.add('hidden');
  $('#editor').classList.remove('hidden');
  $('#tpl-name').focus();
}

function closeEditor() {
  editingId = null;
  $('#editor').classList.add('hidden');
  $('#main-view').classList.remove('hidden');
}

async function saveTemplate() {
  const name = $('#tpl-name').value.trim();
  const content = $('#tpl-content').value.trim();
  const trigger = $('#tpl-trigger').value.trim();

  if (!name) { $('#tpl-name').focus(); return; }
  if (!content) { $('#tpl-content').focus(); return; }

  if (trigger && !isPaid) {
    showUpgrade();
    return;
  }

  if (trigger) {
    const dup = templates.find(t => t.trigger === trigger && t.id !== editingId);
    if (dup) {
      alert(`Shortcut "${trigger}" is already used by "${dup.name}".`);
      $('#tpl-trigger').focus();
      return;
    }
  }

  if (editingId) {
    const tpl = templates.find(t => t.id === editingId);
    if (tpl) {
      tpl.name = name;
      tpl.content = content;
      tpl.trigger = trigger;
      tpl.updatedAt = Date.now();
    }
  } else {
    templates.push({
      id: crypto.randomUUID(),
      name,
      content,
      trigger,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  await saveTemplates();
  closeEditor();
  render();
}

async function deleteTemplate(id) {
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;

  if (!confirm(`Delete "${tpl.name}"?`)) return;

  templates = templates.filter(t => t.id !== id);
  await saveTemplates();
  render();
}

function showUpgrade() {
  $('#upgrade-modal').classList.remove('hidden');
}

function closeUpgrade() {
  $('#upgrade-modal').classList.add('hidden');
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    if (!Array.isArray(imported)) {
      alert('Invalid file format.');
      return;
    }

    let count = 0;
    for (const item of imported) {
      if (!item.name || !item.content) continue;
      templates.push({
        id: crypto.randomUUID(),
        name: String(item.name).slice(0, 50),
        content: String(item.content),
        trigger: item.trigger ? String(item.trigger).slice(0, 30) : '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      count++;
    }

    await saveTemplates();
    render();
    alert(`Imported ${count} template(s).`);
  } catch {
    alert('Failed to read file. Please use a valid JSON file.');
  }
}

function handleExport() {
  const data = templates.map(t => ({
    name: t.name,
    content: t.content,
    trigger: t.trigger || ''
  }));

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quickreply-templates.json';
  a.click();
  URL.revokeObjectURL(url);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
