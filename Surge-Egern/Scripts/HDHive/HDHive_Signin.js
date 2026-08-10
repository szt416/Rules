/**
 * HDHive 自动签到
 * Egern 原生脚本
 *
 * 已确认：
 *
 * 普通签到：
 * POST https://hdhive.com/
 * Body: [false]
 *
 * 赌狗签到：
 * POST https://hdhive.com/
 * Body: [true]
 *
 * Server Action:
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

  const ACTION_ID =
    "40d45889e4bba859ac67c63e5e8b5f78511979a439";

  const ROUTER_STATE =
    "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";

  const headers = {
    "Accept": "text/x-component",
    "Content-Type": "text/plain;charset=UTF-8",

    "Origin": "https://hdhive.com",
    "Referer": "https://hdhive.com/",

    "next-action": ACTION_ID,
    "next-router-state-tree": ROUTER_STATE,

    "Cookie": cookie,

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Version/26.6 Mobile/15E148 Safari/604.1",

    "Accept-Language":
      "zh-CN,zh-Hans;q=0.9"
  };

  // 普通签到 = false
  // 赌狗签到 = true
  const body =
    mode === "赌狗签到"
      ? "[true]"
      : "[false]";

  try {
    const response = await ctx.http.post(
      "https://hdhive.com/",
      {
        headers: headers,
        body: body,
        timeout: 20000,
        credentials: "include"
      }
    );

    const text = await response.text();

    const result = parseResult(
      text,
      response.status
    );

    ctx.notify({
      title: "HDHive 签到",
      subtitle: mode,
      body: result
    });

  } catch (error) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: mode,
      body:
        "请求失败\n" +
        String(error)
    });
  }
}


/**
 * 解析 Next.js Server Action 返回值
 */
function parseResult(text, status) {
  const data = String(text || "");

  // 已签到
  if (
    data.includes("你已经签到过了") ||
    data.includes("明天再来") ||
    data.includes("今日已签到")
  ) {
    return "今日已经签到，无需重复签到。";
  }

  // 常规成功
  if (
    data.includes("签到成功") ||
    data.includes('"success":true') ||
    data.includes('"success": true')
  ) {
    return extractMessage(data) || "签到成功";
  }

  // 登录失效
  if (
    data.includes("未登录") ||
    data.includes("登录失效") ||
    data.includes("Unauthorized") ||
    status === 401
  ) {
    return (
      "登录状态已失效。\n" +
      "请重新开启「Cookie 捕获」获取 Cookie。"
    );
  }

  // 权限错误
  if (status === 403) {
    return (
      "HTTP 403\n" +
      "请求被服务器拒绝，请重新捕获 Cookie 后再试。"
    );
  }

  // 尝试从返回值里提取 description/message
  const message = extractMessage(data);

  if (message) {
    return message;
  }

  // 调试用返回
  const cleaned =
    data
      .replace(/\s+/g, " ")
      .trim();

  return (
    `HTTP ${status}\n` +
    (
      cleaned
        ? cleaned.slice(0, 220)
        : "服务器响应为空"
    )
  );
}


/**
 * 从 Flight / JSON 文本里提取可读消息
 */
function extractMessage(data) {
  const patterns = [
    /"description"\s*:\s*"([^"]+)"/,
    /"message"\s*:\s*"([^"]+)"/
  ];

  for (const pattern of patterns) {
    const match = data.match(pattern);

    if (match && match[1]) {
      return match[1];
    }
  }

  return "";
}
