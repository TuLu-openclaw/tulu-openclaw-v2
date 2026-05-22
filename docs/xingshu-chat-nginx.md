# 星枢聊天室 Nginx 反向代理部署说明

目标：让浏览器只连接 `wss://www.aiyu.jx.cn/xingshu-chat`，不再直接暴露 `124.220.22.11:18888`。

## 1. systemd 服务建议

`/etc/systemd/system/xingshu-chat.service` 中建议使用：

```ini
[Unit]
Description=XingShu Chat Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/tulu-openclaw-v2
Environment=XINGSHU_CHAT_PORT=18888
Environment=XINGSHU_CHAT_HOST=127.0.0.1
Environment=XINGSHU_CHAT_MAX_UPLOAD_MB=20
Environment=XINGSHU_CHAT_RETENTION_DAYS=7
Environment=XINGSHU_CHAT_UPLOAD_DIR=/data/xingshu-chat-uploads
ExecStart=/usr/bin/node /home/ubuntu/tulu-openclaw-v2/server/xingshu-chat-server.js
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
```

重点：`XINGSHU_CHAT_HOST=127.0.0.1`，只允许本机 Nginx 访问，不直接对公网监听。

## 2. Nginx location 配置

把下面配置加入 `www.aiyu.jx.cn` 的 HTTPS server 块中：

```nginx
location /xingshu-chat {
    proxy_pass http://127.0.0.1:18888/xingshu-chat;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}

location /upload {
    client_max_body_size 25m;
    proxy_pass http://127.0.0.1:18888/upload;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /files/ {
    proxy_pass http://127.0.0.1:18888/files/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /health {
    proxy_pass http://127.0.0.1:18888/health;
    proxy_set_header Host $host;
}
```

## 3. 防火墙

如果云服务器安全组已经开了 18888，建议关闭公网 18888，只保留 80/443。系统 ufw 不需要开放 18888。

公网应只访问：

- `https://www.aiyu.jx.cn/health`
- `wss://www.aiyu.jx.cn/xingshu-chat`
- `https://www.aiyu.jx.cn/upload`
- `https://www.aiyu.jx.cn/files/<id>`

## 4. 验证

```bash
curl http://127.0.0.1:18888/health
curl https://www.aiyu.jx.cn/health
```

两者都返回 JSON 即可。
