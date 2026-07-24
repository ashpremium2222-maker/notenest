const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

// 1. Add IDB wrapper and offline properties
const idbCode = `
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
`;

// Insert after UTILS
appJs = appJs.replace('// ============================================================\n// UTILS', idbCode + '\n// ============================================================\n// UTILS');

// 2. Modify loadNotes
appJs = appJs.replace(/async function loadNotes\(\) \{[\s\S]*?state\.notes = \(data \|\| \[\]\)\.map\(n => \(\{[\s\S]*?isDraft:\s*false\n\s*\}\)\);/m, 
  `async function loadNotes() {
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
  idb.saveNotes(state.notes);`);

// 3. Modifying updateNote
appJs = appJs.replace(/const \{ error \} = await supabaseClient\.from\('notes'\)\.update\(supabaseFields\)\.eq\('id', id\);/,
  `if (!navigator.onLine) {
    await idb.queueEdit('UPDATE_NOTE', { id, fields: supabaseFields });
    toast('Saved offline', 'info');
    return;
  }
  const { error } = await supabaseClient.from('notes').update(supabaseFields).eq('id', id);`);

// 4. Realtime logic injection
const realtimeCode = `
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
              renderChecklist();
            }
            renderList();
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
    if (collabs.length > 0) {
      cRow.removeAttribute('hidden');
      cRow.innerHTML = collabs.map(c => 
        \`<div style="width:24px;height:24px;border-radius:12px;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;position:relative;" title="\${c.email}">
          \${c.email[0].toUpperCase()}
          <div style="position:absolute;bottom:0;right:0;width:8px;height:8px;background:#10b981;border-radius:4px;border:1px solid white;"></div>
        </div>\`
      ).join('') + (isTyping ? \`<span style="font-size:12px;color:var(--text-secondary);align-self:center;margin-left:8px">\${typist} is editing...</span>\` : '');
    } else {
      cRow.setAttribute('hidden', '');
    }
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ user_id: state.user.id, email: getUserDisplayName(), typing: false });
    }
  });
}

// Add typing event logic when rich-editor inputs
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
`;

appJs += '\n' + realtimeCode + '\n';

// 5. Inject init() updates
// Find "await loadNotes();" in init and add subscribeToRealtime()
appJs = appJs.replace(/await loadNotes\(\);/, 'await loadNotes();\n    subscribeToRealtime();');

// 6. Inject openNote() updates
// Find "origOpenNote(id);" and add "updatePresence(id);"
appJs = appJs.replace(/origOpenNote\(id\);/, 'origOpenNote(id);\n  updatePresence(id);');

fs.writeFileSync('app.js', appJs);
console.log("Patched app.js");
