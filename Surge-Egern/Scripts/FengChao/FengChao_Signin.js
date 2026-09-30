const SCRIPT_NAME = 'Fengchao Check-in';
const STORE_KEY = 'fengchao_cookie';
const BASE_URL = 'https://fengchao.chat';
const CHECKIN_PATH = '/api/check-in';

function log(message) {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function envTrue(env, key) {
  const value = env && env[key] != null ? String(env[key]).trim().toLowerCase() : '';
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function buildCheckinUrl() {
  const url = new URL(CHECKIN_PATH, BASE_URL);
  url.searchParams.set('month', currentMonth());
  return url.toString();
}

function getHeader(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(lower) || '';
  }

  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === lower) return headers[key];
  }

  return '';
}

function parseCookieString(cookie) {
  const map = {};
  String(cookie || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key) map[key] = value;
    });
  return map;
}

function cookieMapToString(map) {
  return Object.keys(map)
    .map((key) => `${key}=${map[key]}`)
    .join('; ');
}

function mergeSetCookie(baseCookie, headers) {
  const map = parseCookieString(baseCookie);
  let setCookie = getHeader(headers, 'set-cookie');

  if (!setCookie) return baseCookie;
  if (!Array.isArray(setCookie)) {
    setCookie = String(setCookie).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
  }

  for (const item of setCookie) {
    const first = String(item || '').split(';')[0];
    const index = first.indexOf('=');
    if (index <= 0) continue;

    const key = first.slice(0, index).trim();
    const value = first.slice(index + 1).trim();
    if (!key) continue;

    if (value === '') delete map[key];
    else map[key] = value;
  }

  return cookieMapToString(map);
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

function parseMessage(text, status) {
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

function textIncludesAny(text, words) {
  const source = String(text || '').toLowerCase();
  return words.some((word) => source.includes(String(word).toLowerCase()));
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function notify(ctx, subtitle, body) {
  log(`${subtitle}: ${body}`);
  if (!ctx || typeof ctx.notify !== 'function') return;

  try {
    await ctx.notify({
      title: SCRIPT_NAME,
      subtitle,
      body,
      sound: true,
    });
  } catch (error) {
    log(`notify failed: ${error && error.message ? error.message : error}`);
  }
}

async function captureCookie(ctx) {
  const env = (ctx && ctx.env) || {};
  if (!envTrue(env, 'ENABLE_CAPTURE')) {
    log('Cookie capture is disabled');
    return { response: ctx.response };
  }

  const headers = (ctx.request && ctx.request.headers) || {};
  const cookie = String(getHeader(headers, 'cookie') || '').trim();

  if (!cookie) {
    await notify(ctx, 'Cookie capture failed', 'No Cookie header found. Make sure you are logged in.');
    return { response: ctx.response };
  }

  await ctx.storage.set(STORE_KEY, cookie);
  await notify(ctx, 'Cookie saved', 'Cookie has been saved. Turn Cookie Capture off now.');
  return { response: ctx.response };
}

async function doCheckIn(ctx) {
  let cookie = String((await ctx.storage.get(STORE_KEY)) || '').trim();
  if (!cookie) {
    await notify(ctx, 'Missing Cookie', 'Turn Cookie Capture on, log in, and visit fengchao.chat first.');
    return;
  }

  try {
    const url = buildCheckinUrl();
    log(`GET ${url}`);

    const response = await ctx.http.get(url, {
      headers: {
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6,ja;q=0.5,ja-JP;q=0.4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Cookie: cookie,
        Pragma: 'no-cache',
        Referer: `${BASE_URL}/`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      },
      timeout: 20000,
    });

    const mergedCookie = mergeSetCookie(cookie, response.headers || {});
    if (mergedCookie && mergedCookie !== cookie) {
      cookie = mergedCookie;
      await ctx.storage.set(STORE_KEY, cookie);
      log('Cookie updated from Set-Cookie');
    }

    const status = response.status || 0;
    const text = await readText(response);
    const message = parseMessage(text, status);

    log(`HTTP ${status}`);
    log(`Response: ${String(text || '').slice(0, 500)}`);

    if (status === 401 || status === 403 || textIncludesAny(text, [
      'login - fengchao',
      '\u767b\u5f55 - \u8702\u5de2',
      '\u8f93\u5165\u90ae\u7bb1',
    ])) {
      await notify(ctx, 'Cookie expired', 'Please capture a fresh Cookie.');
      return;
    }

    if (textIncludesAny(text, [
      'already checked',
      'already signed',
      '\u5df2\u7b7e\u5230',
      '\u4eca\u65e5\u5df2\u7b7e\u5230',
      '\u5df2\u7ecf\u7b7e\u5230',
    ])) {
      await notify(ctx, 'Already checked in', message);
      return;
    }

    if (!(status >= 200 && status < 300)) {
      await notify(ctx, 'Check-in failed', `${status}: ${message}`);
      return;
    }

    await notify(ctx, 'Check-in done', message);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    log(`Error: ${message}`);
    await notify(ctx, 'Runtime error', message.slice(0, 200));
  }
}

async function main(ctx) {
  const env = (ctx && ctx.env) || {};

  if (String(env.MODE || '').toLowerCase() === 'checkin') {
    await doCheckIn(ctx);
    return;
  }

  if (ctx && ctx.request) {
    return await captureCookie(ctx);
  }

  await doCheckIn(ctx);
}

export default main;
