// NodeSeek Surge adaptation. Based on szt416/Rules NodeSeek_Cookie.js (Roddy-D original).
// Credentials stay in this device's Surge storage and are sent only to www.nodeseek.com.
(function () {
  const KEY = 'Szt16.NodeSeek.Cookie', UA = 'Szt16.NodeSeek.UserAgent', RESULT = 'Szt16.NodeSeek.LastResult';
  const arg = String(typeof $argument === 'string' ? $argument : '');
  const random = !/(?:^|&)random=false(?:&|$)/.test(arg);
  const notify = (subtitle, body) => $notification.post('NodeSeek 签到', subtitle, body);
  const finish = (ok, message) => {
    $persistentStore.write(JSON.stringify({ok, message, time:Date.now()}), RESULT);
    notify(ok ? '签到完成' : '需要处理', message);
    $done({});
  };
  if (typeof $request !== 'undefined') {
    // Only the authenticated account-info endpoint is eligible for capture.
    if (!/^https:\/\/www\.nodeseek\.com\/api\/account\/getInfo\/\d+(?:\?.*)?$/.test($request.url || '')) return $done({});
    const headers = $request.headers || {};
    const header = name => { const k = Object.keys(headers).find(k => k.toLowerCase() === name); return k ? headers[k] : ''; };
    const cookie = header('cookie');
    if (!cookie) return $done({});
    if (cookie !== $persistentStore.read(KEY)) {
      if (!$persistentStore.write(cookie, KEY)) { notify('Cookie 保存失败', '请检查 Surge 存储状态。'); return $done({}); }
      const ua = header('user-agent'); if (ua) $persistentStore.write(ua, UA);
      notify('Cookie 已更新', '登录信息仅保存在本机 Surge；每日 00:10 自动签到。');
    }
    return $done({});
  }
  const cookie = $persistentStore.read(KEY);
  if (!cookie) return finish(false, '尚未保存 Cookie。请在此设备浏览器登录 NodeSeek，然后打开自己的个人资料页面一次。');
  $httpClient.post({
    url:'https://www.nodeseek.com/api/attendance?random='+random,
    headers:{Cookie:cookie, 'User-Agent':$persistentStore.read(UA)||'Mozilla/5.0', Origin:'https://www.nodeseek.com', Referer:'https://www.nodeseek.com/board', Accept:'application/json', 'Content-Type':'application/json'},
    body:'', timeout:20
  }, (error, response, body) => {
    if (error) return finish(false, '网络请求失败，请稍后重试。');
    const status = Number(response && (response.status || response.statusCode));
    let data; try { data=JSON.parse(body); } catch (_) { return finish(false, status===403 ? '请求被风控拦截，请在浏览器正常访问 NodeSeek 后再试。' : '接口未返回 JSON，未确认签到成功（HTTP '+status+'）。'); }
    const message = typeof data.message === 'string' ? data.message : '';
    const already = /已(?:经)?签(?:过)?到|重复签到|already.*(?:check|sign|attend)/i.test(message);
    if (status===401 || /未登录|登录失效|登录过期|请.*登录|unauthenticated|unauthorized/i.test(message)) return finish(false, '登录已失效，请重新登录 NodeSeek 并打开自己的个人资料页以更新 Cookie。');
    if (status===403) return finish(false, '服务器拒绝请求，请在浏览器检查登录状态和风控提示。');
    if (already) return finish(true, message);
    if (status>=200 && status<300 && data.success===true) return finish(true, message || '服务器确认签到成功。');
    return finish(false, message || ('未确认签到成功（HTTP '+status+'）。'));
  });
})();
