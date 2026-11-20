/*
 * Surge 脚本通知历史查看器
 * 读取由接入 NOTICE_HISTORY_KEY 的脚本保存的最近通知。
 */
const NOTICE_HISTORY_KEY = 'surge_script_notice_history_v1';
const LIMIT = 10;
function parse(s) { try { return JSON.parse(s); } catch (_) { return []; } }
function timeText(ts) {
  const d = new Date(Number(ts) || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function clean(s) { return String(s || '').replace(/\s+$/g, ''); }
function show() {
  const raw = $persistentStore.read(NOTICE_HISTORY_KEY);
  const all = parse(raw);
  const list = Array.isArray(all) ? all.slice(-LIMIT).reverse() : [];
  if (!list.length) {
    console.log('[通知历史] 暂无记录；需要先运行接入历史记录的脚本。');
    $notification.post('脚本通知历史', '暂无记录', '需要先运行接入历史记录的脚本');
    return;
  }
  const text = list.map((x, i) => {
    const head = `${i + 1}. ${timeText(x.time)} · ${x.source || '脚本'} · ${x.title || ''}`;
    const sub = x.subtitle ? `\n${clean(x.subtitle)}` : '';
    const body = x.body ? `\n${clean(x.body)}` : '';
    console.log(head + sub + body);
    return head + sub + body;
  }).join('\n\n');
  $notification.post('脚本通知历史', `最近 ${list.length} 条`, text.slice(0, 3500));
}
try { show(); } catch (e) {
  console.log('[通知历史] 读取失败：' + (e.message || e));
  $notification.post('脚本通知历史', '读取失败', String(e.message || e));
}
$done({});
