/******************************
脚本名称: 源论坛 YCOO 自动签到
作者：szt416   https://github.com/szt416
平台: Egern
功能: Cookie/请求头捕获 + k_misign 每日签到
版本: v2.2（首次签到兼容，不依赖“补签”按钮）
站点: https://ycoo.net/

使用方法:
1. 在模块设置中打开「Cookie 捕获」
2. 使用 Safari 登录 ycoo.net，并访问「每日签到」页面
   https://ycoo.net/k_misign-sign.html
3. 收到“Cookie 成功”通知后，关闭「Cookie 捕获」
4. 之后由模块按设定时间自动签到
*******************************/

const SCRIPT_NAME = "源论坛签到";
const STORE_KEY = "ycoo_signin_session_v1";
const SCRIPT_VERSION = "2.2";
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

function isUnsignedPage(html) {
  const t = textOnly(html);
  return /您今天还没有签到|今天还没有签到|今日还没有签到|尚未签到/.test(t);
}

function looksLikeSignPage(html) {
  const raw = String(html || "");
  const t = textOnly(raw);
  return /k_misign/i.test(raw) || (
    /每日签到|源签到/.test(t) &&
    /连续签到/.test(t) &&
    /总天数/.test(t)
  );
}

function hasExplicitSignedMarker(html) {
  const t = textOnly(html);
  return /今日已签|今天已经签到|您今天已经签到|您今日已经签到|今日已经签到|已签到/.test(t);
}

function hasMakeupMarker(html) {
  // “补签”只说明页面提供补签能力/存在漏签记录，不能单独证明今天已签到。
  return /补签/.test(textOnly(html));
}

function isAlreadySigned(html) {
  // 核心规则：
  // 1) 明确出现“今天还没有签到” => 未签到；
  // 2) 明确出现“已签到”类文案 => 已签到；
  // 3) 对已登录且结构正常的签到页，只要“未签到”提示消失，也按已签到处理。
  //    这样第一次签到、没有“补签”按钮的新用户也能正确识别。
  if (isUnsignedPage(html)) return false;
  if (hasExplicitSignedMarker(html)) return true;
  if (looksLoggedOut(html)) return false;
  return looksLikeSignPage(html);
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
  // Discuz AJAX 结果有时位于 <script> 内；textOnly() 会移除 script，
  // 因此这里同时检查原始响应，避免 HTTP 200 + 实际成功却被误判。
  const raw = htmlDecode(String(html || ""));
  const t = textOnly(html);
  const probe = `${raw} ${t}`;
  const msg = t || raw.replace(/\s+/g, " ").trim();

  if (/签到成功|恭喜.*签到|签到完成/.test(probe)) return { ok: true, duplicate: false, msg };
  if (/今日已签|今天已经签到|您今天已经签到|您今日已经签到|今日已签到|已经签到过/.test(probe)) return { ok: true, duplicate: true, msg };
  if (/请先登录|尚未登录|未登录/.test(probe)) return { ok: false, auth: true, msg };
  if (/非法字符|formhash.*(错误|失效)|请求来路不正确/.test(probe)) return { ok: false, token: true, msg };
  return { ok: false, msg };
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
  // ycoo 专用 HAR 中实际使用的签到请求：format=empty，ajaxtarget 为空。
  const url = `${base}/plugin.php?id=k_misign%3Asign&operation=qiandao&formhash=${encodeURIComponent(formhash)}&format=empty&inajax=1&ajaxtarget=`;
  const headers = buildHeaders(session.headers, {
    Accept: "*/*",
    Referer: `${base}/k_misign-sign.html`,
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty"
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
  const httpOK = check.status >= 200 && check.status < 400;
  const loggedOut = looksLoggedOut(check.text);
  const validPage = looksLikeSignPage(check.text);
  const unsigned = isUnsignedPage(check.text);
  const explicitSigned = hasExplicitSignedMarker(check.text);
  const makeup = hasMakeupMarker(check.text);

  // “补签”不参与核心成功判定，仅保留用于日志辅助。
  // 真正的成功判据是：HTTP 正常 + 仍处于登录状态 + 签到页结构正常 + “今天还没有签到”提示消失。
  const signed = httpOK && !loggedOut && validPage && !unsigned;

  return {
    signed,
    unsigned,
    explicitSigned,
    makeup,
    loggedOut,
    validPage,
    stats: extractStats(check.text),
    text: check.text,
    status: check.status
  };
}

async function doCheckIn(ctx) {
  log(`开始执行签到任务 v${SCRIPT_VERSION}`);
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

    // 只发送 ycoo 专用 HAR 已验证过的真实签到请求。
    // format=empty 的响应可能没有可读“成功”文本，所以 HTTP 200 后必须重新读取签到页验证。
    const result = await signPrimary(ctx, session, formhash);
    const parsed = parseSignResult(result.text);
    log(`签到接口 HTTP ${result.status}: ${(parsed.msg || "<empty>").slice(0, 180)}`);

    if (parsed.auth) {
      notify("Cookie 失效", "服务器要求重新登录，请重新捕获 Cookie");
      return;
    }

    const verified = await verifySigned(ctx, session);
    log(`签到页复核 HTTP ${verified.status}: ${verified.signed ? "已签到" : (verified.unsigned ? "未签到" : "状态未知")} | 明确已签=${verified.explicitSigned ? "是" : "否"} | 补签=${verified.makeup ? "有" : "无"}`);

    if (verified.signed) {
      notify("签到成功", verified.stats || "今日签到已完成");
      return;
    }

    // 有些 Discuz AJAX 响应直接给出成功提示；作为辅助判据保留。
    if (parsed.ok) {
      notify(parsed.duplicate ? "今日已签" : "签到成功", parsed.duplicate ? "今天已经完成签到" : "源论坛签到完成");
      return;
    }

    if (verified.status === 401 || verified.status === 403 || looksLoggedOut(verified.text)) {
      notify("Cookie 失效", "签到后复核时已退出登录，请重新捕获 Cookie");
      return;
    }

    if (verified.unsigned) {
      notify("签到失败", `签到请求 HTTP ${result.status}，但复核页面仍显示“您今天还没有签到”`);
      return;
    }

    if (!verified.validPage) {
      notify("状态未知", `签到请求 HTTP ${result.status}，但复核页面结构异常，暂不判定成功`);
      return;
    }

    notify("状态未知", `签到请求 HTTP ${result.status}，复核页无法可靠确认签到状态`);
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
