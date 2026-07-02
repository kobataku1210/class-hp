/**
 * 「証」クラス共有カウンター  ―  Google Apps Script（ページも同梱）
 *
 * ページ本体（Index.html）もこのプロジェクト内に置き、GASが配信します。
 * → ページも通信も同じGoogle上（同一オリジン）になり、CORS/ログインの壁が消えます。
 *   学校端末は学校Googleにログイン済みなので、そのまま全機能が動きます。
 *
 * ▼ 必要なファイル（Apps Scriptエディタ内）
 *   1) このコード（コード.gs）
 *   2) HTMLファイル「Index」   ← 「証カウンター_Index.html」の中身を貼る
 *
 * ▼ セットアップは「証カウンター_設定手順.md」を参照。
 */

var DEFAULT_GOAL = 1000;
var ADMIN_PIN    = '1210';   // 先生用パネルの暗証番号
var MAX_ADD      = 1000;     // 一度に足せる上限
var MAX_NOTES    = 300;      // 保持する気づきの最大件数
var MAX_NOTE_LEN = 200;      // 気づき1件の最大文字数

/* ページを配信 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('証 ～クラスの証～')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/* ===== ページから google.script.run で呼ばれるサーバー関数 ===== */
function getState() {
  return { total: getTotal_(), goal: getGoal_() };
}

function addCount(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 1) n = 1;
  if (n > MAX_ADD) n = MAX_ADD;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = stateSheet_();
    var t = (Number(sh.getRange('B1').getValue()) || 0) + n;
    sh.getRange('B1').setValue(t);
  } finally { lock.releaseLock(); }
  return { ok: true, added: n, total: getTotal_(), goal: getGoal_() };
}

function getNotes() {
  var sh = notesSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 2).getValues(); // [ts, text]
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] === '' && rows[i][0] === '') continue;
    out.push({ ts: Number(rows[i][0]) || 0, t: String(rows[i][1]) });
  }
  out.reverse();                 // 新着が上
  return out.slice(0, MAX_NOTES);
}

function addNote(text) {
  text = String(text || '').slice(0, MAX_NOTE_LEN).replace(/^\s+|\s+$/g, '');
  if (!text) return { ok: false, error: '空です' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { notesSheet_().appendRow([ (new Date()).getTime(), text ]); }
  finally { lock.releaseLock(); }
  return { ok: true, notes: getNotes() };
}

function teacherReset(pin) {
  if (String(pin) !== ADMIN_PIN) return { ok: false, error: '暗証番号が違います' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { stateSheet_().getRange('B1').setValue(0); }
  finally { lock.releaseLock(); }
  return { ok: true, total: getTotal_(), goal: getGoal_() };
}

function teacherSetGoal(pin, goal) {
  if (String(pin) !== ADMIN_PIN) return { ok: false, error: '暗証番号が違います' };
  var g = Number(goal);
  if (!(g > 0)) return { ok: false, error: '目標が不正です' };
  stateSheet_().getRange('B2').setValue(g);
  return { ok: true, total: getTotal_(), goal: getGoal_() };
}

function teacherClearNotes(pin) {
  if (String(pin) !== ADMIN_PIN) return { ok: false, error: '暗証番号が違います' };
  var sh = notesSheet_();
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).clearContent();
  return { ok: true };
}

/* ===== 保存領域（スプレッドシート） ===== */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function stateSheet_() {
  var sh = ss_().getSheetByName('state');
  if (!sh) {
    sh = ss_().insertSheet('state');
    sh.getRange('A1').setValue('total'); sh.getRange('B1').setValue(0);
    sh.getRange('A2').setValue('goal');  sh.getRange('B2').setValue(DEFAULT_GOAL);
  }
  return sh;
}
function notesSheet_() {
  var sh = ss_().getSheetByName('notes');
  if (!sh) { sh = ss_().insertSheet('notes'); sh.getRange('A1').setValue('ts'); sh.getRange('B1').setValue('text'); }
  return sh;
}
function getTotal_() { return Number(stateSheet_().getRange('B1').getValue()) || 0; }
function getGoal_()  { var g = Number(stateSheet_().getRange('B2').getValue()); return g > 0 ? g : DEFAULT_GOAL; }
