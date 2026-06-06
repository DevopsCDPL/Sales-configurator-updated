/**
 * Railway start script — injects runtime API URL into the built index.html
 * before starting the static file server.
 *
 * This allows REACT_APP_API_URL (or BACKEND_URL) to be resolved at deploy
 * time rather than only at build time, so a single build artifact can be
 * pointed at different backends per environment.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'build', 'index.html');

// Determine API URL with intelligent fallback for production
let apiUrl = process.env.REACT_APP_API_URL || process.env.BACKEND_URL || '';

// Railway .railway.internal domains are only reachable server-to-server inside
// Railway's private network — browsers cannot resolve them.  Detect and replace
// with the public equivalent when possible.
if (apiUrl && apiUrl.includes('.railway.internal')) {
  console.warn('[start.js] WARNING: API URL contains .railway.internal — this is not reachable from a browser.');
  // Strip it so the fallback logic below can take over
  apiUrl = '';
}

// If no explicit API URL is set and we're on Railway, construct it intelligently
if (!apiUrl && process.env.RAILWAY_ENVIRONMENT_NAME) {
  const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  if (isProduction) {
    apiUrl = 'https://g-t-production.up.railway.app/api';
    console.log('[start.js] Auto-detected production environment. Using backend URL:', apiUrl);
  } else {
    // For non-production, use the public backend domain from env var if available
    const backendDomain = process.env.BACKEND_PUBLIC_DOMAIN || '';
    if (backendDomain) {
      apiUrl = `https://${backendDomain}/api`;
      console.log('[start.js] Using BACKEND_PUBLIC_DOMAIN. Backend URL:', apiUrl);
    } else {
      // Convention: backend-<env>.railway.app
      const envName = process.env.RAILWAY_ENVIRONMENT_NAME || 'dev';
      apiUrl = `https://backend-${envName}.railway.app/api`;
      console.log('[start.js] Auto-constructed Railway public URL. Backend URL:', apiUrl);
    }
  }
}

// Ensure the URL has a protocol (bare hostnames won't work from the browser)
if (apiUrl && !apiUrl.startsWith('http') && !apiUrl.startsWith('/')) {
  apiUrl = `https://${apiUrl}`;
  console.log('[start.js] Added https:// protocol to API URL:', apiUrl);
}

// Ensure the URL ends with /api (if it looks like a hostname without a path)
if (apiUrl && apiUrl.startsWith('http') && !apiUrl.includes('/api')) {
  apiUrl = apiUrl.replace(/\/+$/, '') + '/api';
  console.log('[start.js] Appended /api path. Backend URL:', apiUrl);
}

// Default to relative path if running locally or no other option available
if (!apiUrl) {
  apiUrl = '/api';
  console.warn('[start.js] WARNING: REACT_APP_API_URL / BACKEND_URL not set and not on Railway — using relative /api path');
}

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  // Remove any previously injected __RUNTIME_API_URL__ tag so we always use the current env var
  html = html.replace(/<script>window\.__RUNTIME_API_URL__=.*?<\/script>\n?/g, '');
  // Inject a global variable before any other script
  const tag = `<script>window.__RUNTIME_API_URL__=${JSON.stringify(apiUrl)};</script>`;
  html = html.replace('<head>', `<head>\n${tag}`);
  fs.writeFileSync(indexPath, html);
  console.log(`[start.js] Injected runtime API URL: ${apiUrl}`);
} else {
  console.warn('[start.js] WARNING: index.html not found at', indexPath);
}

const PORT = process.env.PORT || 3000;
execSync(`npx serve -s build -l ${PORT}`, { stdio: 'inherit' });
