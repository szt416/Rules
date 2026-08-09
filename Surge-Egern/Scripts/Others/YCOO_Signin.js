/******************************
脚本名称: 源论坛 YCOO 自动签到
平台: Egern
功能: Cookie/请求头捕获 + k_misign 每日签到
站点: https://ycoo.net/

使用方法:
1. 在模块设置中打开「Cookie 捕获」
2. 使用 Safari 登录 ycoo.net，并访问「源签到」页面
   https://ycoo.net/k_misign-sign.html
3. 收到“Cookie 成功”通知后，关闭「Cookie 捕获」
4. 之后由模块按设定时间自动签到
*******************************/

const SCRIPT_NAME = "源论坛签到";
const STORE_KEY = "ycoo_signin_session_v1";
const DEFAULT_BASE = "https://ycoo.net";

const CAPTURE_HEADER_KEYS = [
  "Cookie",
  "User-Agent",
  "Accept",
  "Accept-Language",
  "Sec-Fetch-Site",
  "Sec-Fetch-Mode",
  "Sec-Fetch-Dest",
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Platform",
  "DNT"
];

function log(msg) {
  console.log(`[${SCRIPT_NAME}] ${msg}`);
}

function notify(subtitle, body) {
  log(`${subtitle}: ${body}`);
  if (typeof $notification !== "undefined" && $notification.post) {
    $notification.post(SCRIPT_NAME, subtitle, body);
  }
}

function envTrue(env, key) {
  if (!env || env[key] == null) return false;
  return ["1", "true", "yes", "on"].includes(String(env[key]).trim().toLowerCase());
}

function getHeader(headers, key) {
  if (!headers) return "";
  const wanted = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === wanted) return headers[k];
  }
  return "";
}

function pickHeaders(headers) {
  const out = {};
  for (const key of CAPTURE_HEADER_KEYS) {
    const value = getHeader(headers, key);
    if (value) out[key] = value;
  }
  return out;
}

function normalizeBase(url) {
  const m = String(url || "").match(/^https:\/\/([^/]+)/i);
  if (!m) return DEFAULT_BASE;
  const host = m[1].toLowerCase();
  if (host === "www.ycoo.net") return "https://www.ycoo.net";
  return DEFAULT_BASE;
}

function buildHeaders(saved, extra) {
  const headers = Object.assign({}, saved || {});
  headers["User-Agent"] = headers["User-Agent"] || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  headers["Accept-Language"] = headers["Accept-Language"] || "zh-CN,zh-Hans;q=0.9";
  headers["Accept"] = headers["Accept"] || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  delete headers["Host"];
  delete headers["Connection"];
  delete headers["Content-Length"];
  delete headers["Accept-Encoding"];
  return Object.assign(headers, extra || {});
}

function htmlDecode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function textOnly(html) {
  return htmlDecode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractFormhash(html) {
  const s = String(html || "");
  const patterns = [
    /name=["']formhash["'][^>]*value=["']([0-9a-zA-Z]+)["']/i,
    /value=["']([0-9a-zA-Z]+)["'][^>]*name=["']formhash["']/i,
    /formhash=([0-9a-zA-Z]{6,})/i,
    /["']formhash["']\s*[:=]\s*["']([0-9a-zA-Z]+)["']/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return "";
}

function isAlreadySigned(html) {
  const t = textOnly(html);
  return /今日已签|今天已经签到|您今天已经签到|您今日已经签到|今日已经签到|今日已签到/.test(t);
}

function looksLoggedOut(html) {
  const s = String(html || "");
  const t = textOnly(s);
  return /member\.php\?mod=logging&action=login/i.test(s) && /立即注册|登录/.test(t);
}

function extractStats(html) {
  const s = String(html || "");
  const result = [];
  const get = (id) => {
    const re1 = new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`value=["']([^"']*)["'][^>]*id=["']${id}["']`, "i");
    const m = s.match(re1) || s.match(re2);
    return m ? htmlDecode(m[1]).trim() : "";
  };

  const lxdays = get("lxdays");
  const lxreward = get("lxreward");
  const lxtdays = get("lxtdays");
  if (lxdays) result.push(`连续 ${lxdays} 天`);
  if (lxtdays) result.push(`累计 ${lxtdays} 天`);
  if (lxreward) result.push(`奖励 ${lxreward}`);

  const rank = textOnly(s).match(/签到排名[:：]?\s*(\d+)/);
  if (rank) result.push(`排名 ${rank[1]}`);

  return result.join(" · ");
}

function parseSignResult(html) {
  const t = textOnly(html);
  if (/签到成功|恭喜.*签到|签到完成/.test(t)) return { ok: true, duplicate: false, msg: t };
  if (/今日已签|今天已经签到|您今天已经签到|您今日已经签到|今日已签到|已经签到过/.test(t)) return { ok: true, duplicate: true, msg: t };
  if (/请先登录|尚未登录|未登录/.test(t)) return { ok: false, auth: true, msg: t };
  if (/非法字符|formhash.*(错误|失效)|请求来路不正确/.test(t)) return { ok: false, token: true, msg: t };
  return { ok: false, msg: t };
}

async function fetchText(ctx, method, url, headers, body) {
  const options = { headers, timeout: 15000 };
  if (body != null) options.body = body;
  const response = method === "POST"
    ? await ctx.http.post(url, options)
    : await ctx.http.get(url, options);
  const text = await response.text();
  return { status: response.status, text };
}

async function captureSession(ctx) {
  if (!envTrue((ctx && ctx.env) || {}, "ENABLE_CAPTURE")) {
    log("Cookie 捕获已关闭，跳过");
    return { response: ctx.response };
  }

  const request = (ctx && ctx.request) || {};
  const headers = pickHeaders(request.headers || {});
  const cookie = getHeader(headers, "Cookie");
  if (!cookie) {
    notify("Cookie 失败", "当前请求没有 Cookie，请先登录源论坛后重新打开签到页");
    return { response: ctx.response };
  }

  const payload = {
    base: normalizeBase(request.url),
    headers,
    savedAt: Date.now()
  };

  await ctx.storage.set(STORE_KEY, JSON.stringify(payload));
  notify("Cookie 成功", "登录信息已保存，请关闭模块中的「Cookie 捕获」开关");
  return { response: ctx.response };
}

async function loadSession(ctx) {
  const raw = await ctx.storage.get(STORE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !data.headers || !getHeader(data.headers, "Cookie")) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function getSignPage(ctx, session) {
  const base = session.base || DEFAULT_BASE;
  const url = `${base}/k_misign-sign.html`;
  const headers = buildHeaders(session.headers, {
    Referer: `${base}/`
  });
  return await fetchText(ctx, "GET", url, headers);
}

async function signPrimary(ctx, session, formhash) {
  const base = session.base || DEFAULT_BASE;
  const url = `${base}/plugin.php?id=k_misign%3Asign&operation=qiandao&inajax=1&ajaxtarget=JD_sign&formhash=${encodeURIComponent(formhash)}`;
  const headers = buildHeaders(session.headers, {
    Accept: "*/*",
    Referer: `${base}/k_misign-sign.html`,
    "X-Requested-With": "XMLHttpRequest"
  });
  return await fetchText(ctx, "GET", url, headers);
}

async function signFallback(ctx, session, formhash) {
  const base = session.base || DEFAULT_BASE;
  const url = `${base}/k_misign-sign.html?operation=qiandao&format=button&formhash=${encodeURIComponent(formhash)}&inajax=1&ajaxtarget=midaben_sign`;
  const headers = buildHeaders(session.headers, {
    Accept: "*/*",
    Referer: `${base}/k_misign-sign.html`,
    "X-Requested-With": "XMLHttpRequest"
  });
  return await fetchText(ctx, "GET", url, headers);
}

async function signMobilePost(ctx, session, formhash) {
  const base = session.base || DEFAULT_BASE;
  const url = `${base}/plugin.php?id=k_misign%3Asign&mobile=2`;
  const body = `id=k_misign%3Asign&operation=qiandao&formhash=${encodeURIComponent(formhash)}`;
  const headers = buildHeaders(session.headers, {
    Accept: "*/*",
    Referer: `${base}/k_misign-sign.html`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
  });
  return await fetchText(ctx, "POST", url, headers, body);
}

async function verifySigned(ctx, session) {
  const check = await getSignPage(ctx, session);
  return {
    signed: check.status >= 200 && check.status < 400 && isAlreadySigned(check.text),
    stats: extractStats(check.text),
    text: check.text,
    status: check.status
  };
}

async function doCheckIn(ctx) {
  log("开始执行签到任务");
  const session = await loadSession(ctx);
  if (!session) {
    notify("缺少 Cookie", "请打开「Cookie 捕获」，登录 ycoo.net 后访问源签到页面");
    return;
  }

  try {
    const page = await getSignPage(ctx, session);
    if (page.status === 401 || page.status === 403) {
      notify("Cookie 失效", `签到页返回 HTTP ${page.status}，请重新捕获 Cookie`);
      return;
    }

    if (isAlreadySigned(page.text)) {
      notify("今日已签", extractStats(page.text) || "今天已经完成签到");
      return;
    }

    const formhash = extractFormhash(page.text);
    if (!formhash) {
      if (looksLoggedOut(page.text)) {
        notify("Cookie 失效", "当前已退出登录，请重新登录并捕获 Cookie");
      } else {
        notify("获取 formhash 失败", "签到页未找到 formhash，请重新捕获 Cookie 后再试");
      }
      return;
    }

    log(`已获取 formhash: ${formhash}`);

    // 方式 1：源论坛历史 HAR 模板使用的标准 k_misign 接口
    let result = await signPrimary(ctx, session, formhash);
    let parsed = parseSignResult(result.text);
    log(`主接口 HTTP ${result.status}: ${parsed.msg.slice(0, 180)}`);

    if (parsed.auth) {
      notify("Cookie 失效", "服务器要求重新登录，请重新捕获 Cookie");
      return;
    }

    let verified = await verifySigned(ctx, session);
    if (parsed.ok || verified.signed) {
      notify(parsed.duplicate ? "今日已签" : "签到成功", verified.stats || (parsed.duplicate ? "今天已经完成签到" : "源论坛签到完成"));
      return;
    }

    // 方式 2：k_misign 常见伪静态签到接口
    log("主接口未确认成功，尝试兼容接口");
    result = await signFallback(ctx, session, formhash);
    parsed = parseSignResult(result.text);
    log(`兼容接口 HTTP ${result.status}: ${parsed.msg.slice(0, 180)}`);

    verified = await verifySigned(ctx, session);
    if (parsed.ok || verified.signed) {
      notify(parsed.duplicate ? "今日已签" : "签到成功", verified.stats || "源论坛签到完成");
      return;
    }

    // 方式 3：当前站点移动端页面可见的 POST 形式，作为最后兜底
    log("兼容接口仍未确认成功，尝试移动端 POST 接口");
    result = await signMobilePost(ctx, session, formhash);
    parsed = parseSignResult(result.text);
    log(`移动端接口 HTTP ${result.status}: ${parsed.msg.slice(0, 180)}`);

    verified = await verifySigned(ctx, session);
    if (parsed.ok || verified.signed) {
      notify(parsed.duplicate ? "今日已签" : "签到成功", verified.stats || "源论坛签到完成");
      return;
    }

    const msg = parsed.msg ? parsed.msg.slice(0, 120) : `HTTP ${result.status}`;
    notify("签到失败", msg || "服务器未返回可识别的签到结果");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log(msg);
    notify("网络错误", msg.slice(0, 160));
  }
}

async function main(ctx) {
  const env = (ctx && ctx.env) || {};
  if (String(env.MODE || "").toLowerCase() === "checkin") {
    await doCheckIn(ctx);
    return;
  }

  if (ctx && ctx.request) {
    return await captureSession(ctx);
  }

  await doCheckIn(ctx);
}

export default main;
