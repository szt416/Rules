// 源论坛 YCOO 自动签到 · Surge · 原作者 szt416
// 23:59 预取，跨日单次提交；MODE=noon 只补签明确未签到的当前账户。
const STORE_KEY = 'ycoo_surge_signin_session_v1';
const RECEIPT_KEY = 'ycoo_surge_signin_receipt_v1';
const DEFAULT_BASE = 'https://ycoo.net';
const SCRIPT_NAME = '源论坛签到';
function notify(title, body) { $notification.post(SCRIPT_NAME, title, body); }
function getHeader(headers, name) {
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}
function normalizeBase(url) {
  return /^https:\/\/www\.ycoo\.net(?:\/|$)/i.test(url) ? 'https://www.ycoo.net' : DEFAULT_BASE;
}
function buildHeaders(saved, extra) {
  const out = {};
  for (const k of ['Cookie', 'User-Agent', 'Accept', 'Accept-Language', 'Sec-Fetch-Site', 'Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 'DNT']) {
    const v = getHeader(saved, k);
    if (v) out[k] = v;
  }
  return Object.assign(out, extra || {});
}
function captureSession(req, env) {
  if (!/^(1|true|on|yes)$/i.test(env.ENABLE_CAPTURE || '')) return;
  if (!/^https:\/\/(www\.)?ycoo\.net\//i.test(req.url)) return;
  const headers = buildHeaders(req.headers);
  if (!headers.Cookie) return notify('Cookie 失败', '请登录后重新打开签到页');
  const savedAt = Date.now();
  const payload = {base: normalizeBase(req.url), headers, savedAt, captureId: savedAt + ':' + Math.random().toString(36).slice(2)};
  const ok = $persistentStore.write(JSON.stringify(payload), STORE_KEY);
  notify(ok ? 'Cookie 成功' : 'Cookie 保存失败', ok ? '登录信息已保存，请关闭捕获开关' : 'Surge 本地存储写入失败');
}
function localDay(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function htmlDecode(s) {
  return String(s || '').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
}
function textOnly(s) {
  return htmlDecode(String(s || '').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function extractFormhash(s) {
  const m = s.match(/name=["']formhash["'][^>]*value=["']([\da-z]+)["']/i) || s.match(/value=["']([\da-z]+)["'][^>]*name=["']formhash["']/i) || s.match(/[?&]formhash=([\da-z]{6,})/i);
  return m ? m[1] : '';
}
async function fetchText(ctx, method, url, headers, body) {
  const options = {url, headers, timeout:15, 'auto-cookie':false, 'auto-redirect':false};
  if (body != null) options.body = body;
  return new Promise((resolve, reject) => {
    $httpClient[method.toLowerCase()](options, (err, r, data) => {
      if (err || !r) return reject(new Error('network'));
      resolve({status:Number(r.status), text:String(data || ''), headers:r.headers || {}});
    });
  });
}
function authRequired(r) {
  return r.status === 401 || (r.status >= 300 && r.status < 400 && /(?:action=login|mod=logging)/i.test(getHeader(r.headers,'Location'))) || /(?:id|name)=["']loginform["']/i.test(r.text) || /请先登录|您尚未登录/.test(textOnly(r.text));
}
function authNotice() { notify('需要登录', '请检查登录状态并重新捕获 Cookie'); }
function authError(e) { return e && (e.auth === true || e.code === 'AUTH'); }
async function signPage(session) {
  const {base, headers} = session;
  const r = await fetchText(null, 'GET', base+'/k_misign-sign.html', buildHeaders(headers, {Referer:base+'/', 'Cache-Control':'no-cache'}));
  if (authRequired(r)) throw Object.assign(new Error('auth'), {auth:true});
  const raw = htmlDecode(r.text);
  if (!(r.status >= 200 && r.status < 300) || !/k_misign/i.test(raw) || !/member\.php\?mod=logging&action=logout\b/i.test(raw)) throw new Error('unknown page');
  // Only the viewer's own today-status authorizes a make-up submission.
  const unsigned = /(?:您|你)(?:今天|今日)(?:还没有|尚未|还未|未)签到/.test(textOnly(r.text));
  return {token:extractFormhash(raw), unsigned};
}
async function submit(session, token) {
  const {base, headers} = session;
  const url = base+'/plugin.php?id=k_misign%3Asign&operation=qiandao&formhash='+encodeURIComponent(token)+'&format=empty&inajax=1&ajaxtarget=';
  return fetchText(null, 'GET', url, buildHeaders(headers, {Accept:'*/*', Referer:base+'/k_misign-sign.html', 'X-Requested-With':'XMLHttpRequest','Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty','Cache-Control':'no-cache'}));
}
function definitive(r) {
  if (!(r.status >= 200 && r.status < 300)) return '';
  // Accept short, explicit AJAX replies only. Full pages, rankings, counters,
  // stale rewards, and arbitrary snippets of JavaScript are not receipts.
  const s = htmlDecode(r.text).replace(/^\s*<\?xml[^>]*\?>/i,'').trim().replace(/^<root>\s*([\s\S]*?)\s*<\/root>$/i,'$1').trim();
  if (/^(?:恭喜[您你][，,！! ]*)?(?:[您你]已)?签到成功[！!。.\s]*$/.test(s)) return '签到成功';
  if (/^(?:[您你])?(?:今日|今天)(?:已经|已)签到(?:过)?(?:了)?[！!。.\s]*$/.test(s)) return '今日已签到';
  return '';
}

function ledgerReward(html, day) {
  const raw = String(html || '').replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const when = t => t.startsWith(day+' ') && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(t);
  function receipt(action, reward, time) {
    const amount = reward.match(/^星币\s*\+\s*([1-9]\d*)$/);
    return action === '每日签到' && amount && when(time) ? `${time} 每日签到 · 星币 +${amount[1]}` : '';
  }
  const list = raw.match(/<div\b[^>]*class=["'][^"']*\bcomiis_credits_log\b[^"']*["'][^>]*>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/i);
  if (list) {
    for (const row of list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const amount = row[1].match(/<div\b[^>]*class=["'][^"']*\bcre_mun\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const title = row[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
      if (!amount || !title) continue;
      const fields = [...title[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(x=>textOnly(x[1]));
      const match = receipt(fields[1], textOnly(amount[1]), fields[0] || '');
      if (match) return match;
    }
    return '';
  }
  for (const table of raw.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/操作\s+积分变更\s+详情\s+变更时间/.test(textOnly(table[1]))) continue;
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>textOnly(x[1]));
      if (cells.length !== 4) continue;
      const match = receipt(cells[0], cells[1], cells[3]);
      if (match) return match;
    }
    return '';
  }
  throw new Error('unknown ledger');
}
async function lookupLedger(session, day) {
  const {base, headers} = session;
  const r = await fetchText(null, 'GET', base+'/home.php?mod=spacecp&ac=credit&op=log', buildHeaders(headers, {Referer:base+'/', 'Cache-Control':'no-cache'}));
  if (authRequired(r)) throw Object.assign(new Error('auth'), {code:'AUTH'});
  if (r.status !== 200 || !/member\.php\?mod=logging&action=logout\b/i.test(htmlDecode(r.text))) throw new Error('unknown ledger');
  return ledgerReward(r.text, day);
}

async function ledger(session, day) {
  const reward = await lookupLedger(session, day);
  if (typeof reward !== 'string') throw new Error('unknown ledger');
  return reward.trim();
}

function parseJSON(s) { try { return JSON.parse(s); } catch (_) { return null; } }
async function checkIn(env) {
  const start = new Date();
  const noon = env.MODE === 'noon';
  const race = !noon && start.getHours() === 23 && start.getMinutes() === 59;
  const target = new Date(start);
  if (race) target.setHours(24,0,0,0);
  const day = localDay(target);
  const raw = $persistentStore.read(STORE_KEY);
  const session = parseJSON(raw);
  if (!session || !getHeader(session.headers, 'Cookie')) return authNotice();
  session.base = normalizeBase(session.base);
  // Bind the receipt to this capture, not to a global date. Old sessions
  // already have savedAt; no second copy or hash of credentials is needed.
  const scope = session.captureId || (Number.isFinite(session.savedAt) ? session.base+':'+session.savedAt : '');
  const receipt = parseJSON($persistentStore.read(RECEIPT_KEY));
  if (scope && receipt && receipt.scope === scope && receipt.day === day) return;
  const current = () => localDay() === day && $persistentStore.read(STORE_KEY) === raw;
  function confirmed(title, detail, silent) {
    if (!current()) return notify('状态未确认', '日期或登录信息已变化，未保存签到结果');
    if (scope) $persistentStore.write(JSON.stringify({scope, day}), RECEIPT_KEY);
    if (!silent) notify(title, detail);
  }
  if (!race) {
    const reward = await ledger(session, day);
    if (reward) return confirmed('今日已签到', reward, noon);
  }
  const page = await signPage(session);
  if (!race && !page.unsigned) return notify('状态未确认', '无当日流水，页面也未明确提示本人今日未签到；未提交');
  if (!page.token) return notify('状态未确认', '签到页未取得 formhash；未提交');
  if (race) {
    const wait = target.getTime() - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    if (Date.now() - target.getTime() > 90000) return notify('未提交', '已错过午夜窗口，等待中午核对流水');
  }
  if (!current()) return notify('未提交', '日期或登录信息已变化');
  let auth = false;
  let result = '';
  try {
    const r = await submit(session, page.token);
    auth = authRequired(r);
    if (!auth) result = definitive(r);
  } catch (_) { /* The request might have committed before the timeout. */ }
  if (result && current()) return confirmed(result, day, false);
  // Read-only reconciliation. Never switch endpoints or submit a second time.
  let reward = '';
  try { reward = await ledger(session, day); }
  catch (e) { auth = auth || authError(e); }
  if (reward) return confirmed('今日签到已确认', reward, false);
  if (auth) return authNotice();
  notify('签到结果未确认', '已尝试一次，未查到可确认的当日个人流水；没有重试');
}

(async () => {
  try {
    const env = {};
    const arg = typeof $argument === 'string' ? $argument : '';
    for (const part of arg.split('&')) {
      const i = part.indexOf('=');
      if (i > 0) env[part.slice(0,i)] = decodeURIComponent(part.slice(i+1));
    }
    if (typeof $request !== 'undefined') captureSession($request, env);
    else await checkIn(env);
  } catch (e) {
    if (authError(e)) authNotice();
    else notify('状态未确认', '无法确认页面、流水或本地状态；没有自动重试');
  } finally { $done({}); }
})();
