const fs = require('fs');

// Patch index.html
let html = fs.readFileSync('index.html', 'utf8');

// 1. Search Bar below header
const searchBarHTML = `
    <!-- Sticky Search Bar -->
    <div class="search-bar-container" style="position: sticky; top: 0; z-index: 10; padding: 12px 14px; background: var(--bg-app); border-bottom: 1px solid var(--border);">
      <div class="pill-search" style="display: flex; align-items: center; background: var(--glass-bg-subtle); border: 1px solid var(--glass-border-subtle); border-radius: 100px; padding: 8px 16px; box-shadow: var(--glass-shadow);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="search" id="pill-search-input" placeholder="Search your notes..." style="background: none; border: none; outline: none; color: var(--text-primary); font-family: 'Inter', sans-serif; font-size: 14px; margin-left: 10px; width: 100%;" />
      </div>
    </div>
`;
html = html.replace('<!-- Integrated controls (replaces sidebar on desktop) -->', searchBarHTML + '\n    <!-- Integrated controls (replaces sidebar on desktop) -->');

// 2. Settings panel
const settingsHTML = `
  <section id="settings-panel" class="settings-panel" hidden style="position: fixed; inset: 0; background: var(--bg-app); z-index: 3000; overflow-y: auto; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
        <h2 style="font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 700; color: var(--text-primary);">Settings</h2>
        <button id="btn-close-settings" onclick="document.getElementById('settings-panel').setAttribute('hidden', '')" style="background: var(--glass-bg-subtle); border: none; color: var(--text-primary); width: 36px; height: 36px; border-radius: 18px; cursor: pointer;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      
      <!-- Profile Header -->
      <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 40px;">
        <div style="width: 80px; height: 80px; border-radius: 40px; background: var(--blue-light); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h3 style="font-size: 20px; font-weight: 600; margin: 0 0 4px 0;">John Doe</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin: 0;">john.doe@example.com</p>
      </div>
      
      <!-- Grouped Sections -->
      <div style="background: var(--glass-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 24px; overflow: hidden;">
        <div style="padding: 16px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Account</div>
        <div style="padding: 16px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); cursor: pointer;">
          <span>Edit Profile</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; cursor: pointer;">
          <span>Subscription</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
      
      <div style="background: var(--glass-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 24px; overflow: hidden;">
        <div style="padding: 16px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">App</div>
        <div style="padding: 16px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); cursor: pointer;">
          <span>Theme Options</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; cursor: pointer;">
          <span>Notifications</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
      
      <div style="background: var(--glass-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 32px; overflow: hidden;">
        <div style="padding: 16px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Security</div>
        <div style="padding: 16px; display: flex; justify-content: space-between; cursor: pointer;">
          <span>Change Password</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
      
      <button style="width: 100%; padding: 16px; border-radius: var(--radius-sm); background: var(--danger-bg); color: var(--danger); border: none; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
        Log Out
      </button>
    </div>
  </section>
`;

html = html.replace('<div class="toast-container"', settingsHTML + '\n<div class="toast-container"');
fs.writeFileSync('index.html', html);

// Patch style.css
let css = fs.readFileSync('style.css', 'utf8');

// 1. Strip light mode and variables, establish strict dark theme
const rootRegex = /:root\s*\{[\s\S]*?\}/;
const strictDarkTheme = `:root {
  --glass-bg: #121212;
  --glass-bg-strong: #1a1a1a;
  --glass-bg-subtle: #181818;
  --glass-border: rgba(255,255,255,0.08);
  --glass-border-subtle: rgba(255,255,255,0.04);
  --glass-blur: 20px;
  --glass-blur-heavy: 40px;
  --glass-shadow: 0 4px 20px rgba(0,0,0,0.5);
  --glass-shadow-lg: 0 12px 40px rgba(0,0,0,0.6);
  --glass-inner: none;
  --glass-highlight: none;
  --bg-app: #0A0A0A;
  --blue: #007AFF;
  --blue-dark: #0056b3;
  --blue-light: rgba(0, 122, 255, 0.15);
  --blue-mid: rgba(0, 122, 255, 0.25);
  --blue-glow: rgba(0, 122, 255, 0.5);
  --text-primary: #FFFFFF;
  --text-secondary: #EBEBEB;
  --text-muted: #888888;
  --border: rgba(255,255,255,0.08);
  --border-focus: var(--blue);
  --danger: #ff453a;
  --danger-bg: rgba(255, 69, 58, 0.1);
  --pin-color: #ffd60a;
  --pin-bg: rgba(255, 214, 10, 0.12);
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --transition: 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
  --transition-fast: 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
  --transition-spring: 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  --notes-panel-w: 340px;
}`;
css = css.replace(rootRegex, strictDarkTheme);

// Strip [data-theme="dark"] block
const darkThemeRegex = /\[data-theme="dark"\]\s*\{[\s\S]*?\}/g;
css = css.replace(darkThemeRegex, '');

// 2. Remove ambient blobs
css = css.replace(/body::before, body::after\s*\{[\s\S]*?\}/, '');
css = css.replace(/body::before\s*\{[\s\S]*?\}/, '');
css = css.replace(/body::after\s*\{[\s\S]*?\}/, '');
css = css.replace(/@keyframes ambientFloat\s*\{[\s\S]*?\}/, '');
css = css.replace(/\.app-shell::before\s*\{[\s\S]*?\}/, '');

// 3. Grid and Note Cards
// .notes-container.grid-view update
css = css.replace(/\.notes-container\.grid-view\s*\{[\s\S]*?\}/g, 
  '.notes-container.grid-view { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; align-content: start; }\n' +
  '@media (max-width: 400px) { .notes-container.grid-view { grid-template-columns: 1fr; } }');

// .note-card redesign
const noteCardRegex = /\.note-card\s*\{([\s\S]*?)\}/;
css = css.replace(noteCardRegex, `.note-card {
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border-subtle);
  border-radius: 18px;
  padding: 20px;
  cursor: pointer;
  transition: all var(--transition-spring);
  position: relative;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
}`);

css = css.replace(/\.note-card:hover\s*\{[\s\S]*?\}/, `.note-card:hover {
  background: var(--glass-bg);
  box-shadow: 0 8px 24px var(--blue-glow);
  transform: translateY(-4px) scale(1.02);
  border-color: var(--blue-mid);
}`);

css = css.replace(/\.note-card-title\s*\{[\s\S]*?\}/, `.note-card-title { font-size: 16px; font-weight: 800; color: var(--text-primary); line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 8px; }`);
css = css.replace(/\.note-card-preview\s*\{[\s\S]*?\}/, `.note-card-preview { font-size: 13px; color: var(--text-secondary); line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; flex: 1; font-weight: 500; }`);

css = css.replace(/\.note-card-footer\s*\{[\s\S]*?\}/, `.note-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap; margin-top: auto; position: relative; z-index: 1; }`);

// 4. Mobile Bottom Nav & FAB
css = css.replace(/\.mobile-bottom-nav\s*\{([\s\S]*?)\}/, `.mobile-bottom-nav {
  display: flex;
  position: fixed;
  bottom: 24px;
  left: 24px;
  right: 24px;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 100px;
  padding: 12px 24px;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  z-index: 1000;
}`);

css = css.replace(/\.nav-btn\.active\s*\{[\s\S]*?\}/, `.nav-btn.active {
  color: var(--blue);
  filter: drop-shadow(0 0 8px var(--blue-glow));
}`);

css = css.replace(/\.nav-btn-fab\s*\{[\s\S]*?\}/, `.nav-btn-fab {
  background: var(--blue) !important;
  color: #fff !important;
  transform: translateY(-28px);
  width: 64px;
  height: 64px;
  border-radius: 32px;
  box-shadow: 0 12px 24px var(--blue-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--transition-spring), box-shadow var(--transition-fast);
}
.nav-btn-fab:active {
  transform: translateY(-28px) scale(0.9) !important;
  box-shadow: 0 6px 12px var(--blue-glow);
}`);

// Delete old light mode overrides for FAB if any
css = css.replace(/\[data-theme="dark"\] \.nav-btn-fab\s*\{[\s\S]*?\}/, '');

fs.writeFileSync('style.css', css);
console.log("Done");
