#!/usr/bin/env bash
# Install a Shadowsocks server on a Debian/Ubuntu landing host.
# Usage: sudo SS_PORT=30000 bash install-ss-landing.sh
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo '请用 root 或 sudo 执行'; exit 1; }
PORT="${SS_PORT:-30000}"
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || { echo 'SS_PORT 必须是 1024-65535'; exit 1; }
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends shadowsocks-libev ca-certificates openssl >/dev/null
install -d -m 700 /etc/shadowsocks-libev
PASSWORD="${SS_PASSWORD:-$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')}"
cat > /etc/shadowsocks-libev/ss-server.json <<EOF
{
  "server": "0.0.0.0",
  "server_port": ${PORT},
  "password": "${PASSWORD}",
  "method": "aes-128-gcm",
  "mode": "tcp_and_udp",
  "fast_open": false
}
EOF
chmod 600 /etc/shadowsocks-libev/ss-server.json
systemctl enable --now shadowsocks-libev-server@ss-server
systemctl restart shadowsocks-libev-server@ss-server
IP=$(curl -4fsS --max-time 8 https://api.ipify.org || hostname -I | awk '{print $1}')
RAW="aes-128-gcm:${PASSWORD}@${IP}:${PORT}"
LINK="ss://$(printf '%s' "$RAW" | base64 -w0 | tr '+/' '-_' | tr -d '=')#SS-Landing"
echo 'Shadowsocks 已启动：'
echo "服务器: $IP"
echo "端口: $PORT"
echo '加密: aes-128-gcm'
echo "密码: $PASSWORD"
echo "SS链接: $LINK"
echo '请在云安全组放行 TCP/UDP 此端口。'
