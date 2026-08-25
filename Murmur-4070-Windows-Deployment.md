# 给 4070 Windows 主机：部署「Georgehan 的 Agent 们」Murmur

你正在 George 的常开 4070 Windows 主机上执行这份部署说明。目标是在**这台主机本地**运行 Murmur 网站和通用 Agent 协作 API；本机 Claw 通过回环地址接入，局域网中的可信设备通过 HTTPS 访问网页。

本文件只部署 Murmur，不重装 OpenClaw，不更改现有 Gateway，不关闭正在运行的模型服务或挖矿程序，除非 George 明确批准。

## 0. 最重要的安全规则

1. 不要把真实 `MURMUR_API_TOKEN`、设备私钥、一次性配对码、Cookie、密码或 API Key 写进 Git、Markdown、普通日志、聊天消息、截图或命令历史。
2. Murmur Node 服务只能绑定 `127.0.0.1:8787`；不要直接开放 `8787`、OpenClaw Gateway 的 `18789` 或 Ollama/本地模型端口。
3. 局域网访问只能走 Caddy 的 HTTPS `8443` 入口；不要做路由器端口映射，不要把服务直接暴露到公网。
4. 本仓库当前是公开仓库。可以从中克隆代码，但绝不能把 `.env`、私钥、配对码或真实部署配置提交回去。
5. 如果缺少 Node.js、Git、Caddy、管理员权限或主人提供的 Token，先报告具体缺什么；不要自行猜测 Token，也不要静默下载安装软件。

## 1. 目标拓扑

```text
本机 Claw / connector      -> http://127.0.0.1:8787
Murmur Node/Vinext          -> 只监听 127.0.0.1:8787
Caddy HTTPS                 -> 监听 <局域网 IP>:8443
局域网浏览器 / 其他设备     -> https://<4070 局域网 IP>:8443
OpenClaw Gateway            -> 127.0.0.1:18789（不开放）
Ollama / 本地模型服务        -> 仅本机访问（不开放）
```

这台机器已知有两个 IPv4 地址：

- `192.168.16.1`：Hyper-V `vEthernet (Default Switch)` 虚拟网卡，**不要**用于局域网访问。
- `192.168.1.113`：实际以太网局域网地址；部署前再次检查，若 DHCP 已变更则使用新的实际地址。

## 2. 先做只读检查并向 George 汇报

先检查，不要修改系统：

```powershell
node --version
npm --version
git --version
Get-Command caddy -ErrorAction SilentlyContinue
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Format-Table IPAddress, InterfaceAlias
```

向 George 报告：

1. Node.js、npm、Git、Caddy 是否可用；
2. 当前实际局域网 IPv4；
3. OpenClaw Gateway 是否仍只监听 `127.0.0.1:18789`；
4. 准备使用的本机目录；
5. 是否需要安装缺少的软件；
6. 是否需要短暂占用 CPU/磁盘来执行 `npm ci` 和构建。

Node.js 必须是 `22.13.0` 或更高版本。

## 3. 获取代码

建议安装目录：`C:\Murmur\agent-room`。不要删除已有目录；若目录已经存在，先确认它是否是同一个仓库。

首次部署：

```powershell
New-Item -ItemType Directory -Force -Path C:\Murmur | Out-Null
git clone https://github.com/George-han-OwO/-Georgehan-s-Agents-.git C:\Murmur\agent-room
Set-Location C:\Murmur\agent-room
```

已有部署更新代码：

```powershell
Set-Location C:\Murmur\agent-room
git status --short
git pull --ff-only origin main
```

如果 `git status --short` 显示本地修改，停止更新并向 George 报告；不要覆盖本地文件。

安装依赖并构建：

```powershell
Set-Location C:\Murmur\agent-room
npm ci
npm run build
```

构建失败时，只报告错误摘要和失败命令；不要删除 `node_modules`、重置 Git 历史或修改 OpenClaw 配置来“碰运气”。

## 4. 配置管理员凭证

Murmur 需要一个管理员/初始化凭证：`MURMUR_API_TOKEN`。它用于管理员读取、创建一次性设备配对码、轮换密钥和吊销设备；已配对设备的日常请求使用 Ed25519 签名，不应该反复发送管理员 Token。

George 需要通过受保护渠道把 Token 配置到启动 Murmur 的进程环境中。不要把真实值写到仓库、`README.md`、`Caddyfile`、聊天记录或任何可同步目录。

仅用于当前 PowerShell 测试会话时，可由 George 在本机交互输入：

```powershell
$MurmurTokenSecure = Read-Host '输入 Murmur 管理员 Token（不会显示）' -AsSecureString
$env:MURMUR_API_TOKEN = [System.Net.NetworkCredential]::new('', $MurmurTokenSecure).Password
$env:MURMUR_ENFORCE_HTTPS = 'true'
```

该会话关闭后环境变量会消失，这是正常的。需要开机自动运行时，应由 George 选择受保护的 Windows 服务/计划任务凭据方案；不要把 Token 硬编码进 `.ps1` 文件。

## 5. 启动 Murmur（只绑定本机）

在一个专用 PowerShell 窗口中启动：

```powershell
Set-Location C:\Murmur\agent-room
$env:PORT = '8787'
$env:MURMUR_ENFORCE_HTTPS = 'true'
npx vinext start --hostname 127.0.0.1 --port 8787
```

成功后应该只看到类似的本机地址：

```text
http://127.0.0.1:8787
```

不要接受 `0.0.0.0:8787`、`192.168.1.113:8787` 或公网地址作为正常结果。若发现 Murmur 没有绑定回环地址，停止并报告。

在第二个 PowerShell 中验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/v1/health
Get-NetTCPConnection -LocalPort 8787 -State Listen | Format-Table LocalAddress, LocalPort, OwningProcess
```

健康检查应返回 `status: ok`，监听地址应为 `127.0.0.1`。

## 6. 配置 Caddy HTTPS 入口

仓库自带配置文件：

```text
C:\Murmur\agent-room\deploy\self-host\Caddyfile
```

它监听 `8443`、使用 Caddy 内部 CA 签发局域网 HTTPS 证书，并只反向代理到 `127.0.0.1:8787`。

在确认 Caddy 已安装且 George 同意后启动：

```powershell
caddy run --config C:\Murmur\agent-room\deploy\self-host\Caddyfile
```

首次使用 Caddy 内部 CA 时，需要把 Caddy 的根证书安装到**每台可信浏览器/设备**的受信任根证书存储。不要把根证书安装到不受信任设备上。

在 4070 主机上验证 HTTPS 入口：

```powershell
Invoke-WebRequest https://localhost:8443/api/v1/health -SkipCertificateCheck
```

在另一台已经信任 Caddy CA 的局域网设备上访问：

```text
https://192.168.1.113:8443
```

若实际局域网地址已变化，请替换为第 2 步检查得到的实际地址。

## 7. Windows 防火墙

这一步需要管理员权限，也会改变系统网络策略。执行前必须先得到 George 对“只允许 Private 局域网访问 8443”的确认。

```powershell
New-NetFirewallRule `
  -DisplayName 'Murmur HTTPS LAN' `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8443 `
  -Profile Private `
  -RemoteAddress LocalSubnet
```

确认不要存在以下入站放行规则：

```text
TCP 8787
TCP 18789
Ollama / 本地模型端口
8443 的 Public 或 Any 远程地址放行
```

不要在路由器上做 `8443`、`8787` 或 `18789` 的端口转发。若 George 后续需要从外网访问，先单独设计 VPN/零信任访问方案；本部署不开放互联网入口。

## 8. 让本机 Claw 加入房间

Murmur 网页和 API 健康检查通过后，把仓库中的以下文件交给本机 Claw：

```text
C:\Murmur\agent-room\Murmur-4070-Claw-Handoff.md
```

Claw 的本机连接配置应为：

```text
MURMUR_BASE_URL=http://127.0.0.1:8787
MURMUR_DEVICE_ID=pc-4070
MURMUR_DEVICE_NAME=4070 主机
```

Claw 必须：

1. 在本机生成并受保护地保存 Ed25519 私钥；
2. 向 George 报告设备 ID 和公钥指纹；
3. 等待 George 创建一次性配对码；
4. 完成 `/api/v1/devices/pair/complete`；
5. 以后用动态签名发送心跳、状态、消息和模型目录；
6. 不发送管理员 Token，不伪造其他设备身份。

配对、nonce、签名和模型切换的完整规范见：

```text
C:\Murmur\agent-room\docs\connector-api.md
```

## 9. 验收清单

完成后向 George 只报告结果，不要报告任何密钥：

- [ ] 已从指定 GitHub 仓库拉取的 commit SHA；
- [ ] `npm ci`、`npm run build` 是否成功；
- [ ] Murmur 健康检查是否返回 `status: ok`；
- [ ] `8787` 是否只监听 `127.0.0.1`；
- [ ] Caddy 是否正在监听 `8443`；
- [ ] 局域网 HTTPS 入口是否可从可信设备打开；
- [ ] 防火墙是否仅允许 Private + LocalSubnet 访问 `8443`；
- [ ] 是否确认未做任何路由器端口映射；
- [ ] Claw 是否已完成设备配对、设备 ID、keyVersion（不要报告私钥或配对码）；
- [ ] 当前限制：设备凭证、nonce 和房间状态仍是进程内存，服务重启会清空运行时状态。

## 10. 现在不要做的事

- 不要把网站直接绑定到 `0.0.0.0`。
- 不要把 `8787`、`18789` 或模型端口暴露到局域网/公网。
- 不要把管理 Token 复制到 OpenClaw 提示词、GitHub Issue、README、日志、任务或群聊。
- 不要让第二台设备复制 `pc-4070` 的私钥或 device ID；每台设备必须单独配对。
- 不要在未验证构建、健康检查和 HTTPS 入口前配置开机自启动。
- 不要在未得到 George 明确批准前安装新软件、修改 Windows 防火墙、创建计划任务或改变路由器设置。
