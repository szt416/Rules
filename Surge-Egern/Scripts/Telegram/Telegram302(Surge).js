/**
 * Surge adaptation of IBL3ND/module/TgRedirect.js: t.me → 第三方 Telegram 客户端重定向
 *
 * 说明：
 * - 来源：https://github.com/IBL3ND/module/blob/main/TgRedirect.js
 * - 客户端选择通过 Surge $argument 传入，默认 Regram
 * - 保留上游深链解析与 regram Scheme，不代表完整 Telegram 链接解析
 */

const SCHEME = {
  Telegram: "tg",
  Nagram: "na",
  Swiftgram: "sg",
  Turrit: "turrit",
  iMe: "ime",
  Nicegram: "ng",
  Lingogram: "lingo",
  Regram: "regram",
};

function qval(qs, key) {
  if (!qs) return "";
  const re = new RegExp(
    "(?:^|&)" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^&]*)",
  );
  const m = qs.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

function deeplink(s, path, qs) {
  const p = path.split("/").filter(Boolean);
  if (!p[0]) return "";

  if (p[0][0] === "+") {
    return `${s}://join?invite=${encodeURIComponent(p[0].slice(1))}`;
  }
  if (p[0] === "joinchat" && p[1]) {
    return `${s}://join?invite=${encodeURIComponent(p[1])}`;
  }
  if (p[0] === "addstickers" && p[1]) {
    return `${s}://addstickers?set=${encodeURIComponent(p[1])}`;
  }
  if (p[0] === "share" && p[1] === "url") {
    return `${s}://msg_url?url=${encodeURIComponent(qval(qs, "url"))}&text=${encodeURIComponent(qval(qs, "text"))}`;
  }
  if (p[1] && /^\d+$/.test(p[1])) {
    return `${s}://resolve?domain=${encodeURIComponent(p[0])}&post=${encodeURIComponent(p[1])}`;
  }
  return `${s}://resolve?domain=${encodeURIComponent(p[0])}`;
}

(function () {
  try {
  const url = $request.url;
  const m = url.match(/^https?:\/\/(?:t\.me|telegram\.me)\/(.+)$/i);
  if (!m) return $done({});

  const raw = typeof $argument === "string" ? $argument : "";
  const client = (raw.replace(/^CLIENT=/, "").trim() || "Regram");

  if (client === "Telegram") return $done({});

  const scheme = SCHEME[client] || "tg";

  let tail = m[1];
  if (tail.startsWith("s/")) tail = tail.slice(2);

  const qi = tail.indexOf("?");
  const path = qi < 0 ? tail : tail.slice(0, qi);
  const qs = qi < 0 ? "" : tail.slice(qi + 1);

  const loc = deeplink(scheme, path, qs);
  if (!loc) return $done({});

  return $done({response: {
    status: 302,
    headers: {
      Location: loc,
      "Cache-Control": "no-store, no-cache",
    },
    body: "",
  }});
  } catch (error) {
    console.log("[Telegram-IBL3ND-Surge] " + error.message);
    return $done({});
  }
})();
