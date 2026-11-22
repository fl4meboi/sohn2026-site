import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from './sync.mjs';
import { runBuild } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SYNC_STATE_PATH = path.join(ROOT_DIR, 'data', 'sync-state.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const config = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'config.json'), 'utf-8'));
const PORT = Number(process.env.PORT || 3000);
const SYNC_INTERVAL_MINUTES = Number(
  process.env.SYNC_INTERVAL_MINUTES || config.sync?.intervalMinutes || 15
);
const skipInitialSync = process.argv.includes('--no-initial-sync');

let isSyncing = false;
let lastResult = null;

async function syncAndRebuild(reason = 'scheduled') {
  if (isSyncing) {
    return { skipped: true, reason: 'Sync already in progress' };
  }
  isSyncing = true;
  try {
    console.log(`[server] Running Naver blog sync (${reason})...`);
    const summary = await runSync();
    if (summary.hasChanges) {
      console.log('[server] Changes detected — rebuilding website...');
      await runBuild();
    } else {
      console.log('[server] No blog changes detected.');
    }
    lastResult = { ...summary, ok: true, reason };
    return lastResult;
  } catch (err) {
    console.error(`[server] Sync failed (${reason}):`, err.message);
    lastResult = { ok: false, error: err.message, at: new Date().toISOString(), reason };
    return lastResult;
  } finally {
    isSyncing = false;
  }
}

// Ensure dist/ exists before serving
await runBuild();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // API: Sync status
  if (req.method === 'GET' && pathname === '/api/status') {
    let state = null;
    try {
      state = JSON.parse(await fs.readFile(SYNC_STATE_PATH, 'utf-8'));
    } catch {
      state = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify(
        {
          blogId: config.blogId,
          syncing: isSyncing,
          intervalMinutes: SYNC_INTERVAL_MINUTES,
          lastResult,
          state,
        },
        null,
        2
      )
    );
    return;
  }

  // API: Manual or webhook-triggered sync
  if (req.method === 'POST' && pathname === '/api/sync') {
    const result = await syncAndRebuild('manual-api');
    res.writeHead(result.ok === false ? 502 : 200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // Serve static files from dist/
  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relPath.endsWith('/')) relPath += 'index.html';

  const resolvedPath = path.resolve(DIST_DIR, relPath);
  if (!resolvedPath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(resolvedPath);
    const filePath = stat.isDirectory() ? path.join(resolvedPath, 'index.html') : resolvedPath;
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[server] Website running at http://localhost:${PORT}`);
  console.log(`[server] Auto-sync interval: every ${SYNC_INTERVAL_MINUTES} minutes`);
  console.log(`[server] Endpoints: GET /api/status | POST /api/sync`);
});

if (!skipInitialSync) {
  syncAndRebuild('startup');
}

if (SYNC_INTERVAL_MINUTES > 0) {
  setInterval(() => {
    syncAndRebuild('scheduled');
  }, SYNC_INTERVAL_MINUTES * 60 * 1000);
}
