/******************************
脚本名称: 源论坛 YCOO 自动签到
作者：szt416   https://github.com/szt416
平台: Egern
功能: Cookie/请求头捕获 + k_misign 每日签到
版本: v2.4（23:59 预取 formhash，00:00:00 抢签到 + 失败自动兜底）
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
const SCRIPT_VERSION = "2.4";
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

function extractStatValues(html) {
  const s = String(html || "");
  const t = textOnly(s);
  const get = (id) => {
    const re1 = new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`value=["']([^"']*)["'][^>]*id=["']${id}["']`, "i");
    const m = s.match(re1) || s.match(re2);
    return m ? htmlDecode(m[1]).trim() : "";
  };

  let continuous = get("lxdays");
  let total = get("lxtdays");
  const reward = get("lxreward");

  if (!continuous) {
    const m = t.match(/连续签到\s*([0-9]+)\s*天/i);
    if (m) continuous = m[1];
  }
  if (!total) {
    const m = t.match(/累计签到\s*([0-9]+)\s*天/i);
    if (m) total = m[1];
  }

  const rankMatch = t.match(/(?:今日排名|签到排名)[:：]?\s*([0-9]+)/);
  return {
    continuous: continuous !== "" ? Number(continuous) : null,
    total: total !== "" ? Number(total) : null,
    reward: reward || "",
    rank: rankMatch ? Number(rankMatch[1]) : null
  };
}

function extractStats(html) {
  const v = extractStatValues(html);
  const result = [];
  if (Number.isFinite(v.continuous)) result.push(`连续 ${v.continuous} 天`);
  if (Number.isFinite(v.total)) result.push(`累计 ${v.total} 天`);
  if (v.reward) result.push(`奖励 ${v.reward}`);
  if (Number.isFinite(v.rank)) result.push(`排名 ${v.rank}`);
  return result.join(" · ");
}

function statsChanged(before, after) {
  const totalChanged = Number.isFinite(before.total) && Number.isFinite(after.total) && after.total > before.total;
  const continuousChanged = Number.isFinite(before.continuous) && Number.isFinite(after.continuous) && after.continuous > before.continuous;
  return totalChanged || continuousChanged;
}

function formatStatPair(v) {
  const parts = [];
  if (Number.isFinite(v.continuous)) parts.push(`连续 ${v.continuous} 天`);
  if (Number.isFinite(v.total)) parts.push(`累计 ${v.total} 天`);
  return parts.join(" · ") || "未能读取签到天数";
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
  return { httpOK, loggedOut, validPage, statsValues: extractStatValues(check.text), stats: extractStats(check.text), text: check.text, status: check.status };
}


function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

function isRaceWindow() {
  const ms = msUntilNextMidnight();
  // 仅在午夜前 90 秒内进入抢排名等待模式。
  // 手动运行、白天运行仍按普通签到立即执行。
  return ms > 0 && ms <= 90000;
}

async function fetchFreshFormhash(ctx, session) {
  const page = await getSignPage(ctx, session);
  if (page.status === 401 || page.status === 403 || looksLoggedOut(page.text)) {
    return { auth: true, page, formhash: "", stats: extractStatValues(page.text) };
  }
  return {
    auth: false,
    page,
    formhash: extractFormhash(page.text),
    stats: extractStatValues(page.text)
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
    const initial = await fetchFreshFormhash(ctx, session);

    if (initial.auth) {
      notify("Cookie 失效", "当前已退出登录，请重新登录并捕获 Cookie");
      return;
    }

    if (!initial.formhash) {
      notify("获取 formhash 失败", "签到页未找到 formhash，请重新捕获 Cookie 后再试");
      return;
    }

    const before = initial.stats;
    log(`签到前：${formatStatPair(before)}`);
    log(`已获取 formhash: ${initial.formhash}`);

    // 抢排名模式：
    // 模块建议 23:59 触发。若脚本启动时距离本地 00:00:00 不超过 90 秒，
    // 先预取 formhash，然后等待到午夜立即提交。
    if (isRaceWindow()) {
      const waitMs = msUntilNextMidnight();
      log(`抢排名模式：已预取 formhash，距离 00:00:00 约 ${(waitMs / 1000).toFixed(3)} 秒`);
      await sleep(waitMs);
      log("已到 00:00:00，立即发送签到请求");
    } else {
      log("普通签到模式：立即发送签到请求");
    }

    // 第一次：使用预取的 formhash。
    const first = await signPrimary(ctx, session, initial.formhash);
    const firstParsed = parseSignResult(first.text);
    log(`首次签到请求 HTTP ${first.status}`);

    if (firstParsed.auth) {
      notify("Cookie 失效", "服务器要求重新登录，请重新捕获 Cookie");
      return;
    }

    // 签到请求提交后短暂等待，再用天数变化确认是否真正生效。
    await sleep(700);

    let verified = await verifySigned(ctx, session);
    if (verified.status === 401 || verified.status === 403 || verified.loggedOut) {
      notify("Cookie 失效", "签到后复核时已退出登录，请重新捕获 Cookie");
      return;
    }

    let after = verified.statsValues;
    log(`首次复核：${formatStatPair(after)}`);

    if (statsChanged(before, after)) {
      const detail = `签到前：${formatStatPair(before)}\n签到后：${formatStatPair(after)}`;
      notify("签到成功", detail);
      return;
    }

    // 双保险：
    // 23:59 预取的 formhash 如果跨日失效，或第一次请求未真正落库，
    // 立即重新打开签到页获取“00:00 之后”的新 formhash，再补发一次。
    log("首次签到未检测到天数变化，启动兜底：重新获取 formhash");

    const fresh = await fetchFreshFormhash(ctx, session);
    if (fresh.auth) {
      notify("Cookie 失效", "兜底签到时登录状态失效，请重新捕获 Cookie");
      return;
    }

    if (!fresh.formhash) {
      notify(
        "签到未生效",
        `首次请求 HTTP ${first.status}，且兜底时无法获取新 formhash\n签到前：${formatStatPair(before)}\n当前：${formatStatPair(after)}`
      );
      return;
    }

    // 如果重新打开页面时已经能看到天数增加，说明第一次其实成功，只是复核稍慢。
    if (statsChanged(before, fresh.stats)) {
      notify(
        "签到成功",
        `签到前：${formatStatPair(before)}\n签到后：${formatStatPair(fresh.stats)}`
      );
      return;
    }

    log(`已获取跨日新 formhash: ${fresh.formhash}`);
    const second = await signPrimary(ctx, session, fresh.formhash);
    const secondParsed = parseSignResult(second.text);
    log(`兜底签到请求 HTTP ${second.status}`);

    if (secondParsed.auth) {
      notify("Cookie 失效", "兜底签到时服务器要求重新登录，请重新捕获 Cookie");
      return;
    }

    await sleep(1200);

    verified = await verifySigned(ctx, session);
    if (verified.status === 401 || verified.status === 403 || verified.loggedOut) {
      notify("Cookie 失效", "兜底签到复核时已退出登录，请重新捕获 Cookie");
      return;
    }

    after = verified.statsValues;
    log(`兜底复核：${formatStatPair(after)}`);

    if (statsChanged(before, after)) {
      notify(
        "签到成功（兜底）",
        `首次预取 formhash 未生效，已自动使用新 formhash 补签\n签到前：${formatStatPair(before)}\n签到后：${formatStatPair(after)}`
      );
      return;
    }

    notify(
      "签到未生效",
      `两次请求均未检测到签到天数增加\n首次 HTTP ${first.status} · 兜底 HTTP ${second.status}\n签到前：${formatStatPair(before)}\n签到后：${formatStatPair(after)}`
    );
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
