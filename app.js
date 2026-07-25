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
  activeSection: 'all',
  sortBy:       'modified',
  viewMode:     'grid',
  sidebarOpen:  true,
  theme:        'light',
  user:         null,
  session:      null,
  loading:      true,
};

// ============================================================
// INDEXEDDB OFFLINE CACHE
// ============================================================
const idb = {
  db: null,
  init: () => new Promise((resolve, reject) => {
    const req = indexedDB.open('notenest_db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = (e) => { idb.db = e.target.result; resolve(); };
    req.onerror = () => reject(req.error);
  }),
  saveNotes: (notes) => new Promise((resolve) => {
    if (!idb.db) return resolve();
    const tx = idb.db.transaction('notes', 'readwrite');
    notes.forEach(n => tx.objectStore('notes').put(n));
    tx.oncomplete = () => resolve();
  }),
  getNotes: () => new Promise((resolve) => {
    if (!idb.db) return resolve([]);
    const tx = idb.db.transaction('notes', 'readonly');
    const req = tx.objectStore('notes').getAll();
    req.onsuccess = () => resolve(req.result);
  }),
  queueEdit: (action, payload) => new Promise((resolve) => {
    if (!idb.db) return resolve();
    const tx = idb.db.transaction('queue', 'readwrite');
    tx.objectStore('queue').put({ action, payload, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
  }),
  getQueue: () => new Promise((resolve) => {
    if (!idb.db) return resolve([]);
    const tx = idb.db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () => resolve(req.result);
  }),
  clearQueue: () => new Promise((resolve) => {
    if (!idb.db) return resolve();
    const tx = idb.db.transaction('queue', 'readwrite');
    tx.objectStore('queue').clear();
    tx.oncomplete = () => resolve();
  })
};

// Start idb
idb.init().catch(e => console.warn('IDB init failed', e));

async function syncOfflineQueue() {
  if (!navigator.onLine) return;
  const queue = await idb.getQueue();
  if (!queue.length) return;
  console.log('Syncing offline queue...', queue.length);
  for (const item of queue) {
    if (item.action === 'UPDATE_NOTE') {
      const { id, fields } = item.payload;
      await supabaseClient.from('notes').update(fields).eq('id', id);
    }
  }
  await idb.clearQueue();
  toast('Offline edits synced', 'success');
}

window.addEventListener('online', syncOfflineQueue);

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

function autoTitle(note) {
  const text = stripHtml(note.content).trim();
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > 50) return firstLine.slice(0, 50) + '...';
  return firstLine;
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
// MOBILE SIDEBAR
// ============================================================

function closeMobileSidebar() {
  dom.appShell.classList.remove('mobile-sidebar-open');
}

// ============================================================
// SUPABASE NOTES CRUD
// ============================================================

async function loadNotes() {
  if (!state.user) return;
  
  if (!navigator.onLine) {
    state.notes = await idb.getNotes();
    toast('Offline mode: Using cached notes', 'info');
    return;
  }

  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .order('modified_at', { ascending: false });

  if (error) {
    console.error('Failed to load notes:', error);
    state.notes = await idb.getNotes();
    toast('Loaded cached notes', 'info');
    return;
  }

  // Map Supabase fields to our app format
  state.notes = (data || []).map(n => ({
    id:           n.id,
    title:        n.title || '',
    content:      n.content || '',
    tags:         n.tags || [],
    color:        n.color || 'default',
    pinned:       n.pinned || false,
    favorited:    n.favorited || false,
    archived:     n.archived || false,
    lastOpenedAt: n.last_opened_at || n.modified_at || n.created_at,
    createdAt:    n.created_at,
    modifiedAt:   n.modified_at,
    isDraft:      false
  }));
  
  // Cache to IDB
  idb.saveNotes(state.notes);
}

async function createNote() {
  if (!state.user) return null;
  const note = {
    id:           genId(),
    title:        '',
    content:      '',
    tags:         [],
    color:        'default',
    pinned:       false,
    favorited:    false,
    archived:     false,
    createdAt:    now(),
    modifiedAt:   now(),
    lastOpenedAt: now(),
    isDraft:      true
  };

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

  if (!navigator.onLine) {
    await idb.queueEdit('UPDATE_NOTE', { id, fields: supabaseFields });
    toast('Saved offline', 'info');
    return;
  }

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
  
  if (state.activeSection === 'all') {
    notes = notes.filter(n => !n.archived);
  } else if (state.activeSection === 'favorites') {
    notes = notes.filter(n => n.favorited && !n.archived);
  } else if (state.activeSection === 'archived') {
    notes = notes.filter(n => n.archived);
  } else if (state.activeSection === 'recent') {
    notes = notes.filter(n => !n.archived);
    notes.sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt));
  } else if (state.activeSection === 'shared') {
    notes = notes.filter(n => n.isShared);
  }

  if (state.activeTag !== 'all') notes = notes.filter(n => n.tags.includes(state.activeTag));
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      stripHtml(n.content).toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  if (state.activeSection !== 'recent') {
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.sortBy === 'title')   return a.title.localeCompare(b.title);
      if (state.sortBy === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });
  }
  return notes;
}

async function toggleFavorite(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  const p = !note.favorited;
  note.favorited = p;
  await supabaseClient.from('notes').update({ favorited: p }).eq('id', id);
  renderList();
  if (state.activeNoteId === id) updateFavoriteBtn(p);
}

async function toggleArchive(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  const p = !note.archived;
  note.archived = p;
  await supabaseClient.from('notes').update({ archived: p }).eq('id', id);
  if (p && state.activeNoteId === id) closeEditor();
  renderList();
  if (!p && state.activeNoteId === id) updateArchiveBtn(p);
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
  btnHamburger:     $('btn-hamburger'),
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
  btnFavorite:      $('btn-favorite'),
  btnArchive:       $('btn-archive'),
  btnDelete:        $('btn-delete'),
  btnCloseEditor:   $('btn-close-editor'),
  btnCloseDelete:   $('btn-close-delete'),
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
  // Update sidebar usernames
  dom.sidebarUsername.textContent = getUserDisplayName();
  const mobileUser = document.getElementById('mobile-sidebar-username');
  if (mobileUser) mobileUser.textContent = getUserDisplayName();
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
  if (dom.themeLabel) dom.themeLabel.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
  // Update mobile sidebar theme label
  const mobileLabel = document.getElementById('mobile-theme-label');
  if (mobileLabel) mobileLabel.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
  // Update theme-color meta for mobile browser chrome
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', t === 'dark' ? '#080810' : '#e8edf8');
  // Update status bar style for iOS
  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (metaStatusBar) metaStatusBar.setAttribute('content', t === 'dark' ? 'black-translucent' : 'default');
}

function getSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
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
    } else if (state.activeSection === 'favorites') {
      title.textContent = 'No favorites yet';
      sub.textContent   = 'Star notes to keep them here.';
      cta.style.display = 'none';
    } else if (state.activeSection === 'archived') {
      title.textContent = 'No archived notes';
      sub.textContent   = 'Archived notes will appear here.';
      cta.style.display = 'none';
    } else if (state.activeSection === 'shared') {
      title.textContent = 'No shared notes';
      sub.textContent   = 'Notes you share with others will appear here.';
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

  const title   = note.title || autoTitle(note) || 'New note';
  const preview = stripHtml(note.content).trim() || 'No content';
   const chk = note.checklist && note.checklist.items ? note.checklist.items : [];
   const totalChk = chk.length;
   const compChk = chk.filter(x=>x.completed).length;
   const chkStr = totalChk > 0 ? `<div class="card-checklist-progress" style="font-size:11px;margin-top:4px;color:var(--primary-color)">${compChk}/${totalChk} </div>` : '';
  
  const q       = state.searchQuery;

  card.innerHTML = `
    <div class="note-card-header">
      <div class="note-card-title">${highlight(title, q)}</div>
      ${note.favorited ? '<div class="note-card-favorite" title="Favorited"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>' : ''}
      ${note.archived ? '<div class="note-card-archive" title="Archived"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg></div>' : ''}
      <div class="note-card-pin" title="Pinned">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="m12 17-1-9 9 1-2 3 3 3-3 3-3-3-3 2z"/></svg>
      </div>
    </div>
    <div class="note-card-preview">${highlight(preview.slice(0,150), q)}${chkStr}</div>
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
  else {
    const titles = {
      'all': 'All Notes',
      'favorites': 'Favorites',
      'archived': 'Archive',
      'recent': 'Recent',
      'shared': 'Shared'
    };
    dom.panelTitle.textContent = titles[state.activeSection] || 'All Notes';
  }
}

// ============================================================
// EDITOR
// ============================================================

function openNote(id) {
  state.activeNoteId = id;
  const note = getActive();
  if (!note) return;
  
  if (!note.isDraft) {
    note.lastOpenedAt = now();
    supabaseClient.from('notes').update({ last_opened_at: note.lastOpenedAt }).eq('id', id);
  }

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
  updateFavoriteBtn(note.favorited);
  updateArchiveBtn(note.archived);
  updateWordCount();
  updateMeta(note);

  dom.notesContainer.querySelectorAll('.note-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('data-id') === id);
  });
}

function closeEditor() {
  const note = getActive();
  if (note && note.isDraft) {
    // Sync latest input values before checking emptiness
    const title = dom.noteTitleInput.value;
    const content = dom.richEditor.innerHTML;
    if (!noteHasData(title, content)) {
      state.notes = state.notes.filter(n => n.id !== note.id);
      renderList();
    }
  }

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

function updateFavoriteBtn(favorited) {
  if (!dom.btnFavorite) return;
  dom.btnFavorite.classList.toggle('favorited', favorited);
  dom.btnFavorite.title = favorited ? 'Remove from favorites' : 'Add to favorites';
  dom.btnFavorite.innerHTML = favorited 
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
}

function updateArchiveBtn(archived) {
  if (!dom.btnArchive) return;
  dom.btnArchive.classList.toggle('archived', archived);
  dom.btnArchive.title = archived ? 'Unarchive note' : 'Archive note';
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
// HELPER: check if a note has meaningful content
// ============================================================

function noteHasData(title, contentHtml) {
  if (title && title.trim()) return true;
  const text = stripHtml(contentHtml).trim();
  if (text) return true;
  return false;
}

// ============================================================
// AUTO-SAVE
// ============================================================

let saveTimer = null;
let hideTimer = null;

function scheduleSave() {
  showSaving();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const note = getActive();
    if (!note) return;
    
    const rawTitle = dom.noteTitleInput.value;
    const rawContent = dom.richEditor.innerHTML;
    
    // Don't save if both title and content are empty
    if (!noteHasData(rawTitle, rawContent)) {
      dom.autoSave.classList.add('hidden');
      return;
    }
    
    note.title = rawTitle;
    note.content = rawContent;
    
    if (note.isDraft) {
      // First save for draft — insert to Supabase
      note.isDraft = false;
      const { error } = await supabaseClient.from('notes').insert({
        id:          note.id,
        user_id:     state.user.id,
        title:       note.title,
        content:     note.content,
        tags:        note.tags,
        color:       note.color,
        pinned:      note.pinned,
        favorited:   note.favorited,
        archived:    note.archived,
        created_at:  note.createdAt,
        modified_at: note.modifiedAt,
        last_opened_at: note.lastOpenedAt
      });
      if (error) console.error('Error inserting draft:', error);
    } else {
      // Existing note — update
      updateNote(note.id, { title: note.title, content: note.content });
    }
    
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
      // Auth listener will handle showing app screen
    } catch (err) {
      dom.loginError.textContent = err.message || 'Invalid email or password.';
      dom.loginError.removeAttribute('hidden');
    } finally {
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
      toast('Account created! Welcome to NoteNest ��', 'success');
    } catch (err) {
      dom.signupError.textContent = err.message || 'Could not create account.';
      dom.signupError.removeAttribute('hidden');
    } finally {
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

  // Section navigation
  const sectionBtns = document.querySelectorAll('.section-nav-btn');
  if (sectionBtns.length > 0) {
    sectionBtns.forEach(b => b.addEventListener('click', () => {
      state.activeSection = b.getAttribute('data-section');
      sectionBtns.forEach(x => x.classList.toggle('active', x === b));
      renderList();
      updatePanelTitle();
    }));
  }

  // Tag: All
  dom.tagFilterList.querySelector('[data-tag="all"]')?.addEventListener('click', () => {
    state.activeTag = 'all';
    refreshTagActive();
    renderList();
    updatePanelTitle();
  });

  // Sort (sidebar)
  dom.sortBtns.forEach(b => b.addEventListener('click', () => {
    state.sortBy = b.getAttribute('data-sort');
    dom.sortBtns.forEach(x => x.classList.toggle('active', x === b));
    // Sync mobile sort bar
    document.querySelectorAll('.mobile-sort-btn').forEach(x => x.classList.toggle('active', x.getAttribute('data-sort') === state.sortBy));
    renderList();
    saveSettings();
  }));

  // Sort (mobile bar)
  document.querySelectorAll('.mobile-sort-btn').forEach(b => b.addEventListener('click', () => {
    state.sortBy = b.getAttribute('data-sort');
    document.querySelectorAll('.mobile-sort-btn').forEach(x => x.classList.toggle('active', x === b));
    // Sync sidebar sort buttons
    dom.sortBtns.forEach(x => x.classList.toggle('active', x.getAttribute('data-sort') === state.sortBy));
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
  if (dom.btnSidebarToggle) {
    dom.btnSidebarToggle.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        dom.appShell.classList.add('mobile-sidebar-open');
      } else {
        state.sidebarOpen = !state.sidebarOpen;
        dom.appShell.classList.toggle('sidebar-hidden', !state.sidebarOpen);
        saveSettings();
      }
    });
  }

  if (dom.sidebarOverlay) {
    dom.sidebarOverlay.addEventListener('click', () => {
      dom.appShell.classList.remove('mobile-sidebar-open');
    });
  }

  // Mobile hamburger — opens sidebar
  if (dom.btnHamburger) {
    dom.btnHamburger.addEventListener('click', () => {
      dom.appShell.classList.add('mobile-sidebar-open');
    });
  }

  // Mobile sidebar theme toggle
  const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
  if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener('click', () => {
      toggleTheme();
      closeMobileSidebar();
    });
  }

  // Mobile sidebar logout
  const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', async () => {
      closeMobileSidebar();
      try {
        await signOut();
        toast('Signed out', 'info');
      } catch (err) {
        toast('Failed to sign out', 'error');
      }
    });
  }

  // Close mobile sidebar on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dom.appShell.classList.contains('mobile-sidebar-open')) {
      closeMobileSidebar();
    }
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

  // Favorite
  if (dom.btnFavorite) {
    dom.btnFavorite.addEventListener('click', () => {
      if (state.activeNoteId) toggleFavorite(state.activeNoteId);
    });
  }

  // Archive
  if (dom.btnArchive) {
    dom.btnArchive.addEventListener('click', () => {
      if (state.activeNoteId) toggleArchive(state.activeNoteId);
    });
  }

  // Delete
  dom.btnDelete.addEventListener('click', () => { if (state.activeNoteId) openDeleteModal(state.activeNoteId); });
  dom.btnCancel.addEventListener('click', closeDeleteModal);
  dom.btnCloseDelete.addEventListener('click', closeDeleteModal);
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
        const title = dom.noteTitleInput.value;
        const content = dom.richEditor.innerHTML;
        if (!noteHasData(title, content)) {
          toast('Nothing to save — note is empty', 'info');
          return;
        }
        if (note.isDraft) {
          // Trigger scheduleSave which handles draft insertion properly
          scheduleSave();
        } else {
          updateNote(note.id, { title, content });
          showSaved();
          toast('Saved', 'success');
        }
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

// ============================================================
// REALTIME & PRESENCE (Phase 4)
// ============================================================
let realtimeChannel = null;
let presenceChannel = null;
let typingTimeout = null;

function subscribeToRealtime() {
  if (!supabaseClient) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  
  realtimeChannel = supabaseClient.channel('public:notenest_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, payload => {
      if (payload.eventType === 'UPDATE') {
        const id = payload.new.id;
        const existing = state.notes.find(n => n.id === id);
        if (existing) {
          const remoteTime = new Date(payload.new.modified_at).getTime();
          const localTime = new Date(existing.modifiedAt).getTime();
          if (remoteTime >= localTime) {
            existing.title = payload.new.title || '';
            existing.content = payload.new.content || '';
            existing.tags = payload.new.tags || [];
            existing.color = payload.new.color || 'default';
            existing.pinned = payload.new.pinned || false;
            existing.favorited = payload.new.favorited || false;
            existing.archived = payload.new.archived || false;
            if (payload.new.checklist) existing.checklist = payload.new.checklist;
            existing.modifiedAt = payload.new.modified_at;
            
            if (state.activeNoteId === id) {
              const activeEl = document.activeElement;
              const titleEl = document.getElementById('note-title-input');
              const contentEl = document.getElementById('rich-editor');
              if (activeEl !== titleEl) titleEl.value = existing.title;
              if (activeEl !== contentEl) contentEl.innerHTML = existing.content;
              if (typeof renderChecklist === 'function') renderChecklist();
            }
            if (typeof renderList === 'function') renderList();
            idb.saveNotes(state.notes);
          }
        }
      }
    }).subscribe();
}

function updatePresence(noteId) {
  if (!supabaseClient || !state.user || !noteId) return;
  if (presenceChannel) supabaseClient.removeChannel(presenceChannel);
  
  presenceChannel = supabaseClient.channel('presence:' + noteId, {
    config: { presence: { key: state.user.id } }
  });
  
  presenceChannel.on('presence', { event: 'sync' }, () => {
    const stateObj = presenceChannel.presenceState();
    const collabs = [];
    let isTyping = false;
    let typist = '';
    
    for (const id in stateObj) {
      if (id !== state.user.id) {
        const pres = stateObj[id][0];
        collabs.push(pres);
        if (pres.typing) { isTyping = true; typist = pres.email; }
      }
    }
    
    const cRow = document.getElementById('collaborators-row');
    if (cRow) {
      if (collabs.length > 0) {
        cRow.removeAttribute('hidden');
        cRow.innerHTML = collabs.map(c => 
          `<div style="width:24px;height:24px;border-radius:12px;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;position:relative;" title="${c.email}">
            ${(c.email || 'U')[0].toUpperCase()}
            <div style="position:absolute;bottom:0;right:0;width:8px;height:8px;background:#10b981;border-radius:4px;border:1px solid white;"></div>
          </div>`
        ).join('') + (isTyping ? `<span style="font-size:12px;color:var(--text-secondary);align-self:center;margin-left:8px">${typist} is editing...</span>` : '');
      } else {
        cRow.setAttribute('hidden', '');
      }
    }
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ user_id: state.user.id, email: getUserDisplayName(), typing: false });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const ed = document.getElementById('rich-editor');
  if (ed) {
    ed.addEventListener('input', () => {
      if (presenceChannel) {
        presenceChannel.track({ user_id: state.user.id, email: getUserDisplayName(), typing: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          presenceChannel.track({ user_id: state.user.id, email: getUserDisplayName(), typing: false });
        }, 1500);
      }
    });
  }
});

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

    // If user hasn't set a theme preference, use system preference
    const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (!storedSettings.theme) {
      state.theme = getSystemTheme();
    }

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
      subscribeToRealtime();
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
        subscribeToRealtime();
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

    // Register Service Worker for PWA / APK support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg error:', err));
    }
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


// ============================================================
// PHASE 2 & 3: COLLABORATION, NOTIFICATIONS, CHECKLISTS
// ============================================================

// State extensions
state.notifications = [];
state.collaborators = [];
state.myPermission = 'edit';
state.isShared = false;

// Helpers
async function loadSharedNotes() {
  if (!state.user) return [];
  const { data, error } = await supabaseClient.from('note_collaborators')
    .select('note_id, permission, owner_id')
    .eq('collaborator_email', state.user.email)
    .eq('status', 'accepted');
  if (error || !data) return [];
  
  const sharedIds = data.map(d => d.note_id);
  if (sharedIds.length === 0) return [];
  
  const { data: sharedNotes } = await supabaseClient.from('notes')
    .select('*')
    .in('id', sharedIds);
    
  return (sharedNotes || []).map(n => {
    const collab = data.find(d => d.note_id === n.id);
    return {
      id: n.id,
      title: n.title || '',
      content: n.content || '',
      tags: n.tags || [],
      color: n.color || 'default',
      pinned: n.pinned || false,
      favorited: n.favorited || false,
      archived: n.archived || false,
      lastOpenedAt: n.last_opened_at || n.modified_at || n.created_at,
      createdAt: n.created_at,
      modifiedAt: n.modified_at,
      isDraft: false,
      isShared: true,
      permission: collab.permission,
      ownerId: collab.owner_id,
      checklist: n.checklist || { items: [] }
    };
  });
}

const origLoadNotes = loadNotes;
loadNotes = async function() {
  await origLoadNotes();
  const shared = await loadSharedNotes();
  
  // Merge notes
  for (const sn of shared) {
    if (!state.notes.find(n => n.id === sn.id)) {
      state.notes.push(sn);
    }
  }
  
  // Update local checklists parse if missing
  state.notes.forEach(n => {
    if (!n.checklist) n.checklist = { items: [] };
  });
  
  await loadNotifications();
};

async function logActivity(noteId, action, details) {
  if (!state.user) return;
  const email = state.user.email;
  await supabaseClient.from('note_activity').insert({
    note_id: noteId,
    user_id: state.user.id,
    user_email: email,
    action,
    details
  });
}

// Notifications
async function loadNotifications() {
  if (!state.user) return;
  const { data } = await supabaseClient.from('notifications')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  state.notifications = data || [];
  renderNotifications();
}

async function markNotificationRead(id) {
  await supabaseClient.from('notifications').update({ read: true }).eq('id', id);
  const n = state.notifications.find(x => x.id === id);
  if (n) n.read = true;
  renderNotifications();
}

async function markAllRead() {
  await supabaseClient.from('notifications').update({ read: true }).eq('user_id', state.user.id);
  state.notifications.forEach(n => n.read = true);
  renderNotifications();
}

function renderNotifications() {
  const unreadCount = state.notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notif-badge');
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.removeAttribute('hidden');
  } else {
    badge.setAttribute('hidden', '');
  }
  
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = state.notifications.length === 0 ? '<p>No notifications</p>' : state.notifications.map(n => {
    return `<div style="padding:10px;border-bottom:1px solid #eee;background:${n.read ? 'transparent' : '#f0f4ff'}">
      <div style="font-weight:bold">${esc(n.title)}</div>
      <div style="font-size:12px">${esc(n.message)}</div>
      ${n.type === 'invite' && !n.read ? `<div style="margin-top:5px;display:flex;gap:5px">
          <button onclick="acceptInvite('${n.id}', '${n.data.collab_id}')" style="background:var(--primary-color);color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Accept</button>
          <button onclick="declineInvite('${n.id}', '${n.data.collab_id}')" style="background:#e5e7eb;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Decline</button>
        </div>` : ''}
    </div>`;
  }).join('');
}

window.acceptInvite = async function(notifId, collabId) {
  await supabaseClient.from('note_collaborators').update({ status: 'accepted', accepted_at: now() }).eq('id', collabId);
  await markNotificationRead(notifId);
  await loadNotes();
  renderList();
  toast('Invitation accepted', 'success');
};

window.declineInvite = async function(notifId, collabId) {
  await supabaseClient.from('note_collaborators').update({ status: 'declined' }).eq('id', collabId);
  await markNotificationRead(notifId);
  toast('Invitation declined', 'info');
};

document.getElementById('btn-notif-mark-read')?.addEventListener('click', markAllRead);
document.getElementById('btn-notifications')?.addEventListener('click', () => {
  const dd = document.getElementById('notif-dropdown');
  if (dd.hasAttribute('hidden')) dd.removeAttribute('hidden');
  else dd.setAttribute('hidden', '');
});

// Collaborators
async function loadCollaborators(noteId) {
  const { data } = await supabaseClient.from('note_collaborators')
    .select('*')
    .eq('note_id', noteId);
  state.collaborators = data || [];
  renderCollaborators();
}

function renderCollaborators() {
  const list = document.getElementById('collaborators-list');
  if (!list) return;
  list.innerHTML = state.collaborators.map(c => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
      <div>
        <div>${esc(c.collaborator_email)}</div>
        <div style="font-size:12px;color:gray">Status: ${c.status}</div>
      </div>
      <div style="display:flex;gap:8px">
        <select onchange="changeCollabPerm('${c.id}', this.value)" ${c.owner_id !== state.user.id ? 'disabled' : ''}>
          <option value="view" ${c.permission === 'view' ? 'selected' : ''}>View</option>
          <option value="edit" ${c.permission === 'edit' ? 'selected' : ''}>Edit</option>
        </select>
        ${c.owner_id === state.user.id ? `<button onclick="removeCollab('${c.id}')" style="background:red;color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Remove</button>` : ''}
      </div>
    </div>`).join('');
  
  const row = document.getElementById('collaborators-row');
  if (state.collaborators.length > 0) {
    row.removeAttribute('hidden');
    row.innerHTML = state.collaborators.filter(c => c.status === 'accepted').map(c => `<div title="${esc(c.collaborator_email)} (${c.permission})" style="width:24px;height:24px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:12px">
        ${esc(c.collaborator_email[0].toUpperCase())}
      </div>`).join('');
  } else {
    row.setAttribute('hidden', '');
  }
}

window.changeCollabPerm = async function(id, perm) {
  await supabaseClient.from('note_collaborators').update({ permission: perm }).eq('id', id);
  loadCollaborators(state.activeNoteId);
};
window.removeCollab = async function(id) {
  await supabaseClient.from('note_collaborators').delete().eq('id', id);
  loadCollaborators(state.activeNoteId);
  checkCollabStatus(state.activeNoteId);
};

async function checkCollabStatus(noteId) {
  const { count } = await supabaseClient.from('note_collaborators').select('*', { count: 'exact', head: true }).eq('note_id', noteId);
  const isCollab = count > 0;
  await supabaseClient.from('notes').update({ is_collaborative: isCollab }).eq('id', noteId);
}

document.getElementById('btn-invite')?.addEventListener('click', () => {
  document.getElementById('invite-modal').removeAttribute('hidden');
  loadCollaborators(state.activeNoteId);
});

document.getElementById('btn-close-invite')?.addEventListener('click', () => {
  document.getElementById('invite-modal').setAttribute('hidden', '');
});

document.getElementById('invite-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('invite-modal')) document.getElementById('invite-modal').setAttribute('hidden', '');
});

document.getElementById('btn-send-invite')?.addEventListener('click', async () => {
  const email = document.getElementById('invite-email').value.trim();
  const perm = document.getElementById('invite-perm').value;
  if (!email) return;
  
  const noteId = state.activeNoteId;
  const ownerId = state.user.id;
  
  const { data: collabData } = await supabaseClient.from('note_collaborators').insert({
    note_id: noteId,
    owner_id: ownerId,
    collaborator_email: email,
    permission: perm,
    status: 'pending',
    invited_at: now()
  }).select();
  
  await checkCollabStatus(noteId);
  
  if (collabData && collabData.length > 0) {
    const collab = collabData[0];
    
    // Create a generic notification
    const { data: users } = await supabaseClient.from('note_activity').select('user_id').eq('user_email', email).limit(1);
    if (users && users.length > 0) {
      await supabaseClient.from('notifications').insert({
        user_id: users[0].user_id,
        type: 'invite',
        title: 'New Note Invitation',
        message: `${state.user.email} invited you to a note`,
        data: { collab_id: collab.id },
        read: false
      });
    }
  }
  
  await logActivity(noteId, 'invite', `Invited ${email} to ${perm}`);
  document.getElementById('invite-email').value = '';
  loadCollaborators(noteId);
  toast('Invite sent', 'success');
});

// Activity
document.getElementById('btn-view-activity')?.addEventListener('click', async () => {
  const { data } = await supabaseClient.from('note_activity')
    .select('*')
    .eq('note_id', state.activeNoteId)
    .order('created_at', { ascending: false });
    
  const list = document.getElementById('activity-list');
  list.innerHTML = (data || []).map(a => `<div style="padding:8px 0;border-bottom:1px solid #eee">
      <div><strong>${esc(a.user_email)}</strong> ${esc(a.action)}</div>
      <div style="color:gray">${esc(a.details)}</div>
      <div style="font-size:11px;color:#aaa">${new Date(a.created_at).toLocaleString()}</div>
    </div>`).join('');
  
  document.getElementById('activity-modal').removeAttribute('hidden');
});

document.getElementById('btn-close-activity')?.addEventListener('click', () => {
  document.getElementById('activity-modal').setAttribute('hidden', '');
});

document.getElementById('activity-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('activity-modal')) document.getElementById('activity-modal').setAttribute('hidden', '');
});

// Checklists
document.getElementById('btn-checklist')?.addEventListener('click', () => {
  const area = document.getElementById('checklist-area');
  if (area.hasAttribute('hidden')) {
    area.removeAttribute('hidden');
  } else {
    area.setAttribute('hidden', '');
  }
});

function renderChecklist() {
  const note = getActive();
  if (!note || !note.checklist) return;
  const items = note.checklist.items || [];
  
  items.sort((a, b) => {
    if (a.completed === b.completed) return (a.order || 0) - (b.order || 0);
    return a.completed ? 1 : -1;
  });
  
  const total = items.length;
  const completed = items.filter(x => x.completed).length;
  
  document.getElementById('checklist-progress-text').textContent = `${completed}/${total} completed`;
  document.getElementById('checklist-progress-bar').style.width = total ? `${(completed/total)*100}%` : '0%';
  
  const list = document.getElementById('checklist-items');
  list.innerHTML = items.map(item => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0; ${item.completed ? 'opacity:0.6;text-decoration:line-through' : ''}">
      <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleChecklistItem('${item.id}')" ${state.myPermission === 'view' ? 'disabled' : ''} />
      <span style="flex:1">${esc(item.text)}</span>
      ${item.completed ? `<span style="font-size:10px;color:gray">by ${esc(item.completedBy)}</span>` : ''}
      ${state.myPermission === 'edit' ? `<button onclick="deleteChecklistItem('${item.id}')" style="background:none;border:none;cursor:pointer;color:red">&times;</button>` : ''}
    </div>`).join('');
  
  const card = document.querySelector(`.note-card[data-id="${note.id}"]`);
  if (card) {
    let cp = card.querySelector('.card-checklist-progress');
    if (total > 0) {
      if (!cp) {
        cp = document.createElement('div');
        cp.className = 'card-checklist-progress';
        cp.style.fontSize = '11px';
        cp.style.marginTop = '4px';
        cp.style.color = 'var(--primary-color)';
        card.querySelector('.note-card-preview').appendChild(cp);
      }
      cp.textContent = `${completed}/${total} `;
    } else if (cp) {
      cp.remove();
    }
  }
}

document.getElementById('new-checklist-item')?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    if (state.myPermission === 'view') return;
    const text = e.target.value.trim();
    if (!text) return;
    
    const note = getActive();
    if (!note) return;
    if (!note.checklist) note.checklist = { items: [] };
    
    const item = {
      id: 'chk_' + genId(),
      text,
      completed: false,
      completedBy: null,
      completedAt: null,
      assignedTo: null,
      order: note.checklist.items.length
    };
    
    note.checklist.items.push(item);
    e.target.value = '';
    renderChecklist();
    await updateNote(note.id, { checklist: note.checklist });
  }
});

window.toggleChecklistItem = async function(itemId) {
  if (state.myPermission === 'view') return;
  const note = getActive();
  const item = note.checklist.items.find(x => x.id === itemId);
  if (item) {
    item.completed = !item.completed;
    item.completedBy = item.completed ? state.user.email : null;
    item.completedAt = item.completed ? now() : null;
    renderChecklist();
    await updateNote(note.id, { checklist: note.checklist });
    if (note.isShared) await logActivity(note.id, 'checklist', `${item.completed ? 'Completed' : 'Unchecked'} "${item.text}"`);
  }
};

window.deleteChecklistItem = async function(itemId) {
  if (state.myPermission === 'view') return;
  const note = getActive();
  note.checklist.items = note.checklist.items.filter(x => x.id !== itemId);
  renderChecklist();
  await updateNote(note.id, { checklist: note.checklist });
};

// Override openNote to handle permissions
const origOpenNote = openNote;
openNote = function(id) {
  origOpenNote(id);
  updatePresence(id);
  const note = getActive();
  if (note) {
    state.myPermission = note.permission || 'edit';
    const isView = state.myPermission === 'view';
    
    document.getElementById('note-title-input').disabled = isView;
    document.getElementById('rich-editor').setAttribute('contenteditable', isView ? 'false' : 'true');
    const toolbar = document.querySelector('.editor-toolbar');
    if (toolbar) {
      if (isView) {
        toolbar.classList.add('view-only');
        document.querySelectorAll('.toolbar-left .toolbar-btn').forEach(btn => btn.style.display = 'none');
      } else {
        toolbar.classList.remove('view-only');
        document.querySelectorAll('.toolbar-left .toolbar-btn').forEach(btn => btn.style.display = '');
      }
    }
    
    document.getElementById('tags-input').disabled = isView;
    document.getElementById('new-checklist-item').disabled = isView;
    
    if (note.checklist && note.checklist.items.length > 0) {
      document.getElementById('checklist-area').removeAttribute('hidden');
    } else {
      document.getElementById('checklist-area').setAttribute('hidden', '');
    }
    
    renderChecklist();
    if (note.isShared || note.is_collaborative) loadCollaborators(note.id);
  }
};

// Override updateNote to prevent edit if view
const origUpdateNote = updateNote;
updateNote = async function(id, fields) {
  const note = state.notes.find(n => n.id === id);
  if (note && note.permission === 'view') return; // Cannot edit
  
  if ('checklist' in fields) {
    const supabaseFields = { checklist: fields.checklist, modified_at: now() };
    await supabaseClient.from('notes').update(supabaseFields).eq('id', id);
    Object.assign(note, fields, { modifiedAt: now() });
  } else {
    await origUpdateNote(id, fields);
  }
};
