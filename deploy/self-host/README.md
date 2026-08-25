# 4070 Windows 自托管安全入口

## 目标

让 Murmur 只在 4070 主机本地运行，Claw 通过回环地址连接；同一局域网的其他设备通过 Caddy 的 HTTPS 入口访问。不要把 OpenClaw Gateway、Ollama 或 Murmur 的 Node 端口直接暴露到公网。

```text
Claw（同一台电脑）  ->  http://127.0.0.1:8787
局域网浏览器        ->  https://192.168.1.113:8443
Caddy               ->  127.0.0.1:8787
OpenClaw Gateway    ->  127.0.0.1:18789（不开放）
```

`192.168.16.1` 是 Hyper-V Default Switch，不是局域网访问地址；当前局域网地址是 `192.168.1.113`。

## 运行方式

1. Murmur Node/Vinext 进程只绑定 `127.0.0.1:8787`。
2. Caddy 使用本目录的 `Caddyfile`，监听 `8443` 并转发到 `127.0.0.1:8787`。
3. 在浏览器和需要访问 Murmur 的设备上安装 Caddy 的内部 CA 根证书。
4. Windows 防火墙只允许 Private profile 的 LocalSubnet 访问 TCP 8443。
5. 不给 8787、18789、Ollama 端口添加入站规则。

示例防火墙规则：

```powershell
New-NetFirewallRule -DisplayName "Murmur HTTPS LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -Profile Private -RemoteAddress LocalSubnet
```

不要对 WAN/Public profile 添加放行规则，也不要在路由器上做端口映射。

## 运行时密钥

服务端和 Claw connector 使用同一个 `MURMUR_API_TOKEN`，但 Token 必须通过本机受保护的环境变量或 Windows Credential Manager 配置。不要把 Token 写入 Markdown、Git、命令历史、截图或日志。

建议使用 Windows/.NET 的密码学随机数生成器创建至少 32 字节随机值，并在发生怀疑泄露时立即轮换：

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

生产配置建议：

```text
MURMUR_API_TOKEN=<随机值>
MURMUR_ENFORCE_HTTPS=true
```

Claw 如果使用 `127.0.0.1:8787`，可以保持本机回环连接；其他设备必须使用 Caddy 的 HTTPS 地址。若要让 Claw 也走 HTTPS，则把它配置为 `https://127.0.0.1:8443` 并信任 Caddy CA。

## 防护范围

- HTTPS/TLS：防止局域网和互联网链路被被动窃听或篡改。
- Bearer Token：接口不接受 URL 查询参数中的 Token。
- 常量时间比较：减少凭证比较的时间侧信道。
- 按客户端和接口限流：防止写接口被高频请求打满。
- 连续 5 次认证失败后临时锁定 5 分钟，并返回重试等待时间。
- 请求体限制为 1 MB，降低异常大请求的资源消耗。
- 安全响应头：禁止 MIME 嗅探、iframe 嵌入、危险浏览器能力和跨源资源滥用。
- 可撤销 Token：怀疑泄露时更换服务端和 Claw 两侧的 Token。

## 不能假装已经解决的问题

- 如果 4070 Windows 主机本身被恶意软件或管理员权限入侵，应用层无法保护本机内存中的 Token 或模型内容。
- 如果 Caddy CA 根证书被安装到不可信设备，HTTPS 信任边界会被破坏。
- 当前限流和模型请求状态是进程内存；生产版本还需要持久化审计、设备凭证、锁定记录和备份。
- 如果要求 Murmur 服务器本身也无法看到任务正文，需要额外设计端到端加密；这会改变服务器路由、搜索和审计能力，不能只加一个开关。
