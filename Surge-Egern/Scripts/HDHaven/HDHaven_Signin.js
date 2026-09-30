/******************************
脚本名称: HDHaven
Version : v0.1.0-probe
更新时间: 2026-09-30
平台: Egern
功能: Cookie 捕获 + 签到接口探测
说明:
1. 打开模块「Cookie」开关
2. Safari 登录 https://hdhaven.com/ 并访问首页
3. 收到 Cookie 保存成功通知后关闭开关
4. 手动运行「HDHaven 签到」测试
5. 本版尚未确认真实签到接口，会依次尝试常见路径
*******************************/

const SCRIPT_NAME = "HDHaven 签到 🎬";
const STORE_KEY = "hdhaven_cookie";
const BASE_URL = "https://hdhaven.com";

const CANDIDATES = [
  { method: "POST", path: "/api/checkin" },
  { method: "POST", path: "/api/user/checkin" },
  { method: "POST", path: "/api/attendance" },
  { method: "POST", path: "/api/signin" },
  { method: "POST", path: "/api/sign-in" },
  { method: "POST", path: "/api/user/signin" }
];

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
  const lower = String(name).toLowerCase();
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
        subtitle,
        body,
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

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSuccess(status, text) {
  const t = normalizeText(text).toLowerCase();

  if (!(status >= 200 && status < 300)) return false;

  return (
    /签到成功|已签到|已经签到|今日已签|check.?in success|checked.?in|successfully checked|sign.?in success/i.test(t) ||
    /"success"\s*:\s*true/i.test(t) ||
    /"code"\s*:\s*(0|200)/i.test(t)
  );
}

function looksLikeAuthFailure(status, text) {
  const t = normalizeText(text).toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    /未登录|请登录|登录失效|unauthorized|forbidden|login required|not authenticated/i.test(t)
  );
}

function looksLikeNotFound(status, text) {
  const t = normalizeText(text).toLowerCase();

  return (
    status === 404 ||
    /not found|cannot post|route not found|不存在/i.test(t)
  );
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
    await notify(
      ctx,
      "Cookie 获取失败",
      "请求中没有 Cookie，请确认已经登录 hdhaven.com"
    );
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

async function getHomeInfo(ctx, cookie) {
  try {
    const response = await ctx.http.get(BASE_URL + "/", {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: cookie,
        Referer: BASE_URL + "/",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      },
      timeout: 20000
    });

    const status = response.status;
    const text = await response.text();

    log("首页 HTTP " + status);
    log("首页响应前 300 字符: " + normalizeText(text).slice(0, 300));

    return { status, text };
  } catch (e) {
    log("首页访问失败: " + (e && e.message ? e.message : e));
    return { status: 0, text: "" };
  }
}

async function tryEndpoint(ctx, cookie, item) {
  const url = BASE_URL + item.path;

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Cookie: cookie,
    Origin: BASE_URL,
    Referer: BASE_URL + "/",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
  };

  try {
    let response;

    if (item.method === "GET") {
      response = await ctx.http.get(url, {
        headers,
        timeout: 15000
      });
    } else {
      response = await ctx.http.post(url, {
        headers,
        body: "{}",
        timeout: 15000
      });
    }

    const status = response.status;
    const text = await response.text();
    const summary = normalizeText(text).slice(0, 300);

    log(item.method + " " + item.path + " => HTTP " + status);
    log("响应: " + summary);

    return {
      ok: true,
      url,
      path: item.path,
      method: item.method,
      status,
      text,
      summary
    };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log(item.method + " " + item.path + " 请求异常: " + msg);

    return {
      ok: false,
      url,
      path: item.path,
      method: item.method,
      status: 0,
      text: "",
      summary: msg
    };
  }
}

async function doCheckIn(ctx) {
  const cookie = String((await ctx.storage.get(STORE_KEY)) || "").trim();

  if (!cookie) {
    await notify(
      ctx,
      "缺少 Cookie",
      "请先打开模块「Cookie」开关，登录 hdhaven.com 后访问首页"
    );
    return;
  }

  // 先确认网站本身能否正常访问
  const home = await getHomeInfo(ctx, cookie);

  if (home.status === 401 || home.status === 403) {
    await notify(
      ctx,
      "Cookie 可能失效",
      "访问首页返回 HTTP " + home.status + "，请重新获取 Cookie"
    );
    return;
  }

  let lastUseful = null;

  for (const item of CANDIDATES) {
    const result = await tryEndpoint(ctx, cookie, item);

    if (!result.ok) {
      lastUseful = result;
      continue;
    }

    if (looksLikeSuccess(result.status, result.text)) {
      await ctx.storage.set("hdhaven_working_endpoint", JSON.stringify({
        method: result.method,
        path: result.path
      }));

      await notify(
        ctx,
        "发现可用签到接口",
        result.method +
          " " +
          result.path +
          "\nHTTP " +
          result.status +
          "\n" +
          (result.summary || "返回成功")
      );
      return;
    }

    if (looksLikeAuthFailure(result.status, result.text)) {
      await notify(
        ctx,
        "需要重新登录",
        result.method +
          " " +
          result.path +
          "\nHTTP " +
          result.status +
          "\n" +
          (result.summary || "认证失败")
      );
      return;
    }

    if (!looksLikeNotFound(result.status, result.text)) {
      lastUseful = result;
    }
  }

  if (lastUseful) {
    await notify(
      ctx,
      "未确认签到接口",
      lastUseful.method +
        " " +
        lastUseful.path +
        "\nHTTP " +
        lastUseful.status +
        "\n" +
        (lastUseful.summary || "请把运行日志发给我")
    );
  } else {
    await notify(
      ctx,
      "未找到常见签到接口",
      "候选接口均未命中。请把 Egern 日志发给我，我再根据返回结果继续定位。"
    );
  }
}

async function main(ctx) {
  const env = (ctx && ctx.env) || {};

  if (String(env.MODE || "").toLowerCase() === "checkin") {
    await doCheckIn(ctx);
    return;
  }

  if (ctx && ctx.request) {
    return await captureCookie(ctx);
  }

  await doCheckIn(ctx);
}

export default main;
