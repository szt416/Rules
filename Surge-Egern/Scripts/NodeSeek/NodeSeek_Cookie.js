/*
 * NodeSeek 签到增强版 · Egern 原生脚本
 * 原 Surge 模块/脚本作者：Roddy-D
 * Egern 原生适配：使用 ctx.http / ctx.storage / ctx.notify / ctx.env
 *
 * 功能：
 * 1. 访问 NodeSeek 个人信息接口时抓取 Cookie
 * 2. 从 smac 推算 Session 30 天过期时间
 * 3. Cookie 过期前 48 小时提醒
 * 4. 定时签到
 * 5. 固定保底 / 随机奖励模式
 * 6. 可选 Telegram Bot 推送
 */

const COOKIE_CACHE_KEY = "NS_COOKIE";
const COOKIE_EXPIRY_KEY = "NS_COOKIE_EXPIRY";

function isValidValue(value) {
  if (value === undefined || value === null) return false;

  const s = String(value).trim();

  if (!s) return false;

  const lower = s.toLowerCase();

  return (
    s !== "xxx" &&
    s !== "无" &&
    lower !== "none" &&
    lower !== "null"
  );
}

function parseBool(value, fallback = false) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const s = String(value)
    .trim()
    .toLowerCase();

  return (
    s === "true" ||
    s === "1" ||
    s === "yes" ||
    s === "on"
  );
}

function formatDate(date) {
  const y = date.getFullYear();

  const M = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const d = String(
    date.getDate()
  ).padStart(2, "0");

  const h = String(
    date.getHours()
  ).padStart(2, "0");

  const m = String(
    date.getMinutes()
  ).padStart(2, "0");

  return `${y}-${M}-${d} ${h}:${m}`;
}

function escapeHtml(unsafe) {
  if (typeof unsafe !== "string") {
    return String(unsafe ?? "");
  }

  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendTgNotify(
  ctx,
  text,
  tgToken,
  tgUserId
) {
  if (
    !isValidValue(tgToken) ||
    !isValidValue(tgUserId)
  ) {
    return;
  }

  const tgUrl =
    `https://api.telegram.org/bot${tgToken}/sendMessage`;

  try {
    const resp = await ctx.http.post(
      tgUrl,
      {
        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          chat_id: String(tgUserId),
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        }),

        timeout: 15000
      }
    );

    if (resp.status !== 200) {
      let body = "";

      try {
        body = await resp.text();
      } catch (_) {}

      console.log(
        `[TG_Notify] ❌ TG 推送失败, HTTP ${resp.status}, 响应: ${body}`
      );
    }
  } catch (error) {
    const errStr =
      error?.message || String(error);

    console.log(
      `[TG_Notify] ❌ TG 推送网络异常: ${errStr}`
    );
  }
}

async function handleCaptureCookie(ctx) {
  const enableCapture = parseBool(
    ctx.env?.ENABLE_CAPTURE,
    true
  );

  if (!enableCapture) {
    console.log(
      "[NS签到] Cookie 抓取开关已关闭，跳过。"
    );

    return;
  }

  const cookie =
    ctx.request?.headers?.get("cookie");

  if (!cookie) {
    console.log(
      "[NS签到] ⚠️ 未能从请求头中提取 Cookie。"
    );

    ctx.notify({
      title: "NS Cookie 获取失败",

      body:
        "未能从请求中找到 Cookie，请确认已登录 NodeSeek 后重新访问个人页面。"
    });

    return;
  }

  ctx.storage.set(
    COOKIE_CACHE_KEY,
    cookie
  );

  let expiryDateStr = "未知";

  try {
    const smacMatch =
      cookie.match(/smac\s*=\s*(\d+)-/);

    if (smacMatch?.[1]) {
      const loginTimestamp =
        parseInt(
          smacMatch[1],
          10
        ) * 1000;

      const expiryTimestamp =
        loginTimestamp +
        2592000000;

      ctx.storage.set(
        COOKIE_EXPIRY_KEY,
        String(expiryTimestamp)
      );

      expiryDateStr =
        formatDate(
          new Date(expiryTimestamp)
        );

      console.log(
        `[NS签到] ✨ 已缓存 Session 预计过期时间: ${expiryDateStr}`
      );
    } else {
      console.log(
        "[NS签到] ⚠️ Cookie 中未找到 smac 时间戳，无法预估过期时间。"
      );
    }
  } catch (e) {
    console.log(
      `[NS签到] ⚠️ 计算过期时间失败: ${e?.message || e}`
    );
  }

  console.log(
    `[NS签到] ✨ Cookie 已保存: ${cookie.slice(0, 30)}...`
  );

  ctx.notify({
    title: "NS Cookie 获取成功",

    body:
      `Cookie 已保存。\n` +
      `Session 预计过期时间：${expiryDateStr}\n` +
      `抓取成功后建议关闭「Cookie 抓取」开关。`
  });
}

async function checkCookieExpiry(
  ctx,
  tgToken,
  tgUserId
) {
  const cachedExpiry =
    ctx.storage.get(
      COOKIE_EXPIRY_KEY
    );

  if (!cachedExpiry) {
    console.log(
      "[NS签到] 未检测到 Cookie 过期时间缓存，跳过过期检测。"
    );

    return;
  }

  const expiryMs =
    parseInt(
      cachedExpiry,
      10
    );

  if (Number.isNaN(expiryMs)) {
    return;
  }

  const now =
    Date.now();

  const remainMs =
    expiryMs - now;

  const remainHours =
    remainMs /
    (1000 * 60 * 60);

  const expiryDateStr =
    formatDate(
      new Date(expiryMs)
    );

  if (remainMs <= 0) {
    const warnMsg =
      `Session Cookie 已于 ${expiryDateStr} 过期，` +
      `签到可能失败！请重新登录 NodeSeek 并抓取 Cookie。`;

    console.log(
      `[NS签到] 🔴 ${warnMsg}`
    );

    ctx.notify({
      title: "NS签到警告",

      subtitle:
        "🔴 Cookie 已过期",

      body:
        warnMsg
    });

    await sendTgNotify(
      ctx,

      `<b>🔴 NodeSeek Cookie 已过期</b>\n\n` +
      `过期时间: <code>${expiryDateStr}</code>\n` +
      `请重新登录 NodeSeek 并重新抓取 Cookie。`,

      tgToken,
      tgUserId
    );

  } else if (
    remainHours < 48
  ) {
    const hours =
      Math.floor(
        remainHours
      );

    const warnMsg =
      `Session Cookie 将在约 ${hours} 小时后过期` +
      `（${expiryDateStr}），请尽快重新登录 NodeSeek 刷新 Cookie！`;

    console.log(
      `[NS签到] 🟡 ${warnMsg}`
    );

    ctx.notify({
      title: "NS签到警告",

      subtitle:
        "🟡 Cookie 即将过期",

      body:
        warnMsg
    });

    await sendTgNotify(
      ctx,

      `<b>🟡 NodeSeek Cookie 即将过期</b>\n\n` +
      `剩余时间: <code>约 ${hours} 小时</code>\n` +
      `过期时间: <code>${expiryDateStr}</code>\n` +
      `建议重新登录 NodeSeek 并重新抓取 Cookie。`,

      tgToken,
      tgUserId
    );

  } else {
    const days =
      Math.floor(
        remainHours / 24
      );

    console.log(
      `[NS签到] ✅ Cookie 状态正常，剩余约 ${days} 天（${expiryDateStr} 过期）`
    );
  }
}

async function processResponse(
  ctx,
  resp,
  notifyOnlyFail,
  tgToken,
  tgUserId
) {
  const status =
    resp.status;

  let body = "";

  try {
    body =
      await resp.text();
  } catch (_) {}

  let msg = "";

  try {
    const obj =
      JSON.parse(body);

    msg =
      obj?.message
        ? String(obj.message)
        : "";

    console.log(
      `[NS签到] JSON message: ${msg || "无"}`
    );

  } catch (_) {
    console.log(
      `[NS签到] 响应体非 JSON: ${String(body).slice(0, 150)}`
    );
  }

  const content =
    msg ||
    String(body).slice(0, 150) ||
    "服务端未返回任何有效内容";

  if (
    status >= 200 &&
    status < 300
  ) {
    const notifyStr =
      msg ||
      "您已签到成功或已经签过到了";

    console.log(
      `[NS签到] ✅ 签到响应成功: ${notifyStr}`
    );

    ctx.notify({
      title: "NS活动签到",

      subtitle:
        "✅ 签到成功",

      body:
        notifyStr
    });

    if (!notifyOnlyFail) {
      await sendTgNotify(
        ctx,

        `<b>🎉 NodeSeek 自动签到成功</b>\n\n` +
        `状态码: ${status}\n` +
        `返回信息：\n` +
        `<code>${escapeHtml(notifyStr)}</code>`,

        tgToken,
        tgUserId
      );
    }

    return;
  }

  if (status === 403) {
    const notifyStr =
      `遭受 Cloudflare 或系统风控，请稍后重试\n` +
      `拦截详情：${content}`;

    console.log(
      `[NS签到] ⚠️ 403 风控拦截: ${notifyStr}`
    );

    ctx.notify({
      title: "NS活动签到",

      subtitle:
        "⚠️ 403 风控拦截",

      body:
        notifyStr
    });

    await sendTgNotify(
      ctx,

      `<b>⚠️ NodeSeek 签到被风控拦截(403)</b>\n\n` +
      `拦截信息详情：\n` +
      `<code>${escapeHtml(content)}</code>`,

      tgToken,
      tgUserId
    );

    return;
  }

  if (status === 500) {
    const notifyStr =
      `服务器发生内部报错(500)\n` +
      `内容：${content}`;

    console.log(
      `[NS签到] ❌ 500 错误: ${notifyStr}`
    );

    ctx.notify({
      title: "NS活动签到",

      subtitle:
        "❌ 服务器内部错误",

      body:
        notifyStr
    });

    await sendTgNotify(
      ctx,

      `<b>❌ NodeSeek 签到服务器错误(500)</b>\n\n` +
      `错误信息详情：\n` +
      `<code>${escapeHtml(content)}</code>`,

      tgToken,
      tgUserId
    );

    return;
  }

  const notifyStr =
    `请求返回异常状态码: ${status}\n` +
    `内容：${content}`;

  console.log(
    `[NS签到] ❓ 未知异常: ${notifyStr}`
  );

  ctx.notify({
    title: "NS活动签到",

    subtitle:
      `❓ 未知请求异常 (${status})`,

    body:
      notifyStr
  });

  await sendTgNotify(
    ctx,

    `<b>❓ NodeSeek 签到未知异常状态 (${status})</b>\n\n` +
    `异常信息详情：\n` +
    `<code>${escapeHtml(content)}</code>`,

    tgToken,
    tgUserId
  );
}

async function handleCheckin(ctx) {
  const tgToken =
    isValidValue(
      ctx.env?.TG_BOT_TOKEN
    )
      ? String(
          ctx.env.TG_BOT_TOKEN
        ).trim()
      : "";

  const tgUserId =
    isValidValue(
      ctx.env?.TG_USER_ID
    )
      ? String(
          ctx.env.TG_USER_ID
        ).trim()
      : "";

  const notifyOnlyFail =
    parseBool(
      ctx.env?.TG_NOTIFY_ONLY_FAIL,
      false
    );

  const useRandomReward =
    parseBool(
      ctx.env?.RANDOM_REWARD,
      false
    );

  await checkCookieExpiry(
    ctx,
    tgToken,
    tgUserId
  );

  const envCookie =
    isValidValue(
      ctx.env?.NS_COOKIE
    )
      ? String(
          ctx.env.NS_COOKIE
        ).trim()
      : "";

  const finalCookie =
    envCookie ||
    ctx.storage.get(
      COOKIE_CACHE_KEY
    );

  if (!finalCookie) {
    const msg =
      "未检测到 NodeSeek Cookie。" +
      "请开启「Cookie 抓取」，登录 NodeSeek 并访问个人页面一次。";

    console.log(
      `[NS签到] 📉 ${msg}`
    );

    ctx.notify({
      title: "NS签到结果",

      subtitle:
        "❌ 无法签到",

      body:
        msg
    });

    await sendTgNotify(
      ctx,

      "<b>❌ NodeSeek 签到失败</b>\n\n" +
      "原因: <code>未检测到 NodeSeek Cookie，请检查模块配置或重新抓取。</code>",

      tgToken,
      tgUserId
    );

    return;
  }

  const url =
    `https://www.nodeseek.com/api/attendance?random=${useRandomReward}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Version/18.0 Mobile/15E148 Safari/604.1",

    Origin:
      "https://www.nodeseek.com",

    Referer:
      "https://www.nodeseek.com/board",

    Accept:
      "application/json, text/plain, */*",

    "Accept-Language":
      "zh-CN,zh;q=0.9,en;q=0.8",

    "Content-Type":
      "application/json",

    Cookie:
      finalCookie
  };

  try {
    const resp =
      await ctx.http.post(
        url,
        {
          headers,

          body:
            "",

          timeout:
            20000
        }
      );

    await processResponse(
      ctx,
      resp,
      notifyOnlyFail,
      tgToken,
      tgUserId
    );

  } catch (error) {
    const errStr =
      error?.message ||
      String(error);

    console.log(
      `[NS签到] 网络请求异常: ${errStr}`
    );

    ctx.notify({
      title: "NS签到结果",

      subtitle:
        "⚠️ 网络请求异常",

      body:
        errStr
    });

    await sendTgNotify(
      ctx,

      `<b>⚠️ NodeSeek 签到系统/网络异常</b>\n\n` +
      `详细信息:\n` +
      `<code>${escapeHtml(errStr)}</code>`,

      tgToken,
      tgUserId
    );
  }
}

export default async function (ctx) {
  // HTTP Request 脚本：抓取 Cookie
  if (ctx.request) {
    await handleCaptureCookie(ctx);
    return;
  }

  // Schedule 脚本：执行签到
  await handleCheckin(ctx);
}
