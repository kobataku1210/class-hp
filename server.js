// ============================================================
// server.js  ─ 学級HP ローカルサーバー
// 起動方法: サーバー起動.bat をダブルクリック
// ============================================================

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execFile } = require('child_process');

const PORT      = 3456;
const BASE_DIR  = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'data.json');

// MIMEタイプ
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
};

// リクエストボディを読み取る
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

// data.json を読む
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {
    return { adminPIN: '1210' };
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ===== API: データ取得 =====
  if (req.method === 'GET' && url === '/api/data') {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('data.json not found');
    }
    return;
  }

  // ===== API: データ保存 =====
  if (req.method === 'POST' && url === '/api/data') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      const current = readData();
      const correctPin = current.adminPIN || '1210';
      if (payload.pin !== correctPin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '暗証番号が違います' }));
        return;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload.data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: GitHub に push =====
  if (req.method === 'POST' && url === '/api/git-push') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      const current = readData();
      const correctPin = current.adminPIN || '1210';
      if (payload.pin !== correctPin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '暗証番号が違います' }));
        return;
      }
      const run = (cmd, args) => new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd: BASE_DIR }, (err, stdout, stderr) => {
          if (err) reject(stderr || err.message);
          else resolve(stdout);
        });
      });
      await run('git', ['add', '-A']);
      await run('git', ['commit', '--allow-empty', '-m', '学級HPを更新']);
      await run('git', ['push', 'origin', 'main']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // ===== 静的ファイル配信 =====
  let filePath = path.join(BASE_DIR, url === '/' ? 'index.html' : url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + url);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
      }
    }
  }
  console.log('========================================');
  console.log('  学級HP サーバー起動中');
  console.log('========================================');
  console.log('  先生用管理画面:');
  console.log('  http://localhost:' + PORT + '/admin.html');
  console.log('');
  console.log('  生徒用アクセスURL（同じWi-Fi内）:');
  console.log('  http://' + localIP + ':' + PORT);
  console.log('========================================');
  console.log('  終了するには Ctrl+C を押してください');
  console.log('========================================');
});
