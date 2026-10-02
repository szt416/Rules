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
  const cookie = (ctx.env.COOKIE || '').trim();

  if (!cookie) {
    ctx.notify({
      title: '老王论坛签到',
      subtitle: '配置错误',
      body: '未设置 COOKIE，请在 Egern 模块环境变量中填入登录 Cookie。',
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
    const page = await ctx.http.get(`${baseURL}/sign.php`, {
      headers,
      timeout: 30000,
      credentials: 'include',
    });
    const pageBody = await page.text();

    if (page.status >= 300 && page.status < 400) {
      throw new Error(`签到页重定向（HTTP ${page.status}），Cookie 可能已失效`);
    }
    if (/请\s*先\s*登录|登录后使用|action=login/i.test(pageBody)) {
      throw new Error('登录状态失效，请重新复制 Cookie');
    }

    // Discuz 页面通常以隐藏 input 提供 formhash，也兼容单引号和无引号写法。
    const formhashMatch = pageBody.match(
      /name\s*=\s*["']formhash["'][^>]*value\s*=\s*["']([^"']+)["']/i
    ) || pageBody.match(
      /value\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']formhash["']/i
    );

    if (!formhashMatch) {
      throw new Error('未找到 formhash，页面结构可能已变化或 Cookie 无效');
    }

    const formhash = encodeURIComponent(formhashMatch[1]);
    const signURL =
      `${baseURL}/plugin.php?id=k_misign%3Asign` +
      `&operation=qiandao&formhash=${formhash}` +
      '&format=empty&inajax=1&ajaxtarget=JD_sign';

    const sign = await ctx.http.get(signURL, {
      headers: {
        ...headers,
        Accept: '*/*',
        Referer: `${baseURL}/sign.php`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 30000,
      credentials: 'include',
    });
    const rawResult = await sign.text();
    const result = rawResult.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (sign.status !== 200) {
      throw new Error(`签到请求失败（HTTP ${sign.status}）`);
    }
    if (/验证页面|点击进行验证|tncode|v2_captcha_form/i.test(rawResult)) {
      throw new Error('站点要求点击验证码，Egern 原生定时脚本无法自动完成，请手动打开签到页验证');
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
