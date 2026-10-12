/**
 * 合唱祭 練習音源ページ「気づきメモ」クラウドAPI（Google Apps Script）
 * ------------------------------------------------------------------
 * ・各音源ごとに、生徒の「気づき」をGoogleスプレッドシートに保存します。
 * ・github.io など外部の静的ページからでも確実に動くよう JSONP で返します
 *   （CORSの制限を受けないため、家でも学校でも書き込めます）。
 *
 * 【設置手順】
 *  1. 新しいGoogleスプレッドシートを作る（名前：例「合唱 気づきメモ」）
 *  2. 拡張機能 → Apps Script を開き、このコードを全部貼り付けて保存
 *  3. 右上「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *       実行するユーザー：自分
 *       アクセスできるユーザー：全員
 *  4. 発行された「ウェブアプリのURL（…/exec）」をコピーし、
 *     chorus.html の NOTES_API に貼る
 *  ※コードを直したら「デプロイを管理」→編集(鉛筆)→バージョン「新バージョン」で更新
 */

var ADMIN_PIN   = '1210';   // 先生用（削除時に使用）
var SHEET_NAME  = 'notes';  // 保存用シート名（自動作成）
var MAX_PER_TRACK = 300;    // 1つの音源あたりの保存上限

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['track', 'text', 'ts']);
  }
  return sh;
}

function readAll_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var rows = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    var track = String(rows[i][0] || '');
    var text  = String(rows[i][1] || '');
    var ts    = Number(rows[i][2]) || 0;
    if (!track || !text) continue;
    if (!map[track]) map[track] = [];
    map[track].push({ t: text, ts: ts });
  }
  Object.keys(map).forEach(function (k) {
    map[k].sort(function (a, b) { return b.ts - a.ts; });          // 新しい順
    if (map[k].length > MAX_PER_TRACK) map[k] = map[k].slice(0, MAX_PER_TRACK);
  });
  return map;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'list';
  var out = { ok: true };
  try {
    if (action === 'list') {
      out.notes = readAll_();

    } else if (action === 'add') {
      var track = String(p.track || '').trim().slice(0, 60);
      var text  = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!track) throw new Error('音源が不明です');
      if (!text)  throw new Error('メモが空です');
      var lock = LockService.getScriptLock();
      lock.waitLock(8000);
      try {
        var sh = getSheet_();
        var last = sh.getLastRow();
        var lastTs = (last >= 2) ? (Number(sh.getRange(last, 3).getValue()) || 0) : 0;
        var ts = Math.max(Date.now(), lastTs + 1);   // tsを必ず一意・増加させる（同時投稿対策）
        sh.appendRow([track, text, ts]);
      } finally { lock.releaseLock(); }
      out.notes = readAll_();

    } else if (action === 'del') {
      if (String(p.pin || '') !== ADMIN_PIN) throw new Error('暗証番号が違います');
      var track2 = String(p.track || '');
      var ts2 = Number(p.ts);
      var lock2 = LockService.getScriptLock();
      lock2.waitLock(8000);
      try {
        var sh = getSheet_();
        var last = sh.getLastRow();
        if (last >= 2) {
          var rows = sh.getRange(2, 1, last - 1, 3).getValues();
          for (var i = rows.length - 1; i >= 0; i--) {
            if (String(rows[i][0]) === track2 && Number(rows[i][2]) === ts2) {
              sh.deleteRow(i + 2);
            }
          }
        }
      } finally { lock2.releaseLock(); }
      out.notes = readAll_();

    } else {
      throw new Error('unknown action');
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return respond_(out, p.callback);
}

function respond_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
