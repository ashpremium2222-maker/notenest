const fs = require('fs');
let js = fs.readFileSync('app.js', 'utf8');

// The backslash before the nested backticks is causing SyntaxError.
js = js.replace(/\\`(<div style="margin-top:5px)/g, '`$1');
js = js.replace(/<\/div>\\`/g, '</div>`');
js = js.replace(/\\`(<button onclick="removeCollab)/g, '`$1');
js = js.replace(/Remove<\/button>\\`/g, 'Remove</button>`');
js = js.replace(/\\`(<span style="font-size:10px)/g, '`$1');
js = js.replace(/<\/span>\\`/g, '</span>`');
js = js.replace(/\\`<div class="card-checklist-progress/g, '`<div class="card-checklist-progress');
js = js.replace(/✓<\/div>\\`/g, '✓</div>`');
js = js.replace(/<div class="note-card-preview">\\/g, '<div class="note-card-preview">');
js = js.replace(/\\` : '';/g, '` : \'\';');
js = js.replace(/\\`/g, '`');

fs.writeFileSync('app.js', js);
