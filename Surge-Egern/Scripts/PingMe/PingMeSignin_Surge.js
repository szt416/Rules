/*
 * PingMe 自动化签到 + 视频奖励 · Surge 原生版
 * 基于 fmz200/wool_scripts 原版 PingMeSignin.js
 * 保留原版接口、签名、奖励流程和通知文案。
 */
const NAME = 'PingMe签到';
const STORE_KEY = 'pingme_capture_v3';
const SECRET = '0fOiukQq7jXZV2GRi9LGlO';
const MAX_VIDEO = 5;
const VIDEO_DELAY = 8000;
const ICON = 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/apps/PingMe.png';

function notify(title, subtitle, body) {
  if (typeof $notification !== 'undefined' && $notification.post) {
    $notification.post(title, subtitle || '', body || '');
  }
}
function parseJSON(s) { try { return JSON.parse(s); } catch (_) { return null; } }
function pad(n) { return String(n).padStart(2, '0'); }

function md5(string) {
  function rotateLeft(l, s) { return (l << s) | (l >>> (32 - s)); }
  function addUnsigned(x, y) {
    const x4 = x & 0x40000000, y4 = y & 0x40000000;
    const x8 = x & 0x80000000, y8 = y & 0x80000000;
    const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
    if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) return (result & 0x40000000) ? result ^ 0xC0000000 ^ x8 ^ y8 : result ^ 0x40000000 ^ x8 ^ y8;
    return result ^ x8 ^ y8;
  }
  function f(x,y,z) { return (x & y) | ((~x) & z); }
  function g(x,y,z) { return (x & z) | (y & (~z)); }
  function h(x,y,z) { return x ^ y ^ z; }
  function i(x,y,z) { return y ^ (x | (~z)); }
  function ff(a,b,c,d,x,s,ac) { return addUnsigned(rotateLeft(addUnsigned(a,addUnsigned(addUnsigned(f(b,c,d),x),ac)),s),b); }
  function gg(a,b,c,d,x,s,ac) { return addUnsigned(rotateLeft(addUnsigned(a,addUnsigned(addUnsigned(g(b,c,d),x),ac)),s),b); }
  function hh(a,b,c,d,x,s,ac) { return addUnsigned(rotateLeft(addUnsigned(a,addUnsigned(addUnsigned(h(b,c,d),x),ac)),s),b); }
  function ii(a,b,c,d,x,s,ac) { return addUnsigned(rotateLeft(addUnsigned(a,addUnsigned(addUnsigned(i(b,c,d),x),ac)),s),b); }
  const len = string.length, words = Array(((Math.floor((len + 8) / 64) + 1) * 16) - 1).fill(0);
  let byte = 0;
  while (byte < len) { words[Math.floor(byte / 4)] |= string.charCodeAt(byte) << ((byte % 4) * 8); byte++; }
  words[Math.floor(byte / 4)] |= 0x80 << ((byte % 4) * 8);
  words[words.length - 1] = len << 3; words[words.length] = len >>> 29;
  function hex(v) { let out=''; for (let n=0;n<4;n++) { const b=(v >>> (n*8)) & 255; out += ('0'+b.toString(16)).slice(-2); } return out; }
  let a=0x67452301,b=0xEFCDAB89,c=0x98BADCFE,d=0x10325476;
  for (let k=0;k<words.length;k+=16) {
    const aa=a,bb=b,cc=c,dd=d;
    a=ff(a,b,c,d,words[k],7,0xD76AA478); d=ff(d,a,b,c,words[k+1],12,0xE8C7B756); c=ff(c,d,a,b,words[k+2],17,0x242070DB); b=ff(b,c,d,a,words[k+3],22,0xC1BDCEEE);
    a=ff(a,b,c,d,words[k+4],7,0xF57C0FAF); d=ff(d,a,b,c,words[k+5],12,0x4787C62A); c=ff(c,d,a,b,words[k+6],17,0xA8304613); b=ff(b,c,d,a,words[k+7],22,0xFD469501);
    a=ff(a,b,c,d,words[k+8],7,0x698098D8); d=ff(d,a,b,c,words[k+9],12,0x8B44F7AF); c=ff(c,d,a,b,words[k+10],17,0xFFFF5BB1); b=ff(b,c,d,a,words[k+11],22,0x895CD7BE);
    a=ff(a,b,c,d,words[k+12],7,0x6B901122); d=ff(d,a,b,c,words[k+13],12,0xFD987193); c=ff(c,d,a,b,words[k+14],17,0xA679438E); b=ff(b,c,d,a,words[k+15],22,0x49B40821);
    a=gg(a,b,c,d,words[k+1],5,0xF61E2562); d=gg(d,a,b,c,words[k+6],9,0xC040B340); c=gg(c,d,a,b,words[k+11],14,0x265E5A51); b=gg(b,c,d,a,words[k],20,0xE9B6C7AA);
    a=gg(a,b,c,d,words[k+5],5,0xD62F105D); d=gg(d,a,b,c,words[k+10],9,0x02441453); c=gg(c,d,a,b,words[k+15],14,0xD8A1E681); b=gg(b,c,d,a,words[k+4],20,0xE7D3FBC8);
    a=gg(a,b,c,d,words[k+9],5,0x21E1CDE6); d=gg(d,a,b,c,words[k+14],9,0xC33707D6); c=gg(c,d,a,b,words[k+3],14,0xF4D50D87); b=gg(b,c,d,a,words[k+8],20,0x455A14ED);
    a=gg(a,b,c,d,words[k+13],5,0xA9E3E905); d=gg(d,a,b,c,words[k+2],9,0xFCEFA3F8); c=gg(c,d,a,b,words[k+7],14,0x676F02D9); b=gg(b,c,d,a,words[k+12],20,0x8D2A4C8A);
    a=hh(a,b,c,d,words[k+5],4,0xFFFA3942); d=hh(d,a,b,c,words[k+8],11,0x8771F681); c=hh(c,d,a,b,words[k+11],16,0x6D9D6122); b=hh(b,c,d,a,words[k+14],23,0xFDE5380C);
    a=hh(a,b,c,d,words[k+1],4,0xA4BEEA44); d=hh(d,a,b,c,words[k+4],11,0x4BDECFA9); c=hh(c,d,a,b,words[k+7],16,0xF6BB4B60); b=hh(b,c,d,a,words[k+10],23,0xBEBFBC70);
    a=hh(a,b,c,d,words[k+13],4,0x289B7EC6); d=hh(d,a,b,c,words[k],11,0xEAA127FA); c=hh(c,d,a,b,words[k+3],16,0xD4EF3085); b=hh(b,c,d,a,words[k+6],23,0x04881D05);
    a=hh(a,b,c,d,words[k+9],4,0xD9D4D039); d=hh(d,a,b,c,words[k+12],11,0xE6DB99E5); c=hh(c,d,a,b,words[k+15],16,0x1FA27CF8); b=hh(b,c,d,a,words[k+2],23,0xC4AC5665);
    a=ii(a,b,c,d,words[k],6,0xF4292244); d=ii(d,a,b,c,words[k+7],10,0x432AFF97); c=ii(c,d,a,b,words[k+14],15,0xAB9423A7); b=ii(b,c,d,a,words[k+5],21,0xFC93A039);
    a=ii(a,b,c,d,words[k+12],6,0x655B59C3); d=ii(d,a,b,c,words[k+3],10,0x8F0CCC92); c=ii(c,d,a,b,words[k+10],15,0xFFEFF47D); b=ii(b,c,d,a,words[k+1],21,0x85845DD1);
    a=ii(a,b,c,d,words[k+8],6,0x6FA87E4F); d=ii(d,a,b,c,words[k+15],10,0xFE2CE6E0); c=ii(c,d,a,b,words[k+6],15,0xA3014314); b=ii(b,c,d,a,words[k+13],21,0x4E0811A1);
    a=ii(a,b,c,d,words[k+4],6,0xF7537E82); d=ii(d,a,b,c,words[k+11],10,0xBD3AF235); c=ii(c,d,a,b,words[k+2],15,0x2AD7D2BB); b=ii(b,c,d,a,words[k+9],21,0xEB86D391);
    a=addUnsigned(a,aa); b=addUnsigned(b,bb); c=addUnsigned(c,cc); d=addUnsigned(d,dd);
  }
  return (hex(a)+hex(b)+hex(c)+hex(d)).toLowerCase();
}
function requestParams(capture) {
  const params = {};
  Object.keys(capture.paramsRaw || {}).forEach(k => { if (k !== 'sign' && k !== 'signDate') params[k] = capture.paramsRaw[k]; });
  const now = new Date();
  params.signDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  params.sign = md5(base + SECRET);
  return params;
}
function apiURL(path, capture) {
  const p = requestParams(capture);
  return `https://api.pingmeapp.net/app/${path}?` + Object.keys(p).map(k => `${k}=${encodeURIComponent(p[k])}`).join('&');
}
function headersOf(capture) {
  const out = Object.assign({}, capture.headers || {});
  Object.keys(out).forEach(k => { if (/^(content-length|:authority|:method|:path|:scheme)$/i.test(k)) delete out[k]; });
  out.Host = 'api.pingmeapp.net';
  out.Accept = out.Accept || 'application/json';
  return out;
}
function apiGet(capture, path, timeout) {
  return new Promise((resolve, reject) => {
    $httpClient.get({url:apiURL(path,capture),headers:headersOf(capture),timeout:timeout || 35,'auto-redirect':false}, (e,r,b) => {
      if (e || !r) return reject(e || new Error('请求失败'));
      resolve({status:Number(r.status),body:String(b || '')});
    });
  });
}
function resultText(res, label) {
  const d = parseJSON(res.body);
  if (!d) return `❌ ${label}：解析失败`;
  if (d.retcode === 0) return `✅ ${label}：${String((d.result && d.result.bonusHint) || d.retmsg || '').replace(/\n/g,' ')}`;
  return `⚠️ ${label}：${d.retmsg || '未知错误'}`;
}
async function videoLoop(capture, lines, timeout) {
  for (let i=1;i<=MAX_VIDEO;i++) {
    await new Promise(resolve => setTimeout(resolve, i === 1 ? 1500 : VIDEO_DELAY));
    try {
      const d = parseJSON((await apiGet(capture,'videoBonus',timeout)).body);
      if (d && d.retcode === 0) lines.push(`🎬 视频${i}：+${(d.result && d.result.bonus) || '?'} Coins`);
      else { lines.push(`⏸ 视频${i}：${(d && d.retmsg) || '未知错误'}`); return; }
    } catch (e) { lines.push(`❌ 视频${i}：${e.message || '请求失败'}`); return; }
  }
}
async function main() {
  const raw = $persistentStore.read(STORE_KEY);
  if (!raw) { notify('❌ 请先获取PingMe签到参数','先打开PingMe触发一次',''); return; }
  const capture = parseJSON(raw);
  if (!capture || !capture.paramsRaw || !capture.headers) { notify('❌ PingMe签到参数损坏','可打开PingMe再触发一次',''); return; }
  const timeout = Number($argument || 35) || 35;
  const lines = [];
  let failed = false;
  try {
    const before = parseJSON((await apiGet(capture,'queryBalanceAndBonus',timeout)).body);
    if (before && before.retcode === 0) lines.push(`💰 运行前余额：${before.result.balance} Coins`); else lines.push(`⚠️ 查询：${(before && before.retmsg) || '未知错误'}`);
    lines.push(resultText(await apiGet(capture,'checkIn',timeout),'签到'));
    await videoLoop(capture, lines, timeout);
    try { const after = parseJSON((await apiGet(capture,'queryBalanceAndBonus',timeout)).body); if (after && after.retcode === 0) lines.unshift(`💰 最新余额：${after.result.balance} Coins`); } catch (_) {}
  } catch (e) { failed = true; lines.push(`❌ ${e.message || '请求失败'}`); }
  notify(`${NAME}${failed ? '❌ 任务失败' : '🎉 任务完成'}`, '', lines.join('\n'));
}
(async()=>{try{await main();}finally{$done({});}})();
