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

  // ===== API: 証 クラス共同カウンター（取得） =====
  if (req.method === 'GET' && url === '/api/shirushi') {
    const d = readData();
    const s = d.shirushi || { total: 0, goal: 500, students: {} };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(s));
    return;
  }

  // ===== API: 証 自己申告で加算（PIN不要・生徒用） =====
  if (req.method === 'POST' && url === '/api/shirushi/add') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      const name = String(payload.name || '').trim().slice(0, 40); // 名前は任意（空＝匿名）
      let add = parseInt(payload.add, 10);
      if (!Number.isFinite(add)) add = 1;
      add = Math.max(1, Math.min(1000, add)); // 1回の申告は最大1000まで
      const d = readData();
      if (!d.shirushi) d.shirushi = { total: 0, goal: 500, students: {} };
      if (name) d.shirushi.students[name] = (d.shirushi.students[name] || 0) + add; // 名前があれば個人別も記録
      d.shirushi.total = (d.shirushi.total || 0) + add;
      fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, shirushi: d.shirushi, added: add }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: 証 リセット・目標変更（PIN保護・先生用） =====
  if (req.method === 'POST' && url === '/api/shirushi/reset') {
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
      const goal = Math.max(1, parseInt(payload.goal, 10) || (current.shirushi && current.shirushi.goal) || 500);
      const keepGoalOnly = payload.mode === 'goal'; // 目標だけ変更（合計は維持）
      const prevTotal = (current.shirushi && current.shirushi.total) || 0;
      const prevStudents = (current.shirushi && current.shirushi.students) || {};
      current.shirushi = {
        total: keepGoalOnly ? prevTotal : 0,
        goal: goal,
        students: keepGoalOnly ? prevStudents : {}
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(current, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, shirushi: current.shirushi }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: 証 みんなの気づき（共有メモ）取得 =====
  if (req.method === 'GET' && url === '/api/shirushi/notes') {
    const d = readData();
    const notes = Array.isArray(d.shirushiNotes) ? d.shirushiNotes : [];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ notes: notes.slice(-300).reverse() })); // 新しい順
    return;
  }

  // ===== API: 証 気づきを投稿（PIN不要・生徒用） =====
  if (req.method === 'POST' && url === '/api/shirushi/notes') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      let text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok:false, error:'メモが空です' })); return; }
      const d = readData();
      if (!Array.isArray(d.shirushiNotes)) d.shirushiNotes = [];
      d.shirushiNotes.push({ t: text, ts: Date.now() });
      if (d.shirushiNotes.length > 300) d.shirushiNotes = d.shirushiNotes.slice(-300);
      fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, notes: d.shirushiNotes.slice(-300).reverse() }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: 証 気づきの全消去（PIN保護・先生用） =====
  if (req.method === 'POST' && url === '/api/shirushi/notes/clear') {
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
      current.shirushiNotes = [];
      fs.writeFileSync(DATA_FILE, JSON.stringify(current, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, notes: [] }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
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
    // ブラウザキャッシュを無効化（常に最新のHTML/JSを配信）
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
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
