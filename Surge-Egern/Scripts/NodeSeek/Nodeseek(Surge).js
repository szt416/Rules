/* NodeSeek Surge native v1.0.0 (2026-11-19)
 * Adapted from szt416/Rules NodeSeek_Cookie.js; original credit Roddy-D.
 * Uses only Surge native APIs. Cookie and UA are stored locally, never logged.
 * random=true/false means reward selection, not randomized execution time.
 */
(function () {
  'use strict';
  const BASE = 'https://www.nodeseek.com';
  const KEY = 'NS_SURGE_SESSION_V1';
  const DEFAULT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let secret = '';
  let completed = false;
  function done() { if (!completed) { completed = true; $done({}); } }
  function args() {
    const out = {};
    const raw = typeof $argument === 'string' ? $argument : '';
    raw.split('&').forEach(function (part) {
      const i = part.indexOf('=');
      if (i < 0) return;
      try { out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); }
      catch (_) { throw new Error('模块参数编码无效，请检查配置。'); }
    });
    return out;
  }
  function bool(v, fallback) {
    if (v === undefined || v === '') return fallback;
    if (/^(true|1|yes|on)$/i.test(String(v).trim())) return true;
    if (/^(false|0|no|off)$/i.test(String(v).trim())) return false;
    throw new Error('布尔参数只能填写 true 或 false。');
  }
  function header(headers, name) {
    const k = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
    return k ? String(headers[k] || '') : '';
  }
  function clean(v) {
    let s = String(v == null ? '' : v);
    if (secret) {
      s = s.split(secret).join('[Cookie 已隐藏]');
      secret.split(';').forEach(function (pair) {
        const value = pair.slice(pair.indexOf('=') + 1).trim();
        if (value.length >= 6) s = s.split(value).join('[已隐藏]');
      });
    }
    return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  function notify(subtitle, body) {
    $notification.post('NodeSeek 签到', subtitle, body);
    console.log('[NodeSeek] ' + subtitle);
  }
  function post(options) {
    return new Promise(function (resolve, reject) {
      $httpClient.post(options, function (error, response, data) {
        if (error) reject(new Error('网络请求失败或超时，请在 Surge 请求记录中检查连接。'));
        else resolve({ status: Number(response && response.status), body: String(data || '') });
      });
    });
  }
  async function telegram(a, subtitle, text, ok) {
    if (!a.TG_BOT_TOKEN || !a.TG_USER_ID) return;
    if (ok && bool(a.TG_NOTIFY_ONLY_FAIL, false)) return;
    try {
      const r = await post({
        url: 'https://api.telegram.org/bot' + a.TG_BOT_TOKEN + '/sendMessage',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: a.TG_USER_ID, text: 'NodeSeek · ' + subtitle + '\n' + text, disable_web_page_preview: true }),
        timeout: 10, 'auto-redirect': false, 'auto-cookie': false
      });
      let obj; try { obj = JSON.parse(r.body); } catch (_) {}
      if (r.status !== 200 || !obj || obj.ok !== true) console.log('[NodeSeek] Telegram 推送失败，本地通知已发送。');
    } catch (_) { console.log('[NodeSeek] Telegram 网络异常，本地通知已发送。'); }
  }
  function load() {
    const raw = $persistentStore.read(KEY);
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; }
    catch (_) { throw new Error('Cookie 缓存损坏，请重新抓取。'); }
  }
  function estimate(cookie) {
    const m = cookie.match(/(?:^|;\s*)smac\s*=\s*(\d{10})-/);
    if (!m) return 0;
    const stamp = Number(m[1]) * 1000;
    return stamp > 0 && stamp <= Date.now() + 86400000 ? stamp + 30 * 86400000 : 0;
  }
  function expiryNote(record) {
    const n = Number(record.estimatedExpiry);
    if (!n) return '';
    const h = Math.floor((n - Date.now()) / 3600000);
    if (h > 48) return '';
    return h <= 0
      ? '\n提醒：按原脚本规则估算 Cookie 可能已到期；以实际签到结果为准。'
      : '\n提醒：按原脚本规则估算 Cookie 约 ' + h + ' 小时后到期，建议更新。';
  }
  async function capture(a) {
    if (!bool(a.ENABLE_CAPTURE, true)) return;
    const cookie = header($request.headers, 'cookie').trim();
    secret = cookie;
    if (!cookie) { notify('❌ Cookie 获取失败', '请求中没有 Cookie。请先登录 NodeSeek，再打开个人页面。'); return; }
    const record = {
      cookie: cookie,
      userAgent: header($request.headers, 'user-agent') || DEFAULT_UA,
      capturedAt: Date.now(), estimatedExpiry: estimate(cookie)
    };
    // One JSON write keeps Cookie, UA and its estimate in sync; no partial legacy expiry.
    if (!$persistentStore.write(JSON.stringify(record), KEY)) {
      notify('❌ Cookie 保存失败', 'Surge 本地存储写入失败，请重试。'); return;
    }
    const text = '已保存请求中的 Cookie（未验证登录有效性）。\n可手动运行「NodeSeek 自动签到」验证。\n建议验证后将 ENABLE_CAPTURE 改为 false。';
    notify('✅ Cookie 已保存', text);
    await telegram(a, 'Cookie 已保存', text, true);
  }
  function interpret(status, body) {
    let data; try { data = JSON.parse(body); } catch (_) {}
    const message = data && typeof data === 'object' ? clean(data.message || data.msg || '') : '';
    const already = /(?:今天|今日|本日).{0,12}(?:已|已经).{0,8}签到|(?:已|已经).{0,8}签到|重复签到|already\s+(?:checked[ -]?in|signed[ -]?in)|check[ -]?in.{0,15}already/i;
    const good = /签到成功|成功签到|check[ -]?in\s+(?:successful|success)|signed[ -]?in\s+successfully/i;
    const bad = /签到失败|未登录|未登陆|请.{0,4}登录|请.{0,4}登陆|未签到|尚未签到|not\s+(?:logged|signed)|error|fail|unauthori[sz]ed|invalid|expired/i;
    if (status === 401) return { ok: false, title: '❌ 登录已失效', text: 'HTTP 401。请重新登录 NodeSeek 并抓取 Cookie。' };
    if (status === 403) return { ok: false, title: '⚠️ 请求被拦截', text: 'HTTP 403，可能是 Cloudflare 风控或登录验证。请在相同网络下打开网页确认，必要时重新抓取 Cookie。' };
    if (status >= 500) return { ok: false, title: '❌ 服务器异常', text: 'HTTP ' + status + (message ? '：' + message : '，请稍后手动重试。') };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, title: '⚠️ 无法确认签到结果', text: 'HTTP ' + status + '，响应不是预期 JSON，可能是验证页或跳转。未将其视为成功。' };
    if (message && already.test(message) && !bad.test(message) && status >= 200 && status < 500) return { ok: true, title: 'ℹ️ 今日已签到', text: message };
    if (status < 200 || status >= 300 || data.success === false || bad.test(message)) return { ok: false, title: '❌ 签到失败', text: 'HTTP ' + status + (message ? '：' + message : '，服务端未确认签到成功。') };
    if (data.success === true || good.test(message)) return { ok: true, title: '✅ 签到成功', text: message || '服务端返回 success=true。' };
    return { ok: false, title: '⚠️ 无法确认签到结果', text: message || 'HTTP ' + status + '，缺少明确的签到成功标志，请到网站核实。' };
  }
  async function checkin(a) {
    const random = bool(a.RANDOM_REWARD, true);
    const mode = random ? '随机奖励' : '固定奖励';
    const record = load();
    secret = String(record.cookie || '');
    let result;
    if (!secret) result = { ok: false, title: '❌ 无法签到', text: '没有 Cookie。请将 ENABLE_CAPTURE 设为 true，登录 NodeSeek 后访问个人页面。' };
    else {
      try {
        const r = await post({
          url: BASE + '/api/attendance?random=' + random,
          headers: { Cookie: secret, 'User-Agent': record.userAgent || DEFAULT_UA,
            Origin: BASE, Referer: BASE + '/board', Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json', 'Accept-Language': 'zh-CN,zh;q=0.9' },
          body: '', timeout: 20, 'auto-redirect': false, 'auto-cookie': false
        });
        result = interpret(r.status, r.body);
      } catch (_) { result = { ok: false, title: '⚠️ 网络异常', text: '签到请求失败或超时，未自动重试；请到网站确认结果后再手动运行。' }; }
    }
    const text = '模式：' + mode + '\n' + result.text + expiryNote(record);
    notify(result.title, text);
    await telegram(a, result.title, text, result.ok);
  }
  (async function () {
    try {
      const a = args();
      bool(a.TG_NOTIFY_ONLY_FAIL, false);
      if (typeof $request !== 'undefined') await capture(a);
      else await checkin(a);
    } catch (_) { notify('❌ 脚本执行异常', '请检查模块参数是否为 true/false，或重新抓取 Cookie 后重试。'); }
    finally { done(); }
  })();
})();
