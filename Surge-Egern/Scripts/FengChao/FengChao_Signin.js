const SCRIPT_NAME = '蜂巢签到';
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
    if (data && data.code === 0 && data.data && typeof data.data === 'object') {
      const info = data.data;
      const pointName = info.pointName || '积分';
      const reward = info.checkInReward;
      const currentStreak = info.currentStreak;
      const maxStreak = info.maxStreak;
      const month = info.month;

      return [
        '签到成功',
        month ? `月份：${month}` : '',
        reward !== undefined && reward !== null ? `奖励：${reward} ${pointName}` : '',
        currentStreak !== undefined && currentStreak !== null ? `当前连续：${currentStreak} 天` : '',
        maxStreak !== undefined && maxStreak !== null ? `最高连续：${maxStreak} 天` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

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
    log(`通知失败: ${error && error.message ? error.message : error}`);
  }
}

async function captureCookie(ctx) {
  const env = (ctx && ctx.env) || {};
  if (!envTrue(env, 'ENABLE_CAPTURE')) {
    log('Cookie 捕获开关已关闭，跳过');
    return { response: ctx.response };
  }

  const headers = (ctx.request && ctx.request.headers) || {};
  const cookie = String(getHeader(headers, 'cookie') || '').trim();

  if (!cookie) {
    await notify(ctx, 'Cookie 获取失败', '请求里没有 Cookie，请确认已经登录蜂巢。');
    return { response: ctx.response };
  }

  await ctx.storage.set(STORE_KEY, cookie);
  await notify(ctx, 'Cookie 保存成功', '已保存登录 Cookie，请关闭模块里的「Cookie 捕获」。');
  return { response: ctx.response };
}

async function doCheckIn(ctx) {
  let cookie = String((await ctx.storage.get(STORE_KEY)) || '').trim();
  if (!cookie) {
    await notify(ctx, '缺少 Cookie', '请先打开「Cookie 捕获」，登录蜂巢并访问一次首页。');
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
        Priority: 'u=1, i',
        Referer: `${BASE_URL}/`,
        'Sec-CH-UA': '"Chromium";v="154", "Microsoft Edge";v="154", "Not A(Brand";v="99"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0',
      },
      timeout: 20000,
    });

    const mergedCookie = mergeSetCookie(cookie, response.headers || {});
    if (mergedCookie && mergedCookie !== cookie) {
      cookie = mergedCookie;
      await ctx.storage.set(STORE_KEY, cookie);
      log('已合并并更新服务器返回的 Cookie');
    }

    const status = response.status || 0;
    const text = await readText(response);
    const message = parseMessage(text, status);

    log(`HTTP ${status}`);
    log(`结果: ${message.replace(/\n/g, '；')}`);

    if (status === 401 || status === 403 || textIncludesAny(text, [
      'login - fengchao',
      '登录 - 蜂巢',
      '输入邮箱',
    ])) {
      await notify(ctx, 'Cookie 已失效', '请重新打开「Cookie 捕获」并访问蜂巢首页。');
      return;
    }

    if (textIncludesAny(text, [
      'already checked',
      'already signed',
      '已签到',
      '今日已签到',
      '已经签到',
    ])) {
      await notify(ctx, '今日已签到', message || '无需重复签到。');
      return;
    }

    if (!(status >= 200 && status < 300)) {
      await notify(ctx, '签到失败', `${status}: ${message}`);
      return;
    }

    await notify(ctx, '签到完成', message);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    log(`异常: ${message}`);
    await notify(ctx, '运行异常', message.slice(0, 200));
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
