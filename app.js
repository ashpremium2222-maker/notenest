'use strict';

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://nhuiqqjdjmjqrdwsxfia.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5odWlxcWpkam1qcXJkd3N4ZmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDgzNjgsImV4cCI6MjEwMDIyNDM2OH0.9gj4Zcc1QUeS3q7n0BKWslVR-c0Wr3ZqbQMJ3K0kHnY';

// Create Supabase client safely — CDN might not have loaded yet
let supabaseClient = null;
let supabaseReady = false;

try {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    supabaseReady = true;
  }
} catch (e) {
  console.warn('Supabase client failed to initialize:', e);
}

// ============================================================
// STORAGE KEYS (settings only — notes go to Supabase)
// ============================================================
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
  user:         null,
  session:      null,
  loading:      true,
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
    .replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
}

function highlight(text, q) {
  if (!q) return esc(text);
  const s = esc(text);
  const p = esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return s.replace(new RegExp(p, 'gi'), m => `<mark>${m}</mark>`);
}

// ============================================================
// SETTINGS PERSISTENCE (localStorage — UI preferences only)
// ============================================================

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      viewMode:    state.viewMode,
      sortBy:      state.sortBy,
      sidebarOpen: state.sidebarOpen,
      theme:       state.theme,
    }));
  } catch (e) { /* ignore */ }
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    state.viewMode    = s.viewMode    || 'grid';
    state.sortBy      = s.sortBy      || 'modified';
    state.sidebarOpen  = s.sidebarOpen !== false;
    state.theme       = s.theme       || 'light';
  } catch (e) { /* ignore */ }
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================

function getUsernameFromEmail(email) {
  if (!email) return '';
  return email.split('@')[0];
}

function checkSupabaseReady() {
  if (!supabaseReady || !supabaseClient) {
    throw new Error('Supabase is not connected. Please check your internet connection and refresh the page.');
  }
}

async function signUp(email, password) {
  checkSupabaseReady();
  const username = getUsernameFromEmail(email);
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  checkSupabaseReady();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  checkSupabaseReady();
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

function getUserDisplayName() {
  const meta = state.user?.user_metadata;
  return meta?.username || getUsernameFromEmail(state.user?.email || '') || 'user';
}

// ============================================================
// SUPABASE NOTES CRUD
// ============================================================

async function loadNotes() {
  if (!state.user) return;
  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .order('modified_at', { ascending: false });

  if (error) {
    console.error('Failed to load notes:', error);
    toast('Failed to load notes', 'error');
    return;
  }

  // Map Supabase fields to our app format
  state.notes = (data || []).map(n => ({
    id:         n.id,
    title:      n.title || '',
    content:    n.content || '',
    tags:       n.tags || [],
    color:      n.color || 'default',
    pinned:     n.pinned || false,
    createdAt:  n.created_at,
    modifiedAt: n.modified_at,
  }));
}

async function createNote() {
  if (!state.user) return null;
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

  const { error } = await supabaseClient.from('notes').insert({
    id:          note.id,
    user_id:     state.user.id,
    title:       note.title,
    content:     note.content,
    tags:        note.tags,
    color:       note.color,
    pinned:      note.pinned,
    created_at:  note.createdAt,
    modified_at: note.modifiedAt,
  });

  if (error) {
    console.error('Failed to create note:', error);
    toast('Failed to create note', 'error');
    return null;
  }

  state.notes.unshift(note);
  return note;
}

async function deleteNote(id) {
  if (!state.user) return;
  const { error } = await supabaseClient.from('notes').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete note:', error);
    toast('Failed to delete note', 'error');
    return;
  }

  state.notes = state.notes.filter(n => n.id !== id);
  if (state.activeNoteId === id) state.activeNoteId = null;
}

async function updateNote(id, fields) {
  if (!state.user) return;
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  Object.assign(note, fields, { modifiedAt: now() });

  // Map to Supabase column names
  const supabaseFields = {};
  if ('title' in fields) supabaseFields.title = fields.title;
  if ('content' in fields) supabaseFields.content = fields.content;
  if ('tags' in fields) supabaseFields.tags = fields.tags;
  if ('color' in fields) supabaseFields.color = fields.color;
  if ('pinned' in fields) supabaseFields.pinned = fields.pinned;
  supabaseFields.modified_at = now();

  const { error } = await supabaseClient.from('notes').update(supabaseFields).eq('id', id);

  if (error) {
    console.error('Failed to update note:', error);
    toast('Failed to save changes', 'error');
  }
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
  appShell:         document.querySelector('.app-shell'),
  htmlEl:           document.documentElement,
  loadingScreen:    $('loading-screen'),
  authPage:         $('auth-page'),
  loginForm:        $('login-form'),
  signupForm:       $('signup-form'),
  loginEmail:    $('login-email'),
  loginPassword:    $('login-password'),
  loginBtn:         $('login-btn'),
  loginError:       $('login-error'),
  signupEmail:   $('signup-email'),
  signupPassword:   $('signup-password'),
  signupBtn:        $('signup-btn'),
  signupError:      $('signup-error'),
  authToggleLink:   $('auth-toggle-link'),
  authToggleText:   $('auth-toggle-text'),
  sidebarUser:      $('sidebar-user'),
  sidebarUsername:  $('sidebar-username'),
  sidebarOverlay:   $('sidebar-overlay'),
  btnLogout:        $('btn-logout'),
  searchInput:      $('search-input'),
  btnNewNote:       $('btn-new-note'),
  btnEmptyCta:      $('btn-empty-cta'),
  tagFilterList:    $('tag-filter-list'),
  sortBtns:         document.querySelectorAll('.sort-btn'),
  statNotes:        $('stat-notes'),
  statTags:         $('stat-tags'),
  statWords:        $('stat-words'),
  notesContainer:   $('notes-container'),
  emptyState:       $('empty-state'),
  panelTitle:       $('panel-title'),
  btnToggleView:    $('btn-toggle-view'),
  viewIcon:         $('view-icon'),
  btnSidebarToggle: $('btn-sidebar-toggle'),
  themeToggle:      $('theme-toggle'),
  themeLabel:       $('theme-label'),
  editorWelcome:    $('editor-welcome'),
  editorContent:    $('editor-content-area'),
  noteTitleInput:   $('note-title-input'),
  tagsDisplay:      $('tags-display'),
  tagsInput:        $('tags-input'),
  colorPicker:      $('note-color-picker'),
  richEditor:       $('rich-editor'),
  wordCount:        $('word-count'),
  editorMeta:       $('editor-meta'),
  autoSave:         $('auto-save-indicator'),
  btnPin:           $('btn-pin'),
  btnDelete:        $('btn-delete'),
  btnCloseEditor:   $('btn-close-editor'),
  toastContainer:   $('toast-container'),
  deleteModal:      $('delete-modal'),
  btnCancel:        $('btn-modal-cancel'),
  btnConfirm:       $('btn-modal-confirm'),
};

// ============================================================
// AUTH UI
// ============================================================

function showAuthScreen() {
  dom.authPage.removeAttribute('hidden');
  dom.appShell.setAttribute('hidden', '');
  dom.loadingScreen.setAttribute('hidden', '');
  resetAuthForms();
}

function showAppScreen() {
  dom.authPage.setAttribute('hidden', '');
  dom.appShell.removeAttribute('hidden');
  dom.loadingScreen.setAttribute('hidden', '');
  // Update sidebar username
  dom.sidebarUsername.textContent = getUserDisplayName();
}

function showLoading() {
  dom.loadingScreen.removeAttribute('hidden');
  dom.authPage.setAttribute('hidden', '');
  dom.appShell.setAttribute('hidden', '');
}

function resetAuthForms() {
  dom.loginEmail.value = '';
  dom.loginPassword.value = '';
  dom.signupEmail.value = '';
  dom.signupPassword.value = '';
  dom.loginError.setAttribute('hidden', '');
  dom.signupError.setAttribute('hidden', '');
  showLoginForm();
}

function showLoginForm() {
  dom.loginForm.removeAttribute('hidden');
  dom.signupForm.setAttribute('hidden', '');
  dom.authToggleText.innerHTML = `Don't have an account? <a href="#" id="auth-toggle-link" class="auth-toggle-link">Sign up</a>`;
  dom.authToggleLink = document.getElementById('auth-toggle-link');
  dom.authToggleLink?.addEventListener('click', e => { e.preventDefault(); showSignupForm(); });
}

function showSignupForm() {
  dom.loginForm.setAttribute('hidden', '');
  dom.signupForm.removeAttribute('hidden');
  dom.authToggleText.innerHTML = `Already have an account? <a href="#" id="auth-toggle-link" class="auth-toggle-link">Sign in</a>`;
  dom.authToggleLink = document.getElementById('auth-toggle-link');
  dom.authToggleLink?.addEventListener('click', e => { e.preventDefault(); showLoginForm(); });
}

function setBtnLoading(btn, loading) {
  const text = btn.querySelector('.auth-btn-text');
  const loader = btn.querySelector('.auth-btn-loader');
  btn.disabled = loading;
  if (text) text.hidden = loading;
  if (loader) loader.hidden = !loading;
}

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
  saveSettings();
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
      if (window.innerWidth <= 768) dom.appShell.classList.remove('mobile-sidebar-open');
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
  dom.appShell.classList.add('mobile-editor-open');

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
  dom.appShell.classList.remove('mobile-editor-open');
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
  // -- AUTH EVENTS --

  // Login form submit
  dom.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = dom.loginEmail.value.trim();
    const password = dom.loginPassword.value;
    if (!username || !password) return;

    setBtnLoading(dom.loginBtn, true);
    dom.loginError.setAttribute('hidden', '');

    try {
      await signIn(username, password);
      // Auth listener will handle the rest
    } catch (err) {
      dom.loginError.textContent = err.message || 'Invalid email or password.';
      dom.loginError.removeAttribute('hidden');
      setBtnLoading(dom.loginBtn, false);
    }
  });

  // Signup form submit
  dom.signupForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = dom.signupEmail.value.trim();
    const password = dom.signupPassword.value;
    if (!username || !password) return;

    setBtnLoading(dom.signupBtn, true);
    dom.signupError.setAttribute('hidden', '');

    try {
      await signUp(username, password);
      // Auth listener will handle the rest
      toast('Account created! Welcome to NoteNest 🎉', 'success');
    } catch (err) {
      dom.signupError.textContent = err.message || 'Could not create account.';
      dom.signupError.removeAttribute('hidden');
      setBtnLoading(dom.signupBtn, false);
    }
  });

  // Logout
  dom.btnLogout.addEventListener('click', async () => {
    try {
      await signOut();
      toast('Signed out', 'info');
    } catch (err) {
      toast('Failed to sign out', 'error');
    }
  });

  // Enter key on login/signup inputs
  ['login-email', 'login-password', 'signup-email', 'signup-password'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const form = el.closest('form');
        if (form) form.dispatchEvent(new Event('submit'));
      }
    });
  });

  // -- APP EVENTS --

  // New note
  [dom.btnNewNote, dom.btnEmptyCta].forEach(b => b?.addEventListener('click', async () => {
    if (window.innerWidth <= 768) dom.appShell.classList.remove('mobile-sidebar-open');
    const note = await createNote();
    if (!note) return;
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
    saveSettings();
  }));

  // View toggle
  dom.btnToggleView.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    applyViewMode();
    renderList();
    saveSettings();
  });

  // Sidebar toggle
  dom.btnSidebarToggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      dom.appShell.classList.add('mobile-sidebar-open');
    } else {
      state.sidebarOpen = !state.sidebarOpen;
      dom.appShell.classList.toggle('sidebar-hidden', !state.sidebarOpen);
      saveSettings();
    }
  });

  if (dom.sidebarOverlay) {
    dom.sidebarOverlay.addEventListener('click', () => {
      dom.appShell.classList.remove('mobile-sidebar-open');
    });
  }

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
  dom.btnConfirm.addEventListener('click', async () => {
    if (pendingDelete) {
      await deleteNote(pendingDelete);
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
      createNote().then(note => {
        if (!note) return;
        renderSidebar(); renderList(); openNote(note.id);
        dom.noteTitleInput.focus();
      });
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

function showUI() {
  // Apply theme
  applyTheme(state.theme);

  // Apply sidebar
  if (!state.sidebarOpen) dom.appShell.classList.add('sidebar-hidden');

  // Apply sort buttons
  dom.sortBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-sort') === state.sortBy));

  applyViewMode();
  renderSidebar();
  renderList();
}

// ============================================================
// SELF-CONTAINED DOM — creates auth/loading elements if HTML is old
// ============================================================

// Ensure CSS keyframe for spinner animation exists
(function injectSpinnerKeyframe() {
  if (!document.getElementById('nb-spinner-keyframe')) {
    const s = document.createElement('style');
    s.id = 'nb-spinner-keyframe';
    s.textContent = '@keyframes nb-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}());

function ensureCriticalElements() {
  // Loading screen
  if (!dom.loadingScreen) {
    const el = document.createElement('div');
    el.id = 'loading-screen';
    el.className = 'loading-screen';
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;position:fixed;inset:0;background:#f0f4ff;z-index:9999;font-family:Inter,sans-serif';
    el.innerHTML = '<img src="logo.jpg" alt="NoteNest" style="width:56px;height:56px;border-radius:14px;margin-bottom:20px"/><div style="width:32px;height:32px;border:3px solid #e0e7ff;border-top-color:#4a8af4;border-radius:50%;animation:nb-spin .8s linear infinite"></div><p style="color:#6b7280;margin-top:16px;font-size:14px">Loading NoteNest&hellip;</p>';
    document.body.prepend(el);
    dom.loadingScreen = el;
  }

  // Auth page
  if (!dom.authPage) {
    const el = document.createElement('div');
    el.id = 'auth-page';
    el.className = 'auth-page';
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4ff;padding:20px;font-family:Inter,sans-serif';
    el.innerHTML = [
      '<div class="auth-card" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(74,138,244,0.12);padding:40px 36px;width:100%;max-width:380px;text-align:center">',
      '  <div class="auth-header">',
      '    <img src="logo.jpg" alt="NoteNest" style="width:48px;height:48px;border-radius:12px;margin-bottom:12px"/>',
      '    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 4px;font-family:Outfit,sans-serif">NoteNest</h1>',
      '    <p style="color:#6b7280;font-size:14px;margin:0 0 28px">Capture. Organize. Remember.</p>',
      '  </div>',
      '  <form class="auth-form" id="login-form" style="text-align:left">',
      '    <div style="margin-bottom:16px">',
      '      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px" for="login-email">Email</label>',
      '      <input type="text" id="login-email" placeholder="Enter your email" type="email" style="width:100%;padding:10px 14px;border:1px solid #e5eaf5;border-radius:8px;font-size:14px;background:#f8faff;outline:none;box-sizing:border-box" required/>',
      '    </div>',
      '    <div style="margin-bottom:20px">',
      '      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px" for="login-password">Password</label>',
      '      <input type="password" id="login-password" placeholder="Enter your password" style="width:100%;padding:10px 14px;border:1px solid #e5eaf5;border-radius:8px;font-size:14px;background:#f8faff;outline:none;box-sizing:border-box" required/>',
      '    </div>',
      '    <button type="submit" id="login-btn" style="width:100%;padding:11px;background:#4a8af4;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Sign In</button>',
      '    <p class="auth-error" id="login-error" hidden style="color:#ef4444;font-size:13px;margin-top:12px"></p>',
      '  </form>',
      '  <form class="auth-form" id="signup-form" hidden style="text-align:left">',
      '    <div style="margin-bottom:16px">',
      '      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px" for="signup-email">Email</label>',
      '      <input type="text" id="signup-email" placeholder="Enter your email address" type="email" style="width:100%;padding:10px 14px;border:1px solid #e5eaf5;border-radius:8px;font-size:14px;background:#f8faff;outline:none;box-sizing:border-box" required minlength="3"/>',
      '    </div>',
      '    <div style="margin-bottom:20px">',
      '      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px" for="signup-password">Password</label>',
      '      <input type="password" id="signup-password" placeholder="Choose a password (6+ chars)" style="width:100%;padding:10px 14px;border:1px solid #e5eaf5;border-radius:8px;font-size:14px;background:#f8faff;outline:none;box-sizing:border-box" required minlength="6"/>',
      '    </div>',
      '    <button type="submit" id="signup-btn" style="width:100%;padding:11px;background:#4a8af4;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Create Account</button>',
      '    <p class="auth-error" id="signup-error" hidden style="color:#ef4444;font-size:13px;margin-top:12px"></p>',
      '  </form>',
      '  <div class="auth-toggle" style="margin-top:20px">',
      '    <p class="auth-toggle-text" id="auth-toggle-text" style="font-size:13px;color:#6b7280">Don\'t have an account? <a href="#" id="auth-toggle-link" class="auth-toggle-link" style="color:#4a8af4;text-decoration:none;font-weight:500">Sign up</a></p>',
      '  </div>',
      '</div>'
    ].join('\n');
    document.body.prepend(el);
    dom.authPage = el;
  }

  // Toast container
  if (!dom.toastContainer) {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    dom.toastContainer = el;
  }

  // Refresh DOM refs for auth elements that were created
  dom.loginForm = dom.loginForm || $('login-form');
  dom.signupForm = dom.signupForm || $('signup-form');
  dom.loginEmail = dom.loginEmail || $('login-email');
  dom.loginPassword = dom.loginPassword || $('login-password');
  dom.loginBtn = dom.loginBtn || $('login-btn');
  dom.loginError = dom.loginError || $('login-error');
  dom.signupEmail = dom.signupEmail || $('signup-email');
  dom.signupPassword = dom.signupPassword || $('signup-password');
  dom.signupBtn = dom.signupBtn || $('signup-btn');
  dom.signupError = dom.signupError || $('signup-error');
  dom.authToggleLink = dom.authToggleLink || $('auth-toggle-link');
  dom.authToggleText = dom.authToggleText || $('auth-toggle-text');
}

// Emergency timeout: if loading takes >10s, show auth page
const LOADING_TIMEOUT_MS = 10000;

async function init() {
  try {
    // Ensure all critical DOM elements exist (creates them if HTML is old)
    ensureCriticalElements();

    showLoading();

    // Emergency timeout that fires if init gets stuck
    const safetyTimer = setTimeout(() => {
      if (state.loading) {
        state.loading = false;
        killLoadingScreen();
      }
    }, LOADING_TIMEOUT_MS);

    // Load settings from localStorage
    loadSettings();

    // Bind events (they'll work once logged in)
    bindEvents();

    if (!supabaseReady || !supabaseClient) {
      clearTimeout(safetyTimer);
      state.loading = false;
      toast('Could not connect to server. Please check your connection and refresh.', 'error', 5000);
      showAuthScreen();
      return;
    }

    // Check existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    clearTimeout(safetyTimer);

    if (session) {
      state.user = session.user;
      state.session = session;
      await loadNotes();
      state.loading = false;
      showAppScreen();
      showUI();
    } else {
      state.loading = false;
      showAuthScreen();
    }

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        state.user = session.user;
        state.session = session;
        await loadNotes();
        showAppScreen();
        showUI();
      } else if (event === 'SIGNED_OUT') {
        state.user = null;
        state.session = null;
        state.notes = [];
        state.activeNoteId = null;
        closeEditor();
        showAuthScreen();
      } else if (event === 'TOKEN_REFRESHED') {
        state.session = session;
      }
    });
  } catch (err) {
    state.loading = false;
    console.error('Init error:', err);
    killLoadingScreen();
  }
}

function killLoadingScreen() {
  try {
    toast('Something went wrong. Refreshing…', 'error', 4000);
    showAuthScreen();
  } catch (e) {
    // Ultimate fallback — use raw DOM
    try {
      var el = document.getElementById('loading-screen');
      if (el) el.style.display = 'none';
      el = document.getElementById('auth-page');
      if (el) { el.style.display = ''; el.removeAttribute('hidden'); return; }
    } catch (_) {}
    // Nuclear option: rewrite the page
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;padding:20px;text-align:center"><div><img src="logo.jpg" style="width:56px;height:56px;border-radius:14px;margin-bottom:14px"/><h1 style="font-size:22px;margin-bottom:8px;color:#111">NoteNest</h1><p style="color:#666;margin-bottom:16px">Could not load the app.</p><button onclick="location.reload()" style="padding:10px 24px;background:#4a8af4;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">Retry</button></div>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
