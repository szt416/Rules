/******************************
脚本名称: 药丸论坛 Invites.fun
Version : v0.1.0
更新时间: 2026-09-30
平台: Egern
功能: Cookie 捕获 + 每日签到
说明:
1. 模块打开「Cookie」开关
2. Safari 登录 https://invites.fun/ 并访问首页
3. 提示 Cookie 保存成功后关闭「Cookie」开关
4. 定时由 MINUTE / HOUR 控制，默认每天 00:10
*******************************/

const SCRIPT_NAME = "药丸签到 💊";
const STORE_KEY = "invites_cookie";
const BASE_URL = "https://invites.fun";
const CHECKIN_URL = BASE_URL + "/api/checkin";

function log(msg) {
  console.log("[" + SCRIPT_NAME + "] " + msg);
}

function envTrue(env, key) {
  if (!env || env[key] == null || String(env[key]).trim() === "") return false;
  return ["1", "true", "yes", "on"].includes(
    String(env[key]).trim().toLowerCase()
  );
}

function getHeader(headers, name) {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === lower) return headers[key];
  }
  return "";
}

async function notify(ctx, subtitle, body) {
  log(subtitle + ": " + body);

  if (ctx && typeof ctx.notify === "function") {
    try {
      await ctx.notify({
        title: SCRIPT_NAME,
        subtitle: subtitle,
        body: body,
        sound: true
      });
      return;
    } catch (e) {
      log("ctx.notify 失败: " + (e && e.message ? e.message : e));
    }
  }

  if (typeof $notification !== "undefined" && $notification.post) {
    try {
      $notification.post(SCRIPT_NAME, subtitle, body);
    } catch (_) {}
  }
}

function parseCookieString(cookie) {
  const map = {};
  String(cookie || "")
    .split(";")
    .forEach(part => {
      const index = part.indexOf("=");
      if (index <= 0) return;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key) map[key] = value;
    });
  return map;
}

function cookieMapToString(map) {
  return Object.keys(map)
    .map(key => key + "=" + map[key])
    .join("; ");
}

function mergeSetCookie(baseCookie, headers) {
  const map = parseCookieString(baseCookie);
  let setCookie = getHeader(headers, "set-cookie");

  if (!setCookie) return baseCookie;

  if (!Array.isArray(setCookie)) {
    // 尽量拆分多个 Set-Cookie，同时避开 Expires 内的逗号
    setCookie = String(setCookie).split(/,(?=\s*[^;,=\s]+=[^;,]*)/g);
  }

  for (const item of setCookie) {
    const first = String(item || "").split(";")[0];
    const index = first.indexOf("=");
    if (index <= 0) continue;

    const key = first.slice(0, index).trim();
    const value = first.slice(index + 1).trim();

    if (!key) continue;

    if (value === "") delete map[key];
    else map[key] = value;
  }

  return cookieMapToString(map);
}

function extractSession(html) {
  const text = String(html || "");

  let userId = "";
  let csrfToken = "";

  // 常见 Flarum 页面 session 结构
  let match = text.match(
    /"session"\s*:\s*\{[\s\S]*?"userId"\s*:\s*(\d+)[\s\S]*?"csrfToken"\s*:\s*"([^"]+)"/
  );

  if (match) {
    userId = match[1] || "";
    csrfToken = match[2] || "";
  }

  if (!userId) {
    match = text.match(/"userId"\s*:\s*(\d+)/);
    if (match) userId = match[1] || "";
  }

  if (!csrfToken) {
    match = text.match(/"csrfToken"\s*:\s*"([^"]+)"/);
    if (match) csrfToken = match[1] || "";
  }

  return { userId, csrfToken };
}

async function captureCookie(ctx) {
  const env = (ctx && ctx.env) || {};

  if (!envTrue(env, "ENABLE_CAPTURE")) {
    log("Cookie 捕获开关已关闭，跳过");
    return { response: ctx.response };
  }

  const headers = (ctx.request && ctx.request.headers) || {};
  const cookie = String(getHeader(headers, "cookie") || "").trim();

  if (!cookie) {
    await notify(ctx, "Cookie 获取失败", "请求中没有 Cookie，请确认已经登录 invites.fun");
    return { response: ctx.response };
  }

  await ctx.storage.set(STORE_KEY, cookie);

  log("Cookie 已保存，长度: " + cookie.length);
  await notify(
    ctx,
    "Cookie 获取成功",
    "已保存登录 Cookie，请关闭模块中的「Cookie」开关"
  );

  return { response: ctx.response };
}

async function doCheckIn(ctx) {
  let cookie = String((await ctx.storage.get(STORE_KEY)) || "").trim();

  if (!cookie) {
    await notify(
      ctx,
      "缺少 Cookie",
      "请打开模块「Cookie」开关，登录 invites.fun 后访问首页"
    );
    return;
  }

  try {
    log("开始访问首页获取登录状态与 CSRF Token");

    const home = await ctx.http.get(BASE_URL + "/", {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: cookie,
        Referer: BASE_URL + "/",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      },
      timeout: 20000
    });

    const homeStatus = home.status;
    const html = await home.text();

    if (!(homeStatus >= 200 && homeStatus < 300)) {
      await notify(ctx, "访问失败", "首页 HTTP " + homeStatus);
      return;
    }

    // 合并服务器可能刷新的 Cookie
    const mergedCookie = mergeSetCookie(cookie, home.headers || {});
    if (mergedCookie && mergedCookie !== cookie) {
      cookie = mergedCookie;
      await ctx.storage.set(STORE_KEY, cookie);
      log("已合并并更新服务器返回的 Cookie");
    }

    const session = extractSession(html);

    if (!session.userId || session.userId === "0") {
      await notify(
        ctx,
        "Cookie 已失效",
        "当前不是登录状态，请重新打开「Cookie」开关并访问首页"
      );
      return;
    }

    if (!session.csrfToken) {
      await notify(
        ctx,
        "获取 CSRF 失败",
        "页面中未找到 csrfToken，请查看 Egern 日志"
      );
      log("首页内容长度: " + html.length);
      return;
    }

    log(
      "登录状态正常，userId=" +
        session.userId +
        "，准备执行 POST /api/checkin"
    );

    const response = await ctx.http.post(CHECKIN_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: BASE_URL,
        Referer: BASE_URL + "/",
        "X-Csrf-Token": session.csrfToken,
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      },
      body: "",
      timeout: 20000
    });

    const status = response.status;
    const text = await response.text();

    log("签到接口 HTTP " + status);
    log("签到响应: " + String(text || "").slice(0, 500));

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}

    // 非 2xx：优先识别“已签到”
    if (!(status >= 200 && status < 300)) {
      let message = "";

      if (json && Array.isArray(json.errors)) {
        message = json.errors
          .map(item => item && (item.detail || item.title || ""))
          .filter(Boolean)
          .join("；");
      }

      if (!message && json && typeof json === "object") {
        message = json.message || json.msg || "";
      }

      if (!message) message = String(text || "").slice(0, 180);

      if (/已签到|已经签到|今日已签/i.test(message)) {
        await notify(ctx, "今日已签到", message || "无需重复签到");
        return;
      }

      if (status === 401 || status === 403) {
        await notify(
          ctx,
          "签到失败",
          "HTTP " + status + "，Cookie 或 CSRF 可能已失效"
        );
        return;
      }

      await notify(
        ctx,
        "签到失败",
        message ? "HTTP " + status + " · " + message : "HTTP " + status
      );
      return;
    }

    // 官方签到成功结构：data.attributes
    const attrs =
      json &&
      json.data &&
      json.data.attributes &&
      typeof json.data.attributes === "object"
        ? json.data.attributes
        : null;

    if (!attrs) {
      await notify(
        ctx,
        "响应异常",
        "HTTP 200，但未找到 data.attributes，请查看日志"
      );
      return;
    }

    const days = attrs.totalContinuousCheckIn;
    const money = attrs.money;

    const body = [
      "签到成功",
      days !== undefined && days !== null ? "连续签到：" + days + " 天" : "",
      money !== undefined && money !== null ? "当前药丸：" + money : ""
    ]
      .filter(Boolean)
      .join("\n");

    await notify(ctx, "签到成功", body);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    log("执行异常: " + msg);
    await notify(ctx, "运行异常", msg.slice(0, 200));
  }
}

async function main(ctx) {
  const env = (ctx && ctx.env) || {};

  // 定时任务明确传 MODE=checkin
  if (String(env.MODE || "").toLowerCase() === "checkin") {
    await doCheckIn(ctx);
    return;
  }

  // HTTP Response 脚本用于捕获 Cookie
  if (ctx && ctx.request) {
    return await captureCookie(ctx);
  }

  // 手动直接运行 JS 时也执行签到
  await doCheckIn(ctx);
}

export default main;
