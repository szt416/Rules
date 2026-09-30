/******************************
脚本名称: HDHaven 自动签到
Version : v0.2.0
更新时间: 2026-09-30
平台: Egern

方案:
- 完全按照 HDHive 的 Next.js Server Action 思路
- 手动签到时自动捕获：
  Cookie
  next-action
  next-router-state-tree
  请求 Body
- 定时任务原样重放 POST https://hdhaven.com/

使用:
1. 开启「签到捕获」
2. 登录 hdhaven.com
3. 手动点击一次签到
4. 收到“签到参数捕获成功”通知后关闭捕获
5. 后续每天自动签到
*******************************/

const SCRIPT_NAME = "HDHaven 签到";
const BASE_URL = "https://hdhaven.com/";

const KEY_COOKIE = "HDHaven_Cookie";
const KEY_ACTION = "HDHaven_Action_ID";
const KEY_ROUTER = "HDHaven_Router_State";
const KEY_BODY = "HDHaven_Sign_Body";

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
    if (String(key).toLowerCase() === lower) {
      return headers[key];
    }
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

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksSuccess(text) {
  const t = cleanText(text);

  return (
    /签到成功|已签到|已经签到|今日已签|签到完成/i.test(t) ||
    /check.?in.*success|success.*check.?in/i.test(t) ||
    /"success"\s*:\s*true/i.test(t)
  );
}

function looksAlready(text) {
  return /已签到|已经签到|今日已签|already.*check|already.*sign/i.test(
    cleanText(text)
  );
}

function looksAuthError(status, text) {
  return (
    status === 401 ||
    status === 403 ||
    /未登录|登录失效|请登录|unauthorized|forbidden|login required/i.test(
      cleanText(text)
    )
  );
}

/**
 * 捕获手动签到请求
 *
 * 必须命中：
 * POST https://hdhaven.com/
 * 且存在 next-action
 */
async function captureSignRequest(ctx) {
  const env = (ctx && ctx.env) || {};

  if (!envTrue(env, "ENABLE_CAPTURE")) {
    log("签到捕获已关闭，跳过");
    return { response: ctx.response };
  }

  const req = (ctx && ctx.request) || {};
  const headers = req.headers || {};
  const method = String(req.method || "").toUpperCase();
  const url = String(req.url || "");

  if (method !== "POST") {
    log("非 POST 请求，跳过");
    return { response: ctx.response };
  }

  if (!/^https:\/\/hdhaven\.com\/(?:\?.*)?$/i.test(url)) {
    log("不是 HDHaven 根路径 POST，跳过: " + url);
    return { response: ctx.response };
  }

  const actionId = String(getHeader(headers, "next-action") || "").trim();

  if (!actionId) {
    log("未发现 next-action，不像 Next.js Server Action，跳过");
    return { response: ctx.response };
  }

  const cookie = String(getHeader(headers, "cookie") || "").trim();
  const routerState = String(
    getHeader(headers, "next-router-state-tree") || ""
  ).trim();

  let body = "";

  try {
    if (req.body !== undefined && req.body !== null) {
      body =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
    }
  } catch (_) {}

  if (!body) {
    body = "[false]";
    log("未读取到请求 Body，暂用 HDHive 默认 Body [false]");
  }

  if (!cookie) {
    await notify(
      ctx,
      "捕获失败",
      "发现 next-action，但没有 Cookie"
    );
    return { response: ctx.response };
  }

  await ctx.storage.set(KEY_COOKIE, cookie);
  await ctx.storage.set(KEY_ACTION, actionId);
  await ctx.storage.set(KEY_ROUTER, routerState);
  await ctx.storage.set(KEY_BODY, body);

  log("Cookie 长度: " + cookie.length);
  log("next-action: " + actionId);
  log("router-state 长度: " + routerState.length);
  log("Body: " + body);

  await notify(
    ctx,
    "签到参数捕获成功",
    "已保存 Cookie / next-action / Router State / Body\n请关闭「签到捕获」开关"
  );

  return { response: ctx.response };
}

async function doCheckIn(ctx) {
  const cookie = String((await ctx.storage.get(KEY_COOKIE)) || "").trim();
  const actionId = String((await ctx.storage.get(KEY_ACTION)) || "").trim();
  const routerState = String(
    (await ctx.storage.get(KEY_ROUTER)) || ""
  ).trim();

  let body = String((await ctx.storage.get(KEY_BODY)) || "").trim();

  if (!body) {
    body = "[false]";
  }

  if (!cookie) {
    await notify(
      ctx,
      "缺少 Cookie",
      "请先开启「签到捕获」，手动签到一次"
    );
    return;
  }

  if (!actionId) {
    await notify(
      ctx,
      "缺少 next-action",
      "请开启「签到捕获」，然后在 HDHaven 手动签到一次"
    );
    return;
  }

  const headers = {
    Accept: "text/x-component",
    "Content-Type": "text/plain;charset=UTF-8",
    Origin: "https://hdhaven.com",
    Referer: "https://hdhaven.com/",
    Cookie: cookie,
    "next-action": actionId,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
  };

  if (routerState) {
    headers["next-router-state-tree"] = routerState;
  }

  log("开始执行 Server Action");
  log("next-action: " + actionId);
  log("Body: " + body);

  try {
    const response = await ctx.http.post(BASE_URL, {
      headers: headers,
      body: body,
      timeout: 20000
    });

    const status = response.status;
    const text = await response.text();
    const summary = cleanText(text).slice(0, 500);

    log("HTTP " + status);
    log("响应: " + summary);

    if (looksAlready(text)) {
      await notify(
        ctx,
        "今日已签到",
        summary || "无需重复签到"
      );
      return;
    }

    if (looksSuccess(text)) {
      await notify(
        ctx,
        "签到成功",
        summary || "Server Action 执行成功"
      );
      return;
    }

    if (looksAuthError(status, text)) {
      await notify(
        ctx,
        "登录状态失效",
        "HTTP " + status + "\n请重新开启「签到捕获」并手动签到一次"
      );
      return;
    }

    if (status >= 200 && status < 300) {
      /**
       * Next.js Server Action 很多响应不是标准 JSON，
       * 可能是 RSC 数据流。
       * HTTP 2xx 但未匹配关键词时，不直接误报签到成功。
       */
      await notify(
        ctx,
        "请求已发送",
        "HTTP " +
          status +
          "\n未识别明确签到结果，请查看日志：\n" +
          (summary || "响应为空")
      );
      return;
    }

    await notify(
      ctx,
      "签到失败",
      "HTTP " +
        status +
        "\n" +
        (summary || "请查看 Egern 日志")
    );
  } catch (error) {
    const msg = error && error.message
      ? error.message
      : String(error);

    log("执行异常: " + msg);

    await notify(
      ctx,
      "运行异常",
      msg.slice(0, 200)
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
    return await captureSignRequest(ctx);
  }

  await doCheckIn(ctx);
}

export default main;
