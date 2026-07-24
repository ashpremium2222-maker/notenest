const fs = require('fs');

// 1. Update style.css
let styleCss = fs.readFileSync('style.css', 'utf8');

// Append new styles
styleCss += `
/* Phase 5: Button Ripples */
.toolbar-btn, .btn-new-note, .auth-btn, .icon-btn {
  position: relative;
  overflow: hidden;
}
.toolbar-btn::after, .btn-new-note::after, .auth-btn::after, .icon-btn::after {
  content: "";
  display: block;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, #fff 10%, transparent 10%);
  background-repeat: no-repeat;
  background-position: 50%;
  transform: scale(10, 10);
  opacity: 0;
  transition: transform .5s, opacity 1s;
}
.toolbar-btn:active::after, .btn-new-note:active::after, .auth-btn:active::after, .icon-btn:active::after {
  transform: scale(0, 0);
  opacity: .3;
  transition: 0s;
}

/* Phase 5: Card Hover Lifts */
.note-card {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
}
.note-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: var(--glass-shadow-lg);
}

/* Phase 5: Checkbox SVG Tick Animation */
.checklist-area input[type="checkbox"] {
  appearance: none;
  background-color: var(--surface-1);
  margin: 0;
  font: inherit;
  color: currentColor;
  width: 1.15em;
  height: 1.15em;
  border: 0.15em solid var(--border-color);
  border-radius: 0.15em;
  display: grid;
  place-content: center;
  transition: background-color 0.2s, border-color 0.2s;
}
.checklist-area input[type="checkbox"]::before {
  content: "";
  width: 0.65em;
  height: 0.65em;
  transform: scale(0);
  transition: 120ms transform ease-in-out;
  box-shadow: inset 1em 1em white;
  background-color: transparent;
  transform-origin: bottom left;
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
}
.checklist-area input[type="checkbox"]:checked {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}
.checklist-area input[type="checkbox"]:checked::before {
  transform: scale(1);
}
`;

fs.writeFileSync('style.css', styleCss);

// 2. Update index.html
let indexHtml = fs.readFileSync('index.html', 'utf8');
indexHtml = indexHtml.replace(/cubic-bezier\(0\.175, 0\.885, 0\.32, 1\.275\)/g, 'cubic-bezier(0.34, 1.56, 0.64, 1)');
fs.writeFileSync('index.html', indexHtml);

// 3. Update sw.js
let swJs = fs.readFileSync('sw.js', 'utf8');
if (!swJs.includes("'./style.css'")) {
  swJs = swJs.replace(
    /const ASSETS = \[/,
    "const ASSETS = [\n  './style.css',"
  );
}
fs.writeFileSync('sw.js', swJs);

console.log("Patched CSS, HTML, SW");
