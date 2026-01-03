const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const serveHandler = require('serve-handler');
const decisionDataHandler = require('../web-embed/api/decision-data');
const matchMapHandler = require('../web-embed/api/match-map');
const pageMatchStatusHandler = require('../web-embed/api/page-match-status');
const pageMatchHandler = require('../admin-extension/chrome-extension/api/page-match');
const providerDocumentHandler = require('../admin-extension/chrome-extension/api/provider-document');
const providerKnowledgeHandler = require('../admin-extension/chrome-extension/api/provider-knowledge');

const WEB_ROOT = path.join(__dirname, '..', 'web-embed');
const HTTP_PORT = 4173;
const SSE_PATH = '/reload';

const relayClients = new Set();
let reloadTimer;

function broadcastReload() {
  const message = 'data: reload\n\n';
  for (const res of relayClients) {
    res.write(message);
  }
}

function scheduleReload() {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
  reloadTimer = setTimeout(broadcastReload, 120);
}

function setupWatcher() {
  try {
    const watcher = fs.watch(WEB_ROOT, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      console.log(`Detected change (${eventType}) on ${filename}`);
      scheduleReload();
    });

    watcher.on('error', (err) => {
      console.error('Watcher error:', err);
    });

    process.on('exit', () => watcher.close());
  } catch (err) {
    console.error('Unable to watch files for reload; auto-refresh disabled.', err);
  }
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname === SSE_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('retry: 10000\n\n');
      relayClients.add(res);

      req.on('close', () => {
        relayClients.delete(res);
      });
      return;
    }

    if (parsedUrl.pathname === '/api/match-map') {
      await matchMapHandler(req, res);
      return;
    }

    if (parsedUrl.pathname === '/api/page-match-status') {
      await pageMatchStatusHandler(req, res);
      return;
    }

    if (parsedUrl.pathname === '/api/page-match') {
      await pageMatchHandler(req, res);
      return;
    }

    if (parsedUrl.pathname === '/api/provider-document') {
      await providerDocumentHandler(req, res);
      return;
    }

    if (parsedUrl.pathname === '/api/provider-knowledge') {
      await providerKnowledgeHandler(req, res);
      return;
    }

    if (parsedUrl.pathname.startsWith('/api/')) {
      await decisionDataHandler(req, res);
      return;
    }

    serveHandler(req, res, { public: WEB_ROOT, cleanUrls: true });
  });

  server.listen(HTTP_PORT, 'localhost', () => {
    console.log(`Static server listening at http://localhost:${HTTP_PORT}`);
  });

  process.on('exit', () => server.close());
  return server;
}

async function run() {
  try {
    await new Promise((resolve, reject) => {
      const bootstrap = spawn(process.execPath, [path.join(__dirname, 'generate-config.js')], {
        stdio: 'inherit'
      });
      bootstrap.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`generate-config.js exited with ${code}`));
        }
      });
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
    return;
  }

  setupWatcher();
  startHttpServer();
}

run().catch((err) => {
  console.error('Development server failed to start:', err);
  process.exit(1);
});
