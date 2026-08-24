# Murmur Connector API v1

Murmur 的接入层按“设备 + Agent + 心跳 + 事件”建模。新增设备不需要修改网页或重新发布，只需要让它调用注册接口。

## 读取接口

```text
GET /api/v1
GET /api/v1/health
GET /api/v1/room
```

## 注册设备

```http
POST /api/v1/connect
Authorization: Bearer <MURMUR_API_TOKEN>
Content-Type: application/json
```

```json
{
  "device": {
    "id": "pc-4070",
    "name": "4070 主机",
    "os": "windows",
    "meta": "RTX 4070 Ti SUPER · 64GB"
  },
  "agents": [
    {
      "id": "mochi",
      "name": "Mochi",
      "role": "本机老大",
      "capabilities": ["规划", "协调", "编程"],
      "leader": true
    }
  ]
}
```

每台设备最多只能有一个 `leader: true`。如果没有指定老大，服务会保留已有老大，否则把第一个 Agent 设为本机老大。

## 心跳和状态

```http
POST /api/v1/heartbeat
Authorization: Bearer <MURMUR_API_TOKEN>
Content-Type: application/json
```

```json
{
  "deviceId": "pc-4070",
  "agentId": "mochi",
  "load": 38,
  "status": "busy",
  "state": "正在拆解任务",
  "truth": "执行中 · T-001",
  "tool": "任务编排器",
  "tokens": "12.4k / 40k"
}
```

45 秒没有心跳会被标记为离线；连接器恢复心跳后会自动恢复在线。

## 消息、任务和审计事件

消息使用 `POST /api/v1/messages`，任务使用 `POST /api/v1/tasks`，通用结构化活动使用 `POST /api/v1/events`。所有接口都会返回更新后的 room snapshot，前端可以据此刷新群聊、任务板和活动流。

当前默认存储是进程内 Store，目的是先稳定接入协议。后续切换到 D1 或其他持久化存储时，接口路径和设备连接器不需要改变。

## 本地 Claw 模型切换

模型切换采用两阶段确认：网页只创建 `pending` 请求；本地 Claw 拉取请求、真正调用本机模型服务切换，成功后再调用 ack。服务不会因为网页发起请求就假装模型已经改变。

### 注册本机实际可用模型

```http
POST /api/v1/models/register
```

```json
{
  "deviceId": "pc-4070",
  "models": [
    {
      "id": "ollama/qwen-local",
      "name": "本地 Qwen",
      "provider": "ollama",
      "kind": "local",
      "capabilities": ["通用", "中文"],
      "contextWindow": 32768,
      "available": true
    }
  ]
}
```

模型 ID 必须使用 Claw 本机实际能识别的 provider/model 标识，不要注册一个不存在的模型。

### 网页请求切换

```http
POST /api/v1/models/select
```

```json
{
  "deviceId": "pc-4070",
  "agentId": "claw-4070",
  "modelId": "ollama/qwen-local",
  "requestedBy": "George",
  "reason": "切换到本地中文模型处理这项任务"
}
```

### Claw 读取请求

```http
GET /api/v1/models?deviceId=pc-4070
```

响应中的 `devices[].pendingRequests` 就是尚未处理的模型切换请求。Claw 应按 `requestedAt` 顺序处理，避免并行切换同一个 Agent。

### Claw 确认结果

成功：

```http
POST /api/v1/models/ack
```

```json
{
  "requestId": "model_req_xxx",
  "status": "applied",
  "actualModelId": "ollama/qwen-local"
}
```

失败：

```json
{
  "requestId": "model_req_xxx",
  "status": "failed",
  "error": "本地模型服务没有找到该模型"
}
```

模型目录、待处理请求和当前选择目前也使用进程内 Store；后续换成持久化数据库时，模型切换协议不变。
