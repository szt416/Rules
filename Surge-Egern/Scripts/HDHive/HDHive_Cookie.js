/**
 * HDHive 参数捕获
 * Egern 原生脚本
 *
 * 捕获：
 * 1. 完整 Cookie
 * 2. next-action
 * 3. next-router-state-tree
 */

export default async function (ctx) {
  const enabled =
    String(ctx.env.ENABLE_CAPTURE || "false") === "true";

  if (!enabled || !ctx.request) {
    return;
  }

  const headers = ctx.request.headers;

  const cookie =
    headers.get("cookie") || "";

  const actionId =
    headers.get("next-action") || "";

  const routerState =
    headers.get("next-router-state-tree") || "";

  let cookieSaved = false;
  let actionSaved = false;
  let routerSaved = false;

  /*
   * 保存完整 Cookie
   */
  if (
    cookie &&
    cookie.includes("token=") &&
    cookie.includes("refresh_token=") &&
    cookie.includes("hdh_uid=")
  ) {
    ctx.storage.set(
      "HDHive_Cookie",
      cookie
    );

    cookieSaved = true;
  }

  /*
   * Server Action 请求出现时保存动态参数
   */
  if (actionId) {
    ctx.storage.set(
      "HDHive_Action_ID",
      actionId
    );

    actionSaved = true;
  }

  if (routerState) {
    ctx.storage.set(
      "HDHive_Router_State",
      routerState
    );

    routerSaved = true;
  }

  /*
   * 三个参数都已经存在时才提示真正捕获完成
   */
  const savedCookie =
    ctx.storage.get("HDHive_Cookie") || "";

  const savedAction =
    ctx.storage.get("HDHive_Action_ID") || "";

  const savedRouter =
    ctx.storage.get("HDHive_Router_State") || "";

  if (
    savedCookie &&
    savedAction &&
    savedRouter
  ) {
    const signature =
      savedAction + "|" + savedRouter;

    const lastSignature =
      ctx.storage.get("HDHive_Capture_Signature") || "";

    /*
     * 避免一个网页产生几十条重复通知
     */
    if (signature !== lastSignature) {
      ctx.storage.set(
        "HDHive_Capture_Signature",
        signature
      );

      ctx.notify({
        title: "HDHive",
        subtitle: "参数捕获完成",
        body:
          "Cookie：已保存\n" +
          "Server Action：已保存\n" +
          "Router State：已保存\n\n" +
          "现在可以关闭「Cookie 捕获」。"
      });
    }

    return;
  }

  /*
   * 第一次只抓到 Cookie，
   * 提醒用户还需要手动点一次签到
   */
  if (
    cookieSaved &&
    !savedAction
  ) {
    const notified =
      ctx.storage.get("HDHive_Cookie_Only_Notified") || "";

    if (notified !== "1") {
      ctx.storage.set(
        "HDHive_Cookie_Only_Notified",
        "1"
      );

      ctx.notify({
        title: "HDHive",
        subtitle: "Cookie 已获取",
        body:
          "请保持「Cookie 捕获」开启，" +
          "然后在 HDHive 首页手动点击一次你要使用的签到方式，" +
          "以捕获最新 Server Action 参数。"
      });
    }
  }
}
