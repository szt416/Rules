const DEFAULT_BASE = 'https://fengchao.chat';
const DEFAULT_PATH = '/api/check-in';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function buildUrl(ctx) {
  const base = (ctx.env.CHECKIN_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  const path = ctx.env.CHECKIN_PATH || DEFAULT_PATH;
  const url = new URL(path, `${base}/`);
  if (!url.searchParams.has('month')) url.searchParams.set('month', currentMonth());
  return url.toString();
}

function textIncludesAny(text, words) {
  const source = String(text || '').toLowerCase();
  return words.some((word) => source.includes(String(word).toLowerCase()));
}

function compact(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function pickMessage(text, status) {
  if (!text) return `HTTP ${status}`;

  try {
    const data = JSON.parse(text);
    const message = data.message || data.msg || data.error || data.reason;
    if (message) return String(message).slice(0, 220);
    return JSON.stringify(data).slice(0, 220);
  } catch {
    return compact(text) || `HTTP ${status}`;
  }
}

async function readText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function notify(ctx, title, body) {
  if (ctx.env.NOTIFY === 'false') return;
  ctx.notify({ title, body });
}

export default async function(ctx) {
  const cookie = (ctx.env.COOKIE || '').trim();
  if (!cookie) {
    notify(ctx, 'Fengchao check-in failed', 'Set COOKIE in module environment first.');
    return;
  }

  const url = buildUrl(ctx);
  const headers = {
    Cookie: cookie,
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6,ja;q=0.5,ja-JP;q=0.4',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Referer: 'https://fengchao.chat/',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };

  let resp;
  try {
    resp = await ctx.http.get(url, { headers });
  } catch (error) {
    notify(ctx, 'Fengchao check-in error', String(error && error.message ? error.message : error));
    return;
  }

  const status = resp.status || 0;
  const finalUrl = resp.url || url;
  const text = await readText(resp);
  const message = pickMessage(text, status);

  if (status === 401 || status === 403 || finalUrl.includes('/login') || textIncludesAny(text, [
    'login - fengchao',
    '\u767b\u5f55 - \u8702\u5de2',
    '\u8f93\u5165\u90ae\u7bb1',
  ])) {
    notify(ctx, 'Fengchao check-in failed', 'Cookie may be expired. Capture a fresh logged-in Cookie.');
    return;
  }

  if (status < 200 || status >= 300) {
    notify(ctx, 'Fengchao check-in failed', `${status}: ${message}`);
    return;
  }

  if (textIncludesAny(text, [
    'already checked',
    'already signed',
    '\u5df2\u7b7e\u5230',
    '\u4eca\u65e5\u5df2\u7b7e\u5230',
    '\u5df2\u7ecf\u7b7e\u5230',
  ])) {
    notify(ctx, 'Fengchao already checked in', message);
    return;
  }

  notify(ctx, 'Fengchao check-in done', message);
}
