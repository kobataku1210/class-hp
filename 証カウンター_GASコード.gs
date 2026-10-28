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
var DEFAULT_FINAL_SEC = 120; // 最後の1回：みんなで長押しして満タンにする合計秒数（目安）
var MAX_HOLD_PER_CALL = 6;   // 1回の送信で足せる最大秒数（連打・不正対策）

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

/* 生徒の加算は「目標−1」回で止まる（最後の1回は teacherFinal でクラスみんなで押す） */
function addCount(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 1) n = 1;
  if (n > MAX_ADD) n = MAX_ADD;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var asked = n;
  try {
    var sh = stateSheet_();
    var cur = Number(sh.getRange('B1').getValue()) || 0;
    var cap = getGoal_() - 1;
    n = Math.max(0, Math.min(n, cap - cur));
    if (n > 0) sh.getRange('B1').setValue(cur + n);
  } finally { lock.releaseLock(); }
  return { ok: true, added: n, capped: n < asked, total: getTotal_(), goal: getGoal_() };
}

/* 最後の1回（先生の端末からクラスみんなで押す）：合計を目標回数にする */
function teacherFinal(pin) {
  if (String(pin) !== ADMIN_PIN) return { ok: false, error: '暗証番号が違います' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = stateSheet_();
    var cur = Number(sh.getRange('B1').getValue()) || 0;
    if (cur < getGoal_()) sh.getRange('B1').setValue(getGoal_());
  } finally { lock.releaseLock(); }
  return { ok: true, total: getTotal_(), goal: getGoal_() };
}

/* ===== 最後の1回：みんなで長押しして証ゲージをためる ===== */
// B3=たまり秒数 / B4=解禁(0/1) / B5=満タン秒数
function finalStatus() {
  var sh = stateSheet_();
  var total = Number(sh.getRange('B1').getValue()) || 0;
  var goal  = getGoal_();
  var fill  = Number(sh.getRange('B3').getValue()) || 0;
  var armed = (Number(sh.getRange('B4').getValue()) || 0) === 1;
  var target = Number(sh.getRange('B5').getValue()); if (!(target > 0)) target = DEFAULT_FINAL_SEC;
  return { ok:true, total: total, goal: goal, fill: fill, target: target, armed: armed, done: total >= goal, atLast: total >= goal - 1 };
}
// 先生が「スタート！（解禁）」：たまりを0にして長押しを受付開始
function finalStart(pin) {
  if (String(pin) !== ADMIN_PIN) return { ok:false, error:'暗証番号が違います' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { var sh = stateSheet_(); sh.getRange('B3').setValue(0); sh.getRange('B4').setValue(1); }
  finally { lock.releaseLock(); }
  return finalStatus();
}
// 先生が「中止（やり直し）」：受付停止＋たまり0
function finalStop(pin) {
  if (String(pin) !== ADMIN_PIN) return { ok:false, error:'暗証番号が違います' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { var sh = stateSheet_(); sh.getRange('B4').setValue(0); sh.getRange('B3').setValue(0); }
  finally { lock.releaseLock(); }
  return finalStatus();
}
// 満タン秒数の変更（先生用）
function teacherSetFinalSec(pin, sec) {
  if (String(pin) !== ADMIN_PIN) return { ok:false, error:'暗証番号が違います' };
  var s = Math.floor(Number(sec)); if (!(s > 0)) return { ok:false, error:'秒数が不正です' };
  if (s > 3600) s = 3600;
  stateSheet_().getRange('B5').setValue(s);
  return finalStatus();
}
// 生徒の長押し：押していた秒数を足す（解禁中のみ）。満タンで達成（合計を目標に）
function finalHold(sec) {
  sec = Number(sec) || 0;
  if (sec < 0) sec = 0;
  if (sec > MAX_HOLD_PER_CALL) sec = MAX_HOLD_PER_CALL;
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = stateSheet_();
    var armed = (Number(sh.getRange('B4').getValue()) || 0) === 1;
    var total = Number(sh.getRange('B1').getValue()) || 0;
    var goal  = getGoal_();
    if (armed && total < goal && sec > 0) {
      var target = Number(sh.getRange('B5').getValue()); if (!(target > 0)) target = DEFAULT_FINAL_SEC;
      var fill = (Number(sh.getRange('B3').getValue()) || 0) + sec;
      if (fill > target) fill = target;
      sh.getRange('B3').setValue(fill);
      if (fill >= target && total < goal) sh.getRange('B1').setValue(goal);  // 達成
    }
  } finally { lock.releaseLock(); }
  return finalStatus();
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
  try { var sh = stateSheet_(); sh.getRange('B1').setValue(0); sh.getRange('B3').setValue(0); sh.getRange('B4').setValue(0); }
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
    sh.getRange('A3').setValue('finalFill'); sh.getRange('B3').setValue(0);
    sh.getRange('A4').setValue('armed');     sh.getRange('B4').setValue(0);
    sh.getRange('A5').setValue('finalSec');  sh.getRange('B5').setValue(DEFAULT_FINAL_SEC);
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
