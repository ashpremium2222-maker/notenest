const fs = require('fs');

const HTML_FILE = 'index.html';
const APP_FILE = 'app.js';

let html = fs.readFileSync(HTML_FILE, 'utf8');

// HTML Edits
// 1. Add notification bell to panel-actions
html = html.replace(
  '<button class="btn-hamburger" id="btn-hamburger" title="Menu">',
  `<div class="notification-wrapper" style="position:relative;display:inline-block">
    <button class="icon-btn" id="btn-notifications" title="Notifications" style="position:relative">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      <span id="notif-badge" class="notif-badge" hidden style="position:absolute;top:0;right:0;background:red;color:white;font-size:10px;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;"></span>
    </button>
    <div id="notif-dropdown" class="notif-dropdown" hidden style="position:absolute;top:100%;right:0;width:300px;background:var(--surface-1);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:100;max-height:400px;overflow-y:auto;">
      <div style="padding:10px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
        <strong>Notifications</strong>
        <button id="btn-notif-mark-read" style="font-size:12px;cursor:pointer;background:none;border:none;color:var(--primary-color)">Mark all read</button>
      </div>
      <div id="notif-list" style="padding:10px;"></div>
    </div>
  </div>
  <button class="btn-hamburger" id="btn-hamburger" title="Menu">`
);

// 2. Add Invite button to editor toolbar
html = html.replace(
  '<div class="toolbar-sep"></div>',
  `<button class="toolbar-btn" id="btn-invite" title="Invite Collaborators"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></button>
   <button class="toolbar-btn" id="btn-checklist" title="Checklist"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></button>
   <div class="toolbar-sep"></div>`
);

// 3. Add collaborators row and checklist area in editor
html = html.replace(
  '<div class="rich-editor-wrapper">',
  `<div class="collaborators-row" id="collaborators-row" style="padding:0 24px;display:flex;gap:4px;margin-bottom:8px" hidden></div>
   <div class="rich-editor-wrapper">`
);

html = html.replace(
  '<div class="rich-editor" id="rich-editor" contenteditable="true" data-placeholder="Start writing…" spellcheck="true"></div>',
  `<div class="rich-editor" id="rich-editor" contenteditable="true" data-placeholder="Start writing…" spellcheck="true"></div>
   <div class="checklist-area" id="checklist-area" style="padding: 10px 24px;" hidden>
     <div class="checklist-progress" style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
       <span id="checklist-progress-text" style="font-size:12px;color:var(--text-secondary)"></span>
       <div style="flex:1;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
         <div id="checklist-progress-bar" style="height:100%;background:var(--primary-color);width:0%;transition:width 0.3s"></div>
       </div>
     </div>
     <div id="checklist-items"></div>
     <div style="margin-top:10px">
       <input type="text" id="new-checklist-item" placeholder="Add checklist item..." style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:4px" />
     </div>
   </div>`
);

// 4. Add Invite Modal and Activity Modal
html = html.replace(
  '</body>',
  `<div class="modal-overlay" id="invite-modal" hidden style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center">
    <div class="modal" style="background:var(--surface-1);padding:24px;border-radius:12px;width:100%;max-width:400px">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px">Share Note</h2>
        <button id="btn-close-invite" style="background:none;border:none;cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="email" id="invite-email" placeholder="Email address" style="flex:1;padding:8px;border:1px solid var(--border-color);border-radius:4px" />
        <select id="invite-perm" style="padding:8px;border:1px solid var(--border-color);border-radius:4px">
          <option value="view">View</option>
          <option value="edit">Edit</option>
        </select>
        <button id="btn-send-invite" style="padding:8px 16px;background:var(--primary-color);color:white;border:none;border-radius:4px;cursor:pointer">Invite</button>
      </div>
      <div id="collaborators-list"></div>
      <div style="margin-top:16px;text-align:center">
        <button id="btn-view-activity" style="font-size:13px;color:var(--primary-color);background:none;border:none;cursor:pointer">View Activity History</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="activity-modal" hidden style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center">
    <div class="modal" style="background:var(--surface-1);padding:24px;border-radius:12px;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px">Activity History</h2>
        <button id="btn-close-activity" style="background:none;border:none;cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div id="activity-list" style="overflow-y:auto;flex:1;font-size:13px"></div>
    </div>
  </div>
</body>`
);

fs.writeFileSync(HTML_FILE, html);


let js = fs.readFileSync(APP_FILE, 'utf8');

const addition = `
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
  list.innerHTML = state.notifications.length === 0 ? '<p>No notifications</p>' : state.notifications.map(n => `
    <div style="padding:10px;border-bottom:1px solid #eee;background:\${n.read ? 'transparent' : '#f0f4ff'}">
      <div style="font-weight:bold">\${esc(n.title)}</div>
      <div style="font-size:12px">\${esc(n.message)}</div>
      \${n.type === 'invite' && !n.read ? \\`
        <div style="margin-top:5px;display:flex;gap:5px">
          <button onclick="acceptInvite('\${n.id}', '\${n.data.collab_id}')" style="background:var(--primary-color);color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Accept</button>
          <button onclick="declineInvite('\${n.id}', '\${n.data.collab_id}')" style="background:#e5e7eb;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Decline</button>
        </div>
      \\` : ''}
    </div>
  `).join('');
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
  list.innerHTML = state.collaborators.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
      <div>
        <div>\${esc(c.collaborator_email)}</div>
        <div style="font-size:12px;color:gray">Status: \${c.status}</div>
      </div>
      <div style="display:flex;gap:8px">
        <select onchange="changeCollabPerm('\${c.id}', this.value)" \${c.owner_id !== state.user.id ? 'disabled' : ''}>
          <option value="view" \${c.permission === 'view' ? 'selected' : ''}>View</option>
          <option value="edit" \${c.permission === 'edit' ? 'selected' : ''}>Edit</option>
        </select>
        \${c.owner_id === state.user.id ? \\`
          <button onclick="removeCollab('\${c.id}')" style="background:red;color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer">Remove</button>
        \\` : ''}
      </div>
    </div>
  `).join('');
  
  const row = document.getElementById('collaborators-row');
  if (state.collaborators.length > 0) {
    row.removeAttribute('hidden');
    row.innerHTML = state.collaborators.filter(c => c.status === 'accepted').map(c => `
      <div title="\${esc(c.collaborator_email)} (\${c.permission})" style="width:24px;height:24px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:12px">
        \${esc(c.collaborator_email[0].toUpperCase())}
      </div>
    `).join('');
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
    
    // We can't query auth.users from client safely. Let's just create a generic notification via RPC or if user is logged in.
    const { data: users } = await supabaseClient.from('note_activity').select('user_id').eq('user_email', email).limit(1);
    if (users && users.length > 0) {
      await supabaseClient.from('notifications').insert({
        user_id: users[0].user_id,
        type: 'invite',
        title: 'New Note Invitation',
        message: `\${state.user.email} invited you to a note`,
        data: { collab_id: collab.id },
        read: false
      });
    }
  }
  
  await logActivity(noteId, 'invite', `Invited \${email} to \${perm}`);
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
  list.innerHTML = (data || []).map(a => `
    <div style="padding:8px 0;border-bottom:1px solid #eee">
      <div><strong>\${esc(a.user_email)}</strong> \${esc(a.action)}</div>
      <div style="color:gray">\${esc(a.details)}</div>
      <div style="font-size:11px;color:#aaa">\${new Date(a.created_at).toLocaleString()}</div>
    </div>
  `).join('');
  
  document.getElementById('activity-modal').removeAttribute('hidden');
});

document.getElementById('btn-close-activity')?.addEventListener('click', () => {
  document.getElementById('activity-modal').setAttribute('hidden', '');
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
  
  document.getElementById('checklist-progress-text').textContent = `\${completed}/\${total} completed`;
  document.getElementById('checklist-progress-bar').style.width = total ? `\${(completed/total)*100}%` : '0%';
  
  const list = document.getElementById('checklist-items');
  list.innerHTML = items.map(item => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0; \${item.completed ? 'opacity:0.6;text-decoration:line-through' : ''}">
      <input type="checkbox" \${item.completed ? 'checked' : ''} onchange="toggleChecklistItem('\${item.id}')" \${state.myPermission === 'view' ? 'disabled' : ''} />
      <span style="flex:1">\${esc(item.text)}</span>
      \${item.completed ? \\`<span style="font-size:10px;color:gray">by \${esc(item.completedBy)}</span>\\` : ''}
      \${state.myPermission === 'edit' ? \\`
        <button onclick="deleteChecklistItem('\${item.id}')" style="background:none;border:none;cursor:pointer;color:red">&times;</button>
      \\` : ''}
    </div>
  `).join('');
  
  const card = document.querySelector(`.note-card[data-id="\${note.id}"]`);
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
      cp.textContent = `\${completed}/\${total} ✓`;
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
    if (note.isShared) await logActivity(note.id, 'checklist', `\${item.completed ? 'Completed' : 'Unchecked'} "\${item.text}"`);
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
        // Hide format buttons, but keep close and right toolbar
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
`

js = js + '\\n' + addition;

// Make card creation also include checklist progress logic
js = js.replace(
  "const preview = stripHtml(note.content).trim() || 'No content';",
  `const preview = stripHtml(note.content).trim() || 'No content';
   const chk = note.checklist && note.checklist.items ? note.checklist.items : [];
   const totalChk = chk.length;
   const compChk = chk.filter(x=>x.completed).length;
   const chkStr = totalChk > 0 ? \\`<div class="card-checklist-progress" style="font-size:11px;margin-top:4px;color:var(--primary-color)">\${compChk}/\${totalChk} ✓</div>\\` : '';
  `
);

js = js.replace(
  '<div class="note-card-preview">\${highlight(preview.slice(0,150), q)}</div>',
  `<div class="note-card-preview">\\\${highlight(preview.slice(0,150), q)}\\\${chkStr}</div>`
);

fs.writeFileSync(APP_FILE, js);
console.log('Patched');
