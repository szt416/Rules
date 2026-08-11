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
 * Cookie / next-action / Router State
 * 均由 HDHive_Cookie.js 动态捕获。
 */

export default async function (ctx) {
  let cookie =
    ctx.storage.get("HDHive_Cookie") || "";

  const actionId =
    ctx.storage.get("HDHive_Action_ID") || "";

  const routerState =
    ctx.storage.get("HDHive_Router_State") || "";

  const mode =
    ctx.env.SIGN_MODE || "普通签到";

  /*
   * 参数检查
   */
  if (!cookie) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: "缺少 Cookie",
      body:
        "请开启「Cookie 捕获」，登录 HDHive 并访问首页。"
    });

    return;
  }

  if (!actionId || !routerState) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: "缺少安全参数",
      body:
        "请开启「Cookie 捕获」，然后在 HDHive 首页手动点击一次" +
        mode +
        "，收到「参数捕获完成」通知后关闭捕获。"
    });

    return;
  }

  /*
   * 第一步：
   * 先访问首页，尝试刷新 hdh_sa_token 等短期 Cookie
   */
  cookie =
    await refreshSession(
      ctx,
      cookie
    );

  /*
   * 第二步：
   * 执行用户选择的签到方式
   *
   * 普通 = false
   * 赌狗 = true
   */
  const gamble =
    mode === "赌狗签到";

  let result =
    await performSign(
      ctx,
      cookie,
      actionId,
      routerState,
      gamble
    );

  /*
   * 签到响应可能又刷新了 Cookie
   */
  if (result.cookie) {
    cookie = result.cookie;

    ctx.storage.set(
      "HDHive_Cookie",
      cookie
    );
  }

  /*
   * 如果第一次返回“安全验证已更新”，
   * 再刷新一次首页 Cookie，并仅重试同一种签到一次。
   *
   * 不会自动换成另一种签到。
   */
  if (result.securityUpdated) {
    cookie =
      await refreshSession(
        ctx,
        cookie
      );

    result =
      await performSign(
        ctx,
        cookie,
        actionId,
        routerState,
        gamble
      );

    if (result.cookie) {
      ctx.storage.set(
        "HDHive_Cookie",
        result.cookie
      );
    }
  }

  /*
   * 最终通知
   */
  if (result.securityUpdated) {
    ctx.notify({
      title: "HDHive 签到",
      subtitle: mode,
      body:
        "安全验证参数已更新。\n" +
        "请开启「Cookie 捕获」，在 HDHive 首页手动点击一次" +
        mode +
        "，重新捕获最新参数。"
    });

    return;
  }

  ctx.notify({
    title: "HDHive 签到",
    subtitle: mode,
    body: result.message
  });
}


/**
 * 访问首页刷新短期安全 Cookie
 */
async function refreshSession(
  ctx,
  cookie
) {
  try {
    const response =
      await ctx.http.get(
        "https://hdhive.com/",
        {
          headers: {
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Cookie":
              cookie,

            "User-Agent":
              browserUA(),

            "Accept-Language":
              "zh-CN,zh-Hans;q=0.9"
          },

          timeout: 20000
        }
      );

    const updatedCookie =
      mergeResponseCookies(
        cookie,
        response
      );

    if (updatedCookie !== cookie) {
      ctx.storage.set(
        "HDHive_Cookie",
        updatedCookie
      );
    }

    return updatedCookie;

  } catch (error) {
    /*
     * 首页刷新失败不直接终止签到，
     * 继续尝试使用已有 Cookie。
     */
    return cookie;
  }
}


/**
 * 真正执行签到
 */
async function performSign(
  ctx,
  cookie,
  actionId,
  routerState,
  gamble
) {
  try {
    const response =
      await ctx.http.post(
        "https://hdhive.com/",
        {
          headers: {
            "Accept":
              "text/x-component",

            "Content-Type":
              "text/plain;charset=UTF-8",

            "Origin":
              "https://hdhive.com",

            "Referer":
              "https://hdhive.com/",

            "next-action":
              actionId,

            "next-router-state-tree":
              routerState,

            "Cookie":
              cookie,

            "User-Agent":
              browserUA(),

            "Accept-Language":
              "zh-CN,zh-Hans;q=0.9",

            "sec-fetch-site":
              "same-origin",

            "sec-fetch-mode":
              "cors",

            "sec-fetch-dest":
              "empty"
          },

          body:
            gamble
              ? "[true]"
              : "[false]",

          timeout: 20000
        }
      );

    const text =
      await response.text();

    const updatedCookie =
      mergeResponseCookies(
        cookie,
        response
      );

    const parsed =
      parseResult(
        text,
        response.status
      );

    parsed.cookie =
      updatedCookie;

    return parsed;

  } catch (error) {
    return {
      success: false,
      securityUpdated: false,
      cookie: cookie,
      message:
        "请求异常\n" +
        String(error)
    };
  }
}


/**
 * 将响应中的 Set-Cookie 合并回现有 Cookie
 */
function mergeResponseCookies(
  currentCookie,
  response
) {
  const jar =
    parseCookieHeader(
      currentCookie
    );

  let setCookies = [];

  try {
    setCookies =
      response.headers.getAll(
        "set-cookie"
      ) || [];
  } catch (_) {
    setCookies = [];
  }

  for (const item of setCookies) {
    const firstPart =
      String(item)
        .split(";")[0]
        .trim();

    const index =
      firstPart.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const name =
      firstPart
        .slice(0, index)
        .trim();

    const value =
      firstPart
        .slice(index + 1)
        .trim();

    if (!name) {
      continue;
    }

    /*
     * 空值相当于删除 Cookie
     */
    if (!value) {
      delete jar[name];
    } else {
      jar[name] = value;
    }
  }

  return Object.entries(jar)
    .map(
      ([name, value]) =>
        `${name}=${value}`
    )
    .join("; ");
}


/**
 * Cookie 字符串转对象
 */
function parseCookieHeader(cookie) {
  const jar = {};

  String(cookie || "")
    .split(";")
    .forEach(part => {
      const item =
        part.trim();

      if (!item) {
        return;
      }

      const index =
        item.indexOf("=");

      if (index <= 0) {
        return;
      }

      const name =
        item
          .slice(0, index)
          .trim();

      const value =
        item
          .slice(index + 1)
          .trim();

      if (name) {
        jar[name] = value;
      }
    });

  return jar;
}


/**
 * 解析签到返回
 */
function parseResult(
  text,
  status
) {
  const data =
    String(text || "");

  /*
   * 为了方便识别 Flight / JSON 字符串，
   * 同时生成一个简单解码后的文本版本。
   */
  const readable =
    decodeResponseText(data);

  /*
   * 1. 已签到
   */
  if (
    readable.includes("你已经签到过了") ||
    readable.includes("明天再来") ||
    readable.includes("今日已签到") ||
    readable.includes("无需重复签到")
  ) {
    return {
      success: true,
      securityUpdated: false,
      message:
        "今日已经签到，无需重复签到。"
    };
  }

  /*
   * 2. 安全参数过期 / 更新
   */
  if (
    readable.includes("安全验证已更新") ||
    readable.includes("请重试")
  ) {
    return {
      success: false,
      securityUpdated: true,
      message:
        "安全验证已更新，请重试"
    };
  }

  /*
   * 3. 登录状态失效
   */
  if (
    readable.includes("未登录") ||
    readable.includes("登录失效") ||
    readable.includes("Unauthorized") ||
    status === 401
  ) {
    return {
      success: false,
      securityUpdated: false,
      message:
        "登录状态已失效，请重新开启「Cookie 捕获」。"
    };
  }

  if (status === 403) {
    return {
      success: false,
      securityUpdated: false,
      message:
        "HTTP 403，请重新捕获 Cookie 与安全参数。"
    };
  }

  /*
   * 4. 优先识别：
   *    签到成功，获得 12 积分
   */
  const reward =
    extractSignReward(
      readable
    );

  if (reward !== null) {
    return {
      success: true,
      securityUpdated: false,
      message:
        `签到成功，获得 ${reward} 积分 🎉`
    };
  }

  /*
   * 5. 查找真正与签到有关的 message / description
   *
   * 不再直接拿第一个 description，
   * 防止再次抓到「TG 通知广告」。
   */
  const signMessage =
    extractSignMessage(
      data
    );

  if (signMessage) {
    return {
      success: true,
      securityUpdated: false,
      message:
        signMessage
    };
  }

  /*
   * 6. 明确签到成功
   */
  if (
    readable.includes("签到成功") ||
    readable.includes('"success":true') ||
    readable.includes('"success": true') ||
    data.includes('"success":true') ||
    data.includes('"success": true')
  ) {
    return {
      success: true,
      securityUpdated: false,
      message:
        "签到成功 🎉"
    };
  }

  /*
   * 7. 其他后端信息
   *
   * 仅提取非广告、非无关内容。
   */
  const message =
    extractUsefulMessage(
      data
    );

  if (message) {
    return {
      success: false,
      securityUpdated: false,
      message
    };
  }

  /*
   * 8. 最后才输出原始响应片段
   */
  const cleaned =
    readable
      .replace(/\s+/g, " ")
      .trim();

  return {
    success: false,
    securityUpdated: false,
    message:
      `HTTP ${status}\n` +
      (
        cleaned
          ? cleaned.slice(0, 220)
          : "服务器响应为空"
      )
  };
}


/**
 * 尝试把 Next.js / JSON 中的一些转义字符还原
 */
function decodeResponseText(data) {
  return String(data || "")
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, code) => {
      try {
        return String.fromCharCode(
          parseInt(code, 16)
        );
      } catch (_) {
        return _;
      }
    });
}


/**
 * 从整个响应中直接提取签到奖励积分
 *
 * 支持：
 * 签到成功，获得12积分
 * 签到成功, 获得 12 积分
 * 获得 12 积分
 * +12 积分
 */
function extractSignReward(data) {
  const patterns = [
    /签到成功[，,\s：:]*获得\s*\+?(\d+)\s*积分/i,
    /签到[^\n"\\]{0,30}获得\s*\+?(\d+)\s*积分/i,
    /获得\s*\+?(\d+)\s*积分/i
  ];

  for (const pattern of patterns) {
    const match =
      data.match(pattern);

    if (
      match &&
      match[1]
    ) {
      return Number(
        match[1]
      );
    }
  }

  return null;
}


/**
 * 专门从 message / description 中寻找签到相关文本
 */
function extractSignMessage(data) {
  const values =
    extractMessageValues(
      data
    );

  for (const value of values) {
    const text =
      decodeResponseText(
        value
      ).trim();

    if (!text) {
      continue;
    }

    if (isIgnoredMessage(text)) {
      continue;
    }

    /*
     * 如果里面直接包含积分，
     * 优先格式化。
     */
    const reward =
      extractSignReward(
        text
      );

    if (reward !== null) {
      return (
        `签到成功，获得 ${reward} 积分 🎉`
      );
    }

    /*
     * 只允许明显与签到有关的字段
     */
    if (
      text.includes("签到成功") ||
      text.includes("签到完成") ||
      text.includes("已经签到") ||
      text.includes("已签到") ||
      (
        text.includes("签到") &&
        text.includes("积分")
      )
    ) {
      return text;
    }
  }

  return "";
}


/**
 * 提取其他有用 message / description
 */
function extractUsefulMessage(data) {
  const values =
    extractMessageValues(
      data
    );

  for (const value of values) {
    const text =
      decodeResponseText(
        value
      ).trim();

    if (!text) {
      continue;
    }

    if (isIgnoredMessage(text)) {
      continue;
    }

    /*
     * 普通过长页面内容不作为通知
     */
    if (text.length > 150) {
      continue;
    }

    return text;
  }

  return "";
}


/**
 * 提取所有 message / description，而不是只取第一个
 */
function extractMessageValues(data) {
  const results = [];

  const pattern =
    /"(?:description|message)"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  let match;

  while (
    (
      match =
        pattern.exec(data)
    ) !== null
  ) {
    if (match[1]) {
      results.push(
        match[1]
      );
    }
  }

  return results;
}


/**
 * 过滤和签到无关的页面内容
 */
function isIgnoredMessage(text) {
  const ignored = [
    "TG 通知广告",
    "TG通知广告",
    "通知广告",
    "Telegram 广告",
    "Telegram广告",
    "广告"
  ];

  return ignored.some(
    keyword =>
      text.includes(keyword)
  );
}


/**
 * 与实际抓包保持一致
 */
function browserUA() {
  return (
    "Mozilla/5.0 " +
    "(iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
    "AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) " +
    "Version/26.6 Mobile/15E148 Safari/604.1"
  );
}
