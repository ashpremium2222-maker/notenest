'use strict';

// ============================================================
// STORAGE KEYS
// ============================================================
const STORAGE_KEY  = 'notenest_v2';
const SETTINGS_KEY = 'notenest_settings_v2';

// ============================================================
// STATE
// ============================================================
let state = {
  notes:        [],
  activeNoteId: null,
  searchQuery:  '',
  activeTag:    'all',
  sortBy:       'modified',
  viewMode:     'grid',
  sidebarOpen:  true,
  theme:        'light',
};

// ============================================================
// UTILS
// ============================================================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() { return new Date().toISOString(); }

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTagHue(tag) {
  let h = 0;
  for (const c of tag) h = ((h << 5) - h) + c.charCodeAt(0);
  return `tag-hue-${Math.abs(h) % 8}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, q) {
  if (!q) return esc(text);
  const s = esc(text);
  const p = esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return s.replace(new RegExp(p, 'gi'), m => `<mark>${m}</mark>`);
}

// ============================================================
// PERSISTENCE
// ============================================================

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      viewMode:    state.viewMode,
      sortBy:      state.sortBy,
      sidebarOpen: state.sidebarOpen,
      theme:       state.theme,
    }));
  } catch (e) { /* quota exceeded or private mode */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.notes = JSON.parse(raw);
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    state.viewMode   = s.viewMode   || 'grid';
    state.sortBy     = s.sortBy     || 'modified';
    state.sidebarOpen = s.sidebarOpen !== false;
    state.theme      = s.theme      || 'light';
  } catch (e) { /* ignore */ }
}

// ============================================================
// NOTE CRUD
// ============================================================

function createNote() {
  const note = {
    id:         genId(),
    title:      '',
    content:    '',
    tags:       [],
    color:      'default',
    pinned:     false,
    createdAt:  now(),
    modifiedAt: now(),
  };
  state.notes.unshift(note);
  save();
  return note;
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.activeNoteId === id) state.activeNoteId = null;
  save();
}

function updateNote(id, fields) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  Object.assign(note, fields, { modifiedAt: now() });
  save();
}

function getActive() {
  return state.notes.find(n => n.id === state.activeNoteId) || null;
}

function filteredSorted() {
  let notes = [...state.notes];
  if (state.activeTag !== 'all') notes = notes.filter(n => n.tags.includes(state.activeTag));
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      stripHtml(n.content).toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (state.sortBy === 'title')   return a.title.localeCompare(b.title);
    if (state.sortBy === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    return new Date(b.modifiedAt) - new Date(a.modifiedAt);
  });
  return notes;
}

function allTagsMap() {
  const m = {};
  for (const n of state.notes) for (const t of n.tags) m[t] = (m[t]||0)+1;
  return m;
}

function totalWords() {
  return state.notes.reduce((a, n) => a + countWords(stripHtml(n.content) + ' ' + n.title), 0);
}

// ============================================================
// DOM REFS
// ============================================================

const $ = id => document.getElementById(id);
const dom = {
  appShell:     document.querySelector('.app-shell'),
  htmlEl:       document.documentElement,
  searchInput:  $('search-input'),
  btnNewNote:   $('btn-new-note'),
  btnEmptyCta:  $('btn-empty-cta'),
  tagFilterList: $('tag-filter-list'),
  sortBtns:     document.querySelectorAll('.sort-btn'),
  statNotes:    $('stat-notes'),
  statTags:     $('stat-tags'),
  statWords:    $('stat-words'),
  notesContainer: $('notes-container'),
  emptyState:   $('empty-state'),
  panelTitle:   $('panel-title'),
  btnToggleView:  $('btn-toggle-view'),
  viewIcon:       $('view-icon'),
  btnSidebarToggle: $('btn-sidebar-toggle'),
  themeToggle:    $('theme-toggle'),
  themeLabel:     $('theme-label'),
  editorWelcome:  $('editor-welcome'),
  editorContent:  $('editor-content-area'),
  noteTitleInput: $('note-title-input'),
  tagsDisplay:    $('tags-display'),
  tagsInput:      $('tags-input'),
  colorPicker:    $('note-color-picker'),
  richEditor:     $('rich-editor'),
  wordCount:      $('word-count'),
  editorMeta:     $('editor-meta'),
  autoSave:       $('auto-save-indicator'),
  btnPin:         $('btn-pin'),
  btnDelete:      $('btn-delete'),
  btnCloseEditor: $('btn-close-editor'),
  toastContainer: $('toast-container'),
  deleteModal:    $('delete-modal'),
  btnCancel:      $('btn-modal-cancel'),
  btnConfirm:     $('btn-modal-confirm'),
};

// ============================================================
// THEME
// ============================================================

function applyTheme(t) {
  state.theme = t;
  dom.htmlEl.setAttribute('data-theme', t);
  dom.themeLabel.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function toggleTheme() {
  applyTheme(state.theme === 'light' ? 'dark' : 'light');
  save();
}

// ============================================================
// RENDER: NOTES LIST
// ============================================================

function renderList() {
  const notes = filteredSorted();
  const c = dom.notesContainer;

  Array.from(c.children).forEach(ch => { if (ch.id !== 'empty-state') ch.remove(); });

  if (notes.length === 0) {
    dom.emptyState.style.display = 'flex';
    const title = dom.emptyState.querySelector('.empty-title');
    const sub   = dom.emptyState.querySelector('.empty-sub');
    const cta   = dom.emptyState.querySelector('.btn-empty-cta');
    if (state.searchQuery || state.activeTag !== 'all') {
      title.textContent = 'No notes found';
      sub.textContent   = 'Try a different search or tag filter.';
      cta.style.display = 'none';
    } else {
      title.textContent = 'No notes yet';
      sub.innerHTML     = 'Click <strong>New Note</strong> to get started';
      cta.style.display = 'inline-flex';
    }
    return;
  }

  dom.emptyState.style.display = 'none';
  notes.forEach((note, i) => {
    const card = makeCard(note);
    card.style.animationDelay = `${i * 25}ms`;
    c.appendChild(card);
  });
}

function makeCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('data-id',    note.id);
  card.setAttribute('data-color', note.color || 'default');
  if (note.id === state.activeNoteId) card.classList.add('selected');
  if (note.pinned) card.classList.add('pinned');

  const title   = note.title || 'Untitled';
  const preview = stripHtml(note.content).trim() || 'No content';
  const q       = state.searchQuery;

  card.innerHTML = `
    <div class="note-card-header">
      <div class="note-card-title">${highlight(title, q)}</div>
      <div class="note-card-pin" title="Pinned">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="m12 17-1-9 9 1-2 3 3 3-3 3-3-3-3 2z"/></svg>
      </div>
    </div>
    <div class="note-card-preview">${highlight(preview.slice(0,150), q)}</div>
    <div class="note-card-footer">
      <span class="note-card-date">${relativeTime(note.modifiedAt)}</span>
      <div class="note-card-tags">
        ${note.tags.slice(0,2).map(t=>`<span class="note-tag-chip ${getTagHue(t)}">${esc(t)}</span>`).join('')}
        ${note.tags.length > 2 ? `<span class="note-tag-chip tag-hue-7">+${note.tags.length-2}</span>` : ''}
      </div>
    </div>
  `;

  card.addEventListener('click', () => openNote(note.id));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNote(note.id); } });
  return card;
}

// ============================================================
// RENDER: SIDEBAR
// ============================================================

function renderSidebar() {
  const tags  = allTagsMap();
  const list  = dom.tagFilterList;
  const allBtn = list.querySelector('[data-tag="all"]');

  if (allBtn) allBtn.querySelector('.tag-count').textContent = state.notes.length;

  Array.from(list.children).forEach(ch => { if (ch.getAttribute('data-tag') !== 'all') ch.remove(); });

  Object.entries(tags).sort((a,b)=>b[1]-a[1]).forEach(([tag, count]) => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-item' + (state.activeTag === tag ? ' active' : '');
    btn.setAttribute('data-tag', tag);
    btn.innerHTML = `
      <span class="note-tag-chip ${getTagHue(tag)}" style="width:8px;height:8px;padding:0;border-radius:50%;display:inline-block;"></span>
      ${esc(tag)}
      <span class="tag-count">${count}</span>
    `;
    btn.addEventListener('click', () => {
      state.activeTag = tag;
      refreshTagActive();
      renderList();
      updatePanelTitle();
    });
    list.appendChild(btn);
  });

  if (allBtn) allBtn.classList.toggle('active', state.activeTag === 'all');
  dom.statTags.textContent  = Object.keys(tags).length;
  dom.statWords.textContent = abbr(totalWords());
  dom.statNotes.textContent = state.notes.length;
}

function refreshTagActive() {
  dom.tagFilterList.querySelectorAll('.tag-filter-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tag') === state.activeTag);
  });
}

function abbr(n) {
  return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'k' : String(n);
}

function updatePanelTitle() {
  if (state.searchQuery)        dom.panelTitle.textContent = `"${state.searchQuery}"`;
  else if (state.activeTag !== 'all') dom.panelTitle.textContent = `#${state.activeTag}`;
  else                          dom.panelTitle.textContent = 'All Notes';
}

// ============================================================
// EDITOR
// ============================================================

function openNote(id) {
  state.activeNoteId = id;
  const note = getActive();
  if (!note) return;

  dom.editorWelcome.style.display = 'none';
  dom.editorContent.removeAttribute('hidden');

  dom.noteTitleInput.value = note.title;
  renderEditorTags(note.tags);

  dom.colorPicker.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('active', d.getAttribute('data-color') === (note.color||'default'));
  });

  dom.richEditor.innerHTML = note.content;
  updatePinBtn(note.pinned);
  updateWordCount();
  updateMeta(note);

  dom.notesContainer.querySelectorAll('.note-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('data-id') === id);
  });
}

function closeEditor() {
  state.activeNoteId = null;
  dom.editorWelcome.style.display = '';
  dom.editorContent.setAttribute('hidden', '');
  dom.notesContainer.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
}

function updatePinBtn(pinned) {
  dom.btnPin.classList.toggle('pinned', pinned);
  dom.btnPin.title = pinned ? 'Unpin note' : 'Pin note';
}

function updateMeta(note) {
  dom.editorMeta.textContent = `Modified ${relativeTime(note.modifiedAt)}`;
}

function updateWordCount() {
  const wc = countWords(dom.noteTitleInput.value + ' ' + stripHtml(dom.richEditor.innerHTML));
  dom.wordCount.textContent = `${wc} word${wc !== 1 ? 's' : ''}`;
}

// ============================================================
// EDITOR TAGS
// ============================================================

function renderEditorTags(tags) {
  dom.tagsDisplay.innerHTML = '';
  tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${esc(tag)}<button class="tag-pill-remove" data-tag="${esc(tag)}" aria-label="Remove ${esc(tag)}">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`;
    pill.querySelector('.tag-pill-remove').addEventListener('click', () => removeTag(tag));
    dom.tagsDisplay.appendChild(pill);
  });
}

function addTag(raw) {
  const tag = raw.toLowerCase().trim().replace(/[^a-z0-9-_]/g,'');
  if (!tag) return;
  const note = getActive();
  if (!note || note.tags.includes(tag)) return;
  note.tags.push(tag);
  updateNote(note.id, { tags: note.tags });
  renderEditorTags(note.tags);
  renderSidebar();
  renderList();
}

function removeTag(tag) {
  const note = getActive();
  if (!note) return;
  note.tags = note.tags.filter(t => t !== tag);
  updateNote(note.id, { tags: note.tags });
  renderEditorTags(note.tags);
  renderSidebar();
  renderList();
}

// ============================================================
// AUTO-SAVE
// ============================================================

let saveTimer = null;
let hideTimer = null;

function scheduleSave() {
  showSaving();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const note = getActive();
    if (!note) return;
    updateNote(note.id, { title: dom.noteTitleInput.value, content: dom.richEditor.innerHTML });
    renderList();
    updateMeta(note);
    showSaved();
  }, 600);
}

function showSaving() {
  const el = dom.autoSave;
  el.classList.remove('hidden');
  el.classList.add('saving');
  el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg> Saving…`;
}

function showSaved() {
  const el = dom.autoSave;
  el.classList.remove('saving');
  el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> Saved`;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ============================================================
// FORMATTING
// ============================================================

function fmt(cmd, val = null) {
  dom.richEditor.focus();
  document.execCommand(cmd, false, val);
  dom.richEditor.dispatchEvent(new Event('input'));
}

// ============================================================
// VIEW MODE
// ============================================================

function applyViewMode() {
  dom.notesContainer.classList.toggle('grid-view', state.viewMode === 'grid');
  dom.notesContainer.classList.toggle('list-view',  state.viewMode === 'list');
  if (state.viewMode === 'grid') {
    dom.viewIcon.innerHTML = `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`;
    dom.btnToggleView.title = 'Switch to list view';
  } else {
    dom.viewIcon.innerHTML = `<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`;
    dom.btnToggleView.title = 'Switch to grid view';
  }
}

// ============================================================
// TOASTS
// ============================================================

const ICONS = {
  success: `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  info:    `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function toast(msg, type = 'info', ms = 2800) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${ICONS[type]||ICONS.info}<span>${esc(msg)}</span>`;
  dom.toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add('exiting');
    t.addEventListener('animationend', () => t.remove());
  }, ms);
}

// ============================================================
// DELETE MODAL
// ============================================================

let pendingDelete = null;

function openDeleteModal(id) {
  pendingDelete = id;
  dom.deleteModal.removeAttribute('hidden');
  dom.btnConfirm.focus();
}

function closeDeleteModal() {
  dom.deleteModal.setAttribute('hidden', '');
  pendingDelete = null;
}

// ============================================================
// EVENTS
// ============================================================

function bindEvents() {
  // New note
  [dom.btnNewNote, dom.btnEmptyCta].forEach(b => b?.addEventListener('click', () => {
    const note = createNote();
    renderSidebar();
    renderList();
    openNote(note.id);
    dom.noteTitleInput.focus();
  }));

  // Search
  dom.searchInput.addEventListener('input', () => {
    state.searchQuery = dom.searchInput.value.trim();
    renderList();
    updatePanelTitle();
  });

  // Tag: All
  dom.tagFilterList.querySelector('[data-tag="all"]')?.addEventListener('click', () => {
    state.activeTag = 'all';
    refreshTagActive();
    renderList();
    updatePanelTitle();
  });

  // Sort
  dom.sortBtns.forEach(b => b.addEventListener('click', () => {
    state.sortBy = b.getAttribute('data-sort');
    dom.sortBtns.forEach(x => x.classList.toggle('active', x === b));
    renderList();
    save();
  }));

  // View toggle
  dom.btnToggleView.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    applyViewMode();
    renderList();
    save();
  });

  // Sidebar toggle
  dom.btnSidebarToggle.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    dom.appShell.classList.toggle('sidebar-hidden', !state.sidebarOpen);
    save();
  });

  // Theme toggle
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Title
  dom.noteTitleInput.addEventListener('input', () => { scheduleSave(); updateWordCount(); });

  // Rich editor
  dom.richEditor.addEventListener('input', () => { scheduleSave(); updateWordCount(); });

  // Tags input
  dom.tagsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(dom.tagsInput.value); dom.tagsInput.value = ''; }
    if (e.key === 'Backspace' && !dom.tagsInput.value) {
      const note = getActive();
      if (note?.tags.length) removeTag(note.tags[note.tags.length-1]);
    }
  });
  dom.tagsInput.addEventListener('blur', () => { if (dom.tagsInput.value.trim()) { addTag(dom.tagsInput.value.trim()); dom.tagsInput.value = ''; } });

  // Color picker
  dom.colorPicker.addEventListener('click', e => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    const color = dot.getAttribute('data-color');
    const note = getActive();
    if (!note) return;
    updateNote(note.id, { color });
    dom.colorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d === dot));
    renderList();
  });

  // Format buttons
  $('fmt-bold').addEventListener('click',      () => fmt('bold'));
  $('fmt-italic').addEventListener('click',    () => fmt('italic'));
  $('fmt-underline').addEventListener('click', () => fmt('underline'));
  $('fmt-h1').addEventListener('click',        () => fmt('formatBlock','<h1>'));
  $('fmt-h2').addEventListener('click',        () => fmt('formatBlock','<h2>'));
  $('fmt-ul').addEventListener('click',        () => fmt('insertUnorderedList'));
  $('fmt-ol').addEventListener('click',        () => fmt('insertOrderedList'));

  // Pin
  dom.btnPin.addEventListener('click', () => {
    const note = getActive();
    if (!note) return;
    const p = !note.pinned;
    updateNote(note.id, { pinned: p });
    updatePinBtn(p);
    renderList();
    toast(p ? 'Note pinned' : 'Note unpinned', 'success');
  });

  // Delete
  dom.btnDelete.addEventListener('click', () => { if (state.activeNoteId) openDeleteModal(state.activeNoteId); });
  dom.btnCancel.addEventListener('click', closeDeleteModal);
  dom.btnConfirm.addEventListener('click', () => {
    if (pendingDelete) {
      deleteNote(pendingDelete);
      closeDeleteModal();
      closeEditor();
      renderSidebar();
      renderList();
      toast('Note deleted', 'info');
    }
  });
  dom.deleteModal.addEventListener('click', e => { if (e.target === dom.deleteModal) closeDeleteModal(); });

  // Close editor
  dom.btnCloseEditor.addEventListener('click', closeEditor);

  // Paste as plain text
  dom.richEditor.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'n' && !e.shiftKey) {
      e.preventDefault();
      const note = createNote();
      renderSidebar(); renderList(); openNote(note.id);
      dom.noteTitleInput.focus();
    }

    if (ctrl && e.key === 'k') {
      e.preventDefault();
      dom.searchInput.focus(); dom.searchInput.select();
    }

    if (ctrl && e.key === 's') {
      e.preventDefault();
      clearTimeout(saveTimer);
      const note = getActive();
      if (note) {
        updateNote(note.id, { title: dom.noteTitleInput.value, content: dom.richEditor.innerHTML });
        showSaved();
        toast('Saved', 'success');
      }
    }

    if (e.key === 'Escape') {
      if (!dom.deleteModal.hasAttribute('hidden')) closeDeleteModal();
    }
  });

  // Tick timestamps every minute
  setInterval(() => {
    dom.notesContainer.querySelectorAll('[data-id]').forEach(card => {
      const note = state.notes.find(n => n.id === card.getAttribute('data-id'));
      if (note) { const el = card.querySelector('.note-card-date'); if (el) el.textContent = relativeTime(note.modifiedAt); }
    });
    const note = getActive();
    if (note) updateMeta(note);
  }, 60_000);
}

// ============================================================
// INIT
// ============================================================

function init() {
  load();

  // Apply theme
  applyTheme(state.theme);

  // Apply sidebar
  if (!state.sidebarOpen) dom.appShell.classList.add('sidebar-hidden');

  // Apply sort buttons
  dom.sortBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-sort') === state.sortBy));

  applyViewMode();
  renderSidebar();
  renderList();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
