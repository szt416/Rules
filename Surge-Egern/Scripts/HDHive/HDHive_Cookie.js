/**
 * HDHive Cookie 捕获
 * Egern 原生脚本
 *
 * ENABLE_CAPTURE = true  时捕获
 * ENABLE_CAPTURE = false 时完全跳过
 */

export default async function (ctx) {
  const enabled =
    String(ctx.env.ENABLE_CAPTURE || "false") === "true";

  // 捕获关闭时，同时复位通知状态
  if (!enabled) {
    ctx.storage.set("HDHive_Capture_Notified", "0");
    return;
  }

  if (!ctx.request) {
    return;
  }

  const cookie = ctx.request.headers.get("cookie") || "";

  // 必须至少包含 HDHive 登录所需的主要字段
  if (
    !cookie.includes("token=") ||
    !cookie.includes("refresh_token=") ||
    !cookie.includes("hdh_uid=")
  ) {
    return;
  }

  // 保存完整 Cookie
  ctx.storage.set("HDHive_Cookie", cookie);

  // 避免打开一次网页连续弹几十条通知
  const notified =
    ctx.storage.get("HDHive_Capture_Notified") || "0";

  if (notified !== "1") {
    ctx.storage.set("HDHive_Capture_Notified", "1");

    ctx.notify({
      title: "HDHive",
      subtitle: "Cookie 获取成功",
      body:
        `Cookie 长度：${cookie.length}\n` +
        "请返回模块设置并关闭「Cookie 捕获」。"
    });
  }
}
