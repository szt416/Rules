/* PingMe Cookie 捕获 · Surge 原生版
 * 保留原版存储键 pingme_capture_v3 和通知文案。
 */
const STORE_KEY = 'pingme_capture_v3';
const NOTICE_HISTORY_KEY = 'surge_script_notice_history_v1';
const arg = String(typeof $argument === 'string' ? $argument : '');
const captureDisabled = /^(?:DISABLE|DisablePingMeCookie)=true$/i.test(arg);
function recordNotice(title, subtitle, body) {
  try {
    const old = JSON.parse($persistentStore.read(NOTICE_HISTORY_KEY) || '[]');
    const list = Array.isArray(old) ? old : [];
    list.push({time:Date.now(), source:'PingMe Cookie', title:String(title || ''), subtitle:String(subtitle || ''), body:String(body || '')});
    $persistentStore.write(JSON.stringify(list.slice(-30)), NOTICE_HISTORY_KEY);
  } catch (_) {}
}
function notify(title, subtitle, body) {
  recordNotice(title, subtitle, body);
  if (typeof $notification !== 'undefined' && $notification.post) $notification.post(title, subtitle || '', body || '');
}
function rawQuery(url) {
  const q = (String(url).split('?')[1] || '').split('#')[0], out = {};
  q.split('&').forEach(pair => { if (!pair) return; const i=pair.indexOf('='); if (i>0) out[pair.slice(0,i)] = pair.slice(i+1); });
  return out;
}
try {
  const url = String(($request && $request.url) || '');
  if (!captureDisabled && /^https:\/\/api\.pingmeapp\.net\/app\/queryBalanceAndBonus(?:\?|$)/i.test(url)) {
    const capture = {url, paramsRaw:rawQuery(url), headers:Object.assign({}, ($request && $request.headers) || {})};
    const ok = $persistentStore.write(JSON.stringify(capture), STORE_KEY);
    if (ok) {
      notify('PingMe 获取成功✅', '现在你可以禁用此配置了', '');
      console.log('PingMe Cookie 参数已保存');
    } else notify('PingMe 获取失败❗️', 'Surge 本地存储写入失败', '');
  }
} catch (e) {
  console.log('获取Cookie脚本运行出现错误：' + (e.message || e));
  notify('获取Cookie脚本运行出现错误❗️', '', '');
}
$done({});
