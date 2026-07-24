const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
fs.writeFileSync('app.js', content, 'utf8');
