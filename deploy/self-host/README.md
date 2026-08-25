# 4070 Windows 自托管安全入口

## 目标

让 Murmur 只在 4070 主机本地运行，Claw 通过回环地址连接。仓库自带的 Caddyfile 也是**仅本机回环** HTTPS 试运行配置；在完成持久化、设备准入和根证书分发审查前，不开放局域网入口。不要把 OpenClaw Gateway、Ollama 或 Murmur 的 Node 端口直接暴露到公网。

```text
Claw（同一台电脑）  ->  http://127.0.0.1:8787
本机浏览器          ->  https://localhost:8443
Caddy               ->  127.0.0.1:8787（只监听 127.0.0.1 / ::1）
OpenClaw Gateway    ->  127.0.0.1:18789（不开放）
```

`192.168.16.1` 是 Hyper-V Default Switch，不是局域网访问地址；当前局域网地址是 `192.168.1.113`。

## 运行方式

1. Murmur Node/Vinext 进程只绑定 `127.0.0.1:8787`。PowerShell 启动前设置：

```powershell
$env:PORT = "8787"
$env:MURMUR_ENFORCE_HTTPS = "true"
$env:MURMUR_STATE_PATH = "C:\Murmur\state\murmur.sqlite"
& '.\node_modules\.bin\vinext.cmd' start --hostname 127.0.0.1 --port 8787
```

2. Caddy 使用本目录的 `Caddyfile`，仅在本机 `localhost:8443` 监听并转发到 `127.0.0.1:8787`。
3. Caddy 会给 `localhost` 签发内部证书；根证书仅安装到这台主机的信任库。
4. 不创建 `8443` 的防火墙放行规则，不给 8787、18789、Ollama 端口添加入站规则。

仅在后续明确批准“受限局域网接入”后，才另行创建指定 LAN 名称/IP 的 Caddy 配置、向可信客户端分发根证书，并评审类似下面的防火墙规则：

```powershell
New-NetFirewallRule -DisplayName "Murmur HTTPS LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -Profile Private -RemoteAddress LocalSubnet
```

不要对 WAN/Public profile 添加放行规则，也不要在路由器上做端口映射。

## 管理员和设备密钥

`MURMUR_API_TOKEN` 现在是管理员/初始化凭证。它必须通过本机受保护的环境变量或 Windows Credential Manager 配置，不要把它写入 Markdown、Git、命令历史、截图或日志。

每台设备应通过 `/api/v1/devices/pair/start` 和 `/api/v1/devices/pair/complete` 单独配对。设备在本地生成 Ed25519 私钥、公钥，只把公钥发给 Murmur；之后用 `X-Device-Id`、`X-Key-Version`、`X-Timestamp`、`X-Nonce`、`X-Signature` 请求头签名，不需要在每个运行时请求中携带管理员 Token。私钥只能放在 Windows Credential Manager、DPAPI 或其他受保护存储。

建议使用 Windows/.NET 的密码学随机数生成器创建至少 32 字节随机值，并在发生怀疑泄露时立即轮换。下面的写法兼容 Windows PowerShell 5.1：

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
}
finally {
  $rng.Dispose()
}
[Convert]::ToBase64String($bytes)
```

生产配置建议：

```text
MURMUR_API_TOKEN=<随机值>
MURMUR_ENFORCE_HTTPS=true
MURMUR_STATE_PATH=C:\Murmur\state\murmur.sqlite
```

Claw 如果使用 `127.0.0.1:8787`，可以保持本机回环连接。后续局域网设备必须使用另行批准的 Caddy HTTPS 名称/IP；不要在当前回环 Caddyfile 中自行加入 `192.168.1.113`。若要让本机 Claw 也走 HTTPS，则使用 `https://localhost:8443` 并信任 Caddy CA。

## 防护范围

- HTTPS/TLS：防止局域网和互联网链路被被动窃听或篡改。
- Bearer Token：接口不接受 URL 查询参数中的 Token。
- 常量时间比较：减少凭证比较的时间侧信道。
- 按客户端和接口限流：防止写接口被高频请求打满。
- 连续 5 次认证失败后临时锁定 5 分钟，并返回重试等待时间。
- 请求体限制为 1 MB，降低异常大请求的资源消耗。
- 安全响应头：禁止 MIME 嗅探、iframe 嵌入、危险浏览器能力和跨源资源滥用。
- 可撤销 Token：怀疑泄露时更换服务端和 Claw 两侧的 Token。
- 每设备 Ed25519 公钥：设备凭证互相隔离；服务器只保存公钥和版本，不会向设备下发私钥。
- 一次性配对码：5 分钟有效、成功后立即失效，并可预绑定设备 ID，避免另一台设备复用许可。
- 请求签名防重放：时间戳 ±60 秒、nonce 单次使用、密钥版本轮换后旧版本立即拒绝。
- 离线恢复：设备离线时凭证不会自动失效；恢复联网后使用本地私钥继续签名。设备丢失或私钥损坏时先吊销旧凭证，再重新配对。

## 不能假装已经解决的问题

- 如果 4070 Windows 主机本身被恶意软件或管理员权限入侵，应用层无法保护本机内存中的 Token 或模型内容。
- 如果 Caddy CA 根证书被安装到不可信设备，HTTPS 信任边界会被破坏。
- Node 自托管会把房间、模型目录/请求、设备公钥、一次性配对码散列、nonce 防重放窗口与认证限流/锁定记录写入 SQLite。它不保存管理员 Token 或设备私钥。`MURMUR_STATE_PATH` 所在目录应只允许受信任账户访问，并排除在 Git、网盘同步和临时清理之外。
- SQLite 解决重启恢复，不等于备份或严格 PKI 吊销。上线局域网前仍需要制定离线备份、恢复演练、根证书分发、设备撤销和防火墙范围。
- 如果要求 Murmur 服务器本身也无法看到任务正文，需要额外设计端到端加密；这会改变服务器路由、搜索和审计能力，不能只加一个开关。
