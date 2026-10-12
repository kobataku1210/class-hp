/**
 * 合唱祭「気づきメモ」クラウド共有ページ（Google Apps Script）
 * ------------------------------------------------------------------
 * ・クラス全員の気づき（曲のポイント）を1か所にまとめて共有するページです。
 * ・script.google.com 上のページとして開くので、学校アカウントでログインして
 *   いれば、家でも学校でも投稿・閲覧できます（証の「みんなの気づき」と同じ方式）。
 *
 * 【設置手順】
 *  1. Googleスプレッドシート（例「合唱 気づきメモ」）の 拡張機能 → Apps Script
 *  2. ファイルを2つにする：
 *       ・「Code.gs」… このコードを貼り付け
 *       ・「Index.html」… ＋で「HTML」ファイルを作り、合唱気づき_Index.html の中身を貼り付け
 *         （ファイル名は必ず Index にする）
 *  3. デプロイ → 新しいデプロイ → ウェブアプリ
 *       実行するユーザー：自分
 *       アクセスできるユーザー：（組織内の）全員   ※選べる一番広いもの
 *  4. 発行された /exec のURLを chorus.html の NOTES_PAGE に貼る
 *  ※コードを直したら「デプロイを管理」→編集→バージョン「新バージョン」で更新
 */

var ADMIN_PIN  = '1210';   // 先生用（削除時）
var SHEET_NAME = 'notes';  // 保存シート（自動作成）
var MAX_NOTES  = 500;      // 保存上限

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('合唱 気づきメモ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(['text', 'ts']); }
  return sh;
}

function apiList() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 2).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var t = String(rows[i][0] || '');
    var ts = Number(rows[i][1]) || 0;
    if (t) out.push({ t: t, ts: ts });
  }
  out.sort(function (a, b) { return b.ts - a.ts; });        // 新しい順
  if (out.length > MAX_NOTES) out = out.slice(0, MAX_NOTES);
  return out;
}

function apiAdd(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) throw new Error('メモが空です');
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var sh = getSheet_();
    var last = sh.getLastRow();
    var lastTs = (last >= 2) ? (Number(sh.getRange(last, 2).getValue()) || 0) : 0;
    var ts = Math.max(Date.now(), lastTs + 1);              // 一意・増加するts
    sh.appendRow([text, ts]);
  } finally { lock.releaseLock(); }
  return apiList();
}

function apiDel(ts, pin) {
  if (String(pin || '') !== ADMIN_PIN) throw new Error('暗証番号が違います');
  ts = Number(ts);
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var sh = getSheet_();
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 2).getValues();
      for (var i = rows.length - 1; i >= 0; i--) {
        if (Number(rows[i][1]) === ts) sh.deleteRow(i + 2);
      }
    }
  } finally { lock.releaseLock(); }
  return apiList();
}
