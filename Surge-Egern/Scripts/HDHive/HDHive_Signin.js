/**
 * HDHive 自动签到
 * Egern 原生脚本
 *
 * 普通签到：
 * POST https://hdhive.com/
 * Body: [false]
 *
 * 赌狗签到：
 * POST https://hdhive.com/
 * Body: [true]
 *
 * Next.js Server Action:
 * 40d45889e4bba859ac67c63e5e8b5f78511979a439
 */

export default async function (ctx) {
  const cookie =
    ctx.storage.get("HDHive_Cookie") || "";

  const mode =
    ctx.env.SIGN_MODE || "普通签到";

  if (!cookie) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: "失败",
      body:
        "没有找到已保存的 Cookie。\n" +
        "请开启「Cookie 捕获」，登录 HDHive 并访问首页。"
    });
    return;
  }

  // 普通签到
  if (mode === "普通签到") {
    const result =
      await doSign(ctx, cookie, false);

    ctx.notify({
      title: "HDHive 签到",
      subtitle: "普通签到",
      body: result.message
    });

    return;
  }

  // 赌狗签到
  const gamble =
    await doSign(ctx, cookie, true);

  if (gamble.success) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: "赌狗签到",
      body: gamble.message
    });

    return;
  }

  // 安全验证失败时，再尝试普通签到
  if (gamble.securityError) {
    const normal =
      await doSign(ctx, cookie, false);

    if (normal.success) {
      ctx.notify({
        title: "HDHive 签到",
        subtitle: "赌狗签到失败",
        body:
          "赌狗签到触发安全验证。\n" +
          "已自动尝试普通签到：\n" +
          normal.message
      });
    } else {
      ctx.notify({
        title: "HDHive 签到",
        subtitle: "签到失败",
        body:
          "赌狗：\n" +
          gamble.message +
          "\n\n普通：\n" +
          normal.message
      });
    }

    return;
  }

  ctx.notify({
    title: "HDHive 签到",
    subtitle: "赌狗签到",
    body: gamble.message
  });
}


async function doSign(ctx, cookie, gamble) {
  const ACTION_ID =
    "40d45889e4bba859ac67c63e5e8b5f78511979a439";

  const ROUTER_STATE =
    "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";

  const headers = {
    "Accept":
      "text/x-component",

    "Content-Type":
      "text/plain;charset=UTF-8",

    "Origin":
      "https://hdhive.com",

    "Referer":
      "https://hdhive.com/",

    "next-action":
      ACTION_ID,

    "next-router-state-tree":
      ROUTER_STATE,

    "next-url":
      "/",

    "RSC":
      "1",

    "sec-fetch-site":
      "same-origin",

    "sec-fetch-mode":
      "cors",

    "sec-fetch-dest":
      "empty",

    "Cookie":
      cookie,

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Version/26.6 Mobile/15E148 Safari/604.1",

    "Accept-Language":
      "zh-CN,zh-Hans;q=0.9"
  };

  const body =
    gamble
      ? "[true]"
      : "[false]";

  try {
    const response =
      await ctx.http.post(
        "https://hdhive.com/",
        {
          headers,
          body,
          timeout: 20000,
          credentials: "include"
        }
      );

    const text =
      await response.text();

    return parseResult(
      text,
      response.status
    );

  } catch (error) {
    return {
      success: false,
      securityError: false,
      message:
        "请求异常\n" +
        String(error)
    };
  }
}


function parseResult(text, status) {
  const data =
    String(text || "");

  // 已签到
  if (
    data.includes("你已经签到过了") ||
    data.includes("明天再来") ||
    data.includes("今日已签到") ||
    data.includes("无需重复签到")
  ) {
    return {
      success: true,
      securityError: false,
      message:
        "今日已经签到，无需重复签到。"
    };
  }

  // 安全验证更新
  if (
    data.includes("安全验证已更新") ||
    data.includes("请重试")
  ) {
    return {
      success: false,
      securityError: true,
      message:
        "安全验证已更新，请重试"
    };
  }

  // 登录失效
  if (
    data.includes("未登录") ||
    data.includes("登录失效") ||
    data.includes("Unauthorized") ||
    status === 401
  ) {
    return {
      success: false,
      securityError: false,
      message:
        "登录状态已失效，请重新开启「Cookie 捕获」获取 Cookie。"
    };
  }

  if (status === 403) {
    return {
      success: false,
      securityError: false,
      message:
        "HTTP 403，请重新捕获 Cookie 后再试。"
    };
  }

  // 签到成功
  if (
    data.includes("签到成功") ||
    data.includes('"success":true') ||
    data.includes('"success": true')
  ) {
    return {
      success: true,
      securityError: false,
      message:
        extractMessage(data) ||
        "签到成功"
    };
  }

  const message =
    extractMessage(data);

  if (message) {
    return {
      success: false,
      securityError: false,
      message
    };
  }

  const cleaned =
    data
      .replace(/\s+/g, " ")
      .trim();

  return {
    success: false,
    securityError: false,
    message:
      `HTTP ${status}\n` +
      (
        cleaned
          ? cleaned.slice(0, 220)
          : "服务器响应为空"
      )
  };
}


function extractMessage(data) {
  const patterns = [
    /"description"\s*:\s*"([^"]+)"/,
    /"message"\s*:\s*"([^"]+)"/
  ];

  for (const pattern of patterns) {
    const match =
      data.match(pattern);

    if (
      match &&
      match[1]
    ) {
      return match[1];
    }
  }

  return "";
}
