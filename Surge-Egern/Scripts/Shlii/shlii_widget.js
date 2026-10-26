// Shlii 原生小组件 for Egern
// 仅使用你的 Egern 本地 Env 登录；不会上传或写出账号密码。
const BASE = 'https://shlii.io/api';

function fmtBytes(n) {
  n = Number(n || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
function fmtRate(v) {
  if (v === undefined || v === null || v === '') return '—';
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const m = Number(s) / 1048576;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  return s.replace(/bit$/i, '').replace(/bps$/i, '') || '—';
}
function traffic(i) {
  const used = fmtBytes(i.monthlyTrafficUsed);
  const limit = i.effectiveMonthlyTrafficLimit ?? i.monthlyTrafficLimit;
  return Number(limit) > 0 ? `${used} / ${fmtBytes(limit)}` : `${used} / ∞`;
}
function rate(i) {
  const a = fmtRate(i.limitsIngress), b = fmtRate(i.limitsEgress);
  return a === b ? a : `${a}↓ ${b}↑`;
}
function text(t, size, color, extra = {}) {
  return { type: 'text', text: t, font: { size, ...extra.font }, textColor: color, maxLines: extra.maxLines || 1, minScale: 0.55, textAlign: extra.textAlign };
}

async function request(ctx, path, options = {}) {
  const method = String(options.method || 'GET').toLowerCase();
  if (!ctx.http || typeof ctx.http[method] !== 'function') throw new Error('当前 Egern 版本不支持 ctx.http');
  // Egern 的原生桥接对 options 要求严格：不要给 GET 传入 body: undefined。
  const requestOptions = { headers: options.headers || {}, timeout: 18000, credentials: 'include' };
  if (options.body !== undefined) requestOptions.body = options.body;
  let r;
  const url = `${BASE}${path}`;
  if (method === 'get') r = await ctx.http.get(url, requestOptions);
  else if (method === 'post') r = await ctx.http.post(url, requestOptions);
  else if (method === 'put') r = await ctx.http.put(url, requestOptions);
  else if (method === 'patch') r = await ctx.http.patch(url, requestOptions);
  else if (method === 'delete') r = await ctx.http.delete(url, requestOptions);
  else throw new Error(`不支持的 HTTP 方法：${method}`);
  let data;
  try { data = await r.json(); } catch (_) { data = {}; }
  if (r.status < 200 || r.status >= 300) {
    const err = new Error(data.error || data.message || `HTTP ${r.status}`);
    err.code = data.code;
    err.details = data.details || data;
    throw err;
  }
  return data;
}

export default async function(ctx) {
  const env = ctx.env || {};
  const username = env.SHLII_USERNAME;
  const password = env.SHLII_PASSWORD;
  const savedToken = env.SHLII_ACCESS_TOKEN;
  if (!savedToken && (!username || !password)) {
    return { type: 'widget', padding: 16, backgroundColor: '#111827', children: [
      text('Shlii 服务器', 'headline', '#F9FAFB'),
      text('请填写账号密码，或填写短期 Access Token', 'caption1', '#FBBF24', { maxLines: 2 })
    ] };
  }
  try {
    const headers = { 'Content-Type': 'application/json', 'Accept-Language': 'zh-CN' };
    // 登录成功后把短期访问令牌保存在 Egern 本地存储，避免每次小组件刷新都重新登录。
    // Env 里手动提供的 Token 优先级最高。
    let token = savedToken || await ctx.storage.get('shlii_widget_access_token');
    if (!token) {
      const login = await request(ctx, '/auth/login', {
        method: 'POST', headers,
        body: { username, password, totpCode: env.SHLII_TOTP || undefined, device: 'Egern-Shlii-Widget' }
      });
      token = login.token;
      if (!token) throw new Error('登录接口未返回 token');
      await ctx.storage.set('shlii_widget_access_token', token);
    }
    const data = await request(ctx, '/instances?page=1&pageSize=30&search=', {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'zh-CN' }
    });
    const list = (data.instances || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const family = ctx.widgetFamily || 'systemMedium';
    const capacity = family === 'systemLarge' ? 12 : family === 'systemSmall' ? 2 : 6;
    const rows = list.slice(0, capacity);
    const children = [
      { type: 'stack', direction: 'row', alignItems: 'center', children: [
        text('Shlii 服务器', 'headline', '#F9FAFB'), { type: 'spacer' }, text(`${list.length} 台`, 'caption1', '#93C5FD')
      ] },
      { type: 'stack', direction: 'row', gap: 6, children: [
        text('● 运行中', 'caption2', '#4ADE80'),
        text('带宽 / 本月流量', 'caption2', '#9CA3AF')
      ] }
    ];
    for (const i of rows) {
      const online = String(i.status || '').toLowerCase() === 'running';
      children.push({ type: 'stack', direction: 'row', alignItems: 'center', gap: 5, padding: [3, 0, 3, 0], url: `https://shlii.io/instances/${i.id}`, children: [
        { type: 'image', src: 'sf-symbol:circle.fill', width: 7, height: 7, color: online ? '#4ADE80' : '#FB7185' },
        text(i.name || `实例 ${i.id}`, 'caption1', '#F3F4F6', { maxLines: 1 }),
        { type: 'spacer' },
        text(rate(i), 'caption2', '#93C5FD'),
        text(traffic(i), 'caption2', '#D1D5DB', { textAlign: 'right' })
      ] });
    }
    if (list.length > rows.length) children.push(text(`另有 ${list.length - rows.length} 台未显示；请使用大号小组件。`, 'caption2', '#FBBF24'));
    children.push(text('点击任一行打开 Shlii · 约 10 分钟更新', 'caption2', '#6B7280'));
    return { type: 'widget', children, gap: 5, padding: 14, backgroundColor: '#111827', refreshAfter: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
  } catch (e) {
    return { type: 'widget', padding: 16, backgroundColor: '#111827', children: [
      text('Shlii 服务器', 'headline', '#F9FAFB'),
      text(`更新失败：${e.message || e}`, 'caption1', '#FCA5A5', { maxLines: 3 }),
      text('请检查账号、密码、TOTP 与网络。', 'caption2', '#9CA3AF')
    ], refreshAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  }
}
