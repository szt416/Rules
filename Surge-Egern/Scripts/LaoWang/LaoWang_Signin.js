/**
 * 老王论坛 k_misign 自动签到
 *
 * Egern Schedule script.
 * Required env:
 *   COOKIE - the complete Cookie header copied from a logged-in browser session
 * Optional env:
 *   BASE_URL - default: https://laowang.vip
 */
export default async function (ctx) {
  const baseURL = (ctx.env.BASE_URL || 'https://laowang.vip').replace(/\/+$/, '');
  const manualCookie = (ctx.env.COOKIE || '').trim();
  const captureEnabled = ctx.env.ENABLE_CAPTURE !== 'false';
  const formhash = (ctx.env.FORMHASH || '44e9d846').trim();

  // Request script: capture the logged-in browser Cookie and keep it in Egern storage.
  if (ctx.request) {
    if (!captureEnabled) {
      console.log('[老王签到] Cookie 抓取开关已关闭');
      return;
    }

    const requestCookie = ctx.request.headers.get('cookie');
    console.log(
      `[老王签到] 捕获请求: ${ctx.request.url || 'unknown'}, Cookie: ${requestCookie ? 'present' : 'missing'}`
    );
    if (requestCookie && requestCookie.includes('=') && requestCookie.length > 20) {
      const previousCookie = ctx.storage.get('laowang_cookie') || '';
      ctx.storage.set('laowang_cookie', requestCookie);
      if (previousCookie !== requestCookie) {
        ctx.notify({
          title: '老王论坛',
          subtitle: 'Cookie 已自动保存',
          body: '已捕获登录 Cookie，可以关闭 Cookie 抓取开关。',
          sound: false,
        });
      }
    } else if (!requestCookie) {
      console.log('[老王签到] 当前请求没有 Cookie，跳过保存');
    }
    return;
  }

  const cookie = manualCookie || (ctx.storage.get('laowang_cookie') || '').trim();

  if (!cookie) {
    ctx.notify({
      title: '老王论坛签到',
      subtitle: '配置错误',
      body: '未捕获到 Cookie，请先登录论坛并访问签到页，或手动填写 COOKIE。',
    });
    return;
  }

  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Cookie: cookie,
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  };

  try {
    // 老王论坛现有脚本使用固定 formhash 直接请求签到接口；
    // 页面本身不稳定地暴露 formhash，不能依赖 HTML 提取。
    const signURL =
      `${baseURL}/plugin.php?id=k_misign:sign` +
      `&operation=qiandao&formhash=${encodeURIComponent(formhash)}` +
      '&format=empty&inajax=1&ajaxtarget=JD_sign';

    const sign = await ctx.http.get(signURL, {
      headers: {
        ...headers,
        Accept: '*/*',
        Referer: `${baseURL}/plugin.php?id=k_misign:sign`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 30000,
      credentials: 'include',
    });
    const rawResult = await sign.text();
    const result = rawResult.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (sign.status >= 300 && sign.status < 400) {
      throw new Error(`签到请求重定向（HTTP ${sign.status}），Cookie 可能已失效`);
    }
    if (/请\s*先\s*登录|登录后使用|action=login/i.test(rawResult)) {
      ctx.storage.delete('laowang_cookie');
      throw new Error('登录状态失效，请重新复制 Cookie');
    }
    if (/验证页面|点击进行验证|tncode|v2_captcha_form|slide_block/i.test(rawResult)) {
      throw new Error('签到请求已到达验证码页面，需要在浏览器中完成 TnCode 滑块验证');
    }

    if (sign.status !== 200) {
      throw new Error(`签到请求失败（HTTP ${sign.status}）`);
    }

    if (/已签到|今天已经签到|今日已签到|重复签到/i.test(result)) {
      ctx.notify({
        title: '老王论坛签到',
        subtitle: '今日已签到',
        body: result || '今天已经完成签到。',
        sound: false,
      });
      return;
    }

    if (/签到成功|恭喜|获得|奖励|连续签到/i.test(result) || result.length === 0) {
      ctx.notify({
        title: '老王论坛签到',
        subtitle: '签到成功',
        body: result || '已完成今日签到。',
      });
      return;
    }

    throw new Error(result || '服务器返回了无法识别的结果');
  } catch (error) {
    ctx.notify({
      title: '老王论坛签到',
      subtitle: '签到失败',
      body: error instanceof Error ? error.message : String(error),
    });
  }
}
