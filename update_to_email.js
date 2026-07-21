const fs = require('fs');

// Update index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<label class="auth-label" for="login-username">Username<\/label>/g, '<label class="auth-label" for="login-email">Email</label>');
html = html.replace(/id="login-username" class="auth-input" placeholder="Enter your username" required autocomplete="off"/g, 'id="login-email" class="auth-input" placeholder="Enter your email" required autocomplete="email" type="email"');
html = html.replace(/<label class="auth-label" for="signup-username">Username<\/label>/g, '<label class="auth-label" for="signup-email">Email</label>');
html = html.replace(/id="signup-username" class="auth-input" placeholder="Choose a username" required minlength="3" autocomplete="off"/g, 'id="signup-email" class="auth-input" placeholder="Enter your email address" required autocomplete="email" type="email"');

// Fix input type from text to email for login/signup if they weren't caught
html = html.replace(/type="text" id="login-email"/g, 'type="email" id="login-email"');
html = html.replace(/type="text" id="signup-email"/g, 'type="email" id="signup-email"');

fs.writeFileSync('index.html', html);

// Update app.js
let js = fs.readFileSync('app.js', 'utf8');

// Replace getUsernameFromEmail
js = js.replace(/function getUsernameFromEmail\(email\)\s*\{\s*return email\.replace\('@notenest\.app', ''\);\s*\}/, `function getUsernameFromEmail(email) {
  if (!email) return '';
  return email.split('@')[0];
}`);

// Replace signUp
js = js.replace(/async function signUp\(username, password\) \{[\s\S]*?options: \{\s*data: \{ username \}\s*\}\s*\}\);/m, `async function signUp(email, password) {
  checkSupabaseReady();
  const username = getUsernameFromEmail(email);
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });`);

// Replace signIn
js = js.replace(/async function signIn\(username, password\) \{[\s\S]*?password\s*\}\);/m, `async function signIn(email, password) {
  checkSupabaseReady();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });`);

// Replace variables and DOM ids
js = js.replace(/loginUsername/g, 'loginEmail');
js = js.replace(/signupUsername/g, 'signupEmail');
js = js.replace(/login-username/g, 'login-email');
js = js.replace(/signup-username/g, 'signup-email');

// Replace strings in fallback HTML
js = js.replace(/>Username<\/label>/g, '>Email</label>');
js = js.replace(/placeholder="Enter your username"/g, 'placeholder="Enter your email" type="email"');
js = js.replace(/placeholder="Choose a username"/g, 'placeholder="Enter your email address" type="email"');

// Fix 'Invalid username or password'
js = js.replace(/Invalid username or password\./g, 'Invalid email or password.');

fs.writeFileSync('app.js', js);
console.log('Update complete');
