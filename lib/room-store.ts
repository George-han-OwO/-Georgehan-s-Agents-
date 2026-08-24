import {
  type AgentPresence,
  type AgentRegistration,
  type AuditEvent,
  type ConnectedDevice,
  type ConnectRequest,
  type EventRequest,
  type HeartbeatRequest,
  type MessageRequest,
  type RoomMessage,
  type RoomSnapshot,
  type RoomTask,
  type TaskRequest,
  PROTOCOL_VERSION,
} from './protocol';

const STORE_KEY = '__murmurRoomStoreV1';
const HEARTBEAT_TIMEOUT_MS = 45_000;

export class StoreError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
  }
}

type RuntimeGlobal = typeof globalThis & { [STORE_KEY]?: RoomSnapshot };

const isoNow = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function newSnapshot(): RoomSnapshot {
  return {
    protocol: PROTOCOL_VERSION,
    roomId: 'room-george',
    ownerName: 'George',
    version: 0,
    updatedAt: isoNow(),
    devices: [],
    messages: [],
    tasks: [],
    events: [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getMutableStore() {
  const runtime = globalThis as RuntimeGlobal;
  runtime[STORE_KEY] ??= newSnapshot();
  return runtime[STORE_KEY]!;
}

function touch(store: RoomSnapshot) {
  store.version += 1;
  store.updatedAt = isoNow();
}

function addEvent(store: RoomSnapshot, event: EventRequest) {
  const item: AuditEvent = { id: makeId('evt'), ...event, createdAt: isoNow() };
  store.events = [item, ...store.events].slice(0, 200);
}

function normalizeAgent(agent: AgentRegistration, now: string): AgentPresence {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role ?? '通用 Agent',
    capabilities: agent.capabilities ?? [],
    leader: Boolean(agent.leader),
    status: 'online',
    state: '已连接，等待任务',
    truth: '在线 · 可接单',
    tool: '待命',
    tokens: '0',
    lastHeartbeatAt: now,
  };
}

function validateText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) throw new StoreError(`${field} 不能为空`);
  if (value.length > maxLength) throw new StoreError(`${field} 不能超过 ${maxLength} 个字符`);
  return value.trim();
}

export function readSnapshot(): RoomSnapshot {
  const store = getMutableStore();
  const now = Date.now();
  for (const device of store.devices) {
    const stale = now - new Date(device.lastHeartbeatAt).getTime() > HEARTBEAT_TIMEOUT_MS;
    device.online = !stale;
    if (stale) {
      for (const agent of device.agents) {
        if (agent.status !== 'sleeping') agent.status = 'offline';
      }
    }
  }
  return clone(store);
}

export function registerDevice(input: ConnectRequest) {
  const deviceId = validateText(input?.device?.id, 'device.id', 100);
  const deviceName = validateText(input?.device?.name, 'device.name', 120);
  if (!Array.isArray(input.agents) || input.agents.length === 0) {
    throw new StoreError('至少需要注册一个 Agent');
  }
  if (input.agents.length > 100) throw new StoreError('单台设备最多注册 100 个 Agent');

  const ids = new Set<string>();
  const agents = input.agents.map((agent) => {
    const id = validateText(agent?.id, 'agent.id', 100);
    if (ids.has(id)) throw new StoreError(`Agent id 重复：${id}`);
    ids.add(id);
    return { ...agent, id };
  });
  const leaders = agents.filter((agent) => agent.leader);
  if (leaders.length > 1) throw new StoreError('一台设备只能有一个本机老大');

  const store = getMutableStore();
  const now = isoNow();
  const existing = store.devices.find((item) => item.id === deviceId);
  const leaderAgentId = leaders[0]?.id ?? existing?.leaderAgentId ?? agents[0].id;
  const connectedAgents = agents.map((agent) => ({ ...normalizeAgent(agent, now), leader: agent.id === leaderAgentId }));
  const device: ConnectedDevice = {
    id: deviceId,
    name: deviceName,
    os: input.device.os ?? 'unknown',
    meta: input.device.meta ?? '已连接',
    online: true,
    load: existing?.load ?? 0,
    connectedAt: existing?.connectedAt ?? now,
    lastHeartbeatAt: now,
    leaderAgentId,
    agents: connectedAgents,
  };

  store.devices = existing
    ? store.devices.map((item) => item.id === deviceId ? device : item)
    : [...store.devices, device];
  addEvent(store, { kind: existing ? 'device.reconnect' : 'device.connect', text: `${deviceName} 接入房间`, actorId: deviceId });
  touch(store);
  return { device: clone(device), snapshot: readSnapshot() };
}

export function recordHeartbeat(input: HeartbeatRequest) {
  const deviceId = validateText(input?.deviceId, 'deviceId', 100);
  const store = getMutableStore();
  const device = store.devices.find((item) => item.id === deviceId);
  if (!device) throw new StoreError(`设备不存在：${deviceId}`, 404);
  const now = isoNow();
  device.online = true;
  device.lastHeartbeatAt = now;
  if (typeof input.load === 'number') device.load = Math.max(0, Math.min(100, input.load));

  if (input.agentId) {
    const agent = device.agents.find((item) => item.id === input.agentId);
    if (!agent) throw new StoreError(`Agent 不属于设备 ${deviceId}：${input.agentId}`, 404);
    agent.lastHeartbeatAt = now;
    if (input.status) agent.status = input.status;
    if (input.state) agent.state = input.state.slice(0, 160);
    if (input.truth) agent.truth = input.truth.slice(0, 160);
    if (input.tool) agent.tool = input.tool.slice(0, 120);
    if (input.tokens) agent.tokens = input.tokens.slice(0, 80);
  }

  addEvent(store, { kind: 'device.heartbeat', text: `${device.name} 完成心跳同步`, actorId: deviceId });
  touch(store);
  return { device: clone(device), snapshot: readSnapshot() };
}

export function addMessage(input: MessageRequest) {
  const text = validateText(input?.text, 'text', 4000);
  const senderName = validateText(input?.sender?.name, 'sender.name', 120);
  const mentions = Array.isArray(input.mentions)
    ? input.mentions.filter((mention): mention is string => typeof mention === 'string').slice(0, 50)
    : [...text.matchAll(/@([\w\-\u4e00-\u9fff]+)/g)].map((match) => match[1]);
  const store = getMutableStore();
  const message: RoomMessage = {
    id: makeId('msg'),
    sender: { kind: input.sender.kind, id: validateText(input.sender.id, 'sender.id', 100), name: senderName },
    text,
    mentions,
    createdAt: isoNow(),
  };
  store.messages = [message, ...store.messages].slice(0, 500);
  addEvent(store, { kind: 'message.created', text: `${senderName} 发了一条群聊消息`, actorId: message.sender.id });
  touch(store);
  return { message: clone(message), snapshot: readSnapshot() };
}

export function createTask(input: TaskRequest) {
  const title = validateText(input?.title, 'title', 500);
  const store = getMutableStore();
  let assignee: AgentPresence | undefined;
  if (input.assigneeAgentId) {
    assignee = store.devices.flatMap((device) => device.agents).find((agent) => agent.id === input.assigneeAgentId);
    if (!assignee) throw new StoreError(`找不到 Agent：${input.assigneeAgentId}`, 404);
  } else {
    const wanted = input.capabilities?.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()) ?? [];
    assignee = store.devices.flatMap((device) => device.agents)
      .filter((agent) => agent.status !== 'sleeping' && agent.status !== 'offline')
      .sort((a, b) => Number(b.leader) - Number(a.leader))[0];
    if (wanted.length) {
      assignee = store.devices.flatMap((device) => device.agents)
        .filter((agent) => agent.status !== 'sleeping' && agent.status !== 'offline')
        .sort((a, b) => {
          const score = (agent: AgentPresence) => agent.capabilities?.filter((capability) => wanted.includes(capability.toLowerCase())).length ?? 0;
          return score(b) - score(a);
        })[0] ?? assignee;
    }
  }

  const task: RoomTask = {
    id: `T-${String(store.tasks.length + 1).padStart(3, '0')}`,
    title,
    ownerAgentId: assignee?.id ?? null,
    ownerName: assignee?.name ?? '待认领',
    status: assignee ? '执行中' : '待认领',
    progress: assignee ? 1 : 0,
    priority: input.priority ?? '中',
    path: assignee ? [assignee.name] : [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  store.tasks = [task, ...store.tasks].slice(0, 300);
  addEvent(store, { kind: 'task.created', text: `${task.ownerName} 接受任务 ${task.id}` });
  touch(store);
  return { task: clone(task), snapshot: readSnapshot() };
}

export function addAuditEvent(input: EventRequest) {
  const text = validateText(input?.text, 'text', 500);
  const store = getMutableStore();
  addEvent(store, { kind: validateText(input.kind, 'kind', 80), text, actorId: input.actorId });
  touch(store);
  return { snapshot: readSnapshot() };
}

export function stats() {
  const snapshot = readSnapshot();
  return {
    devices: snapshot.devices.filter((device) => device.online).length,
    agents: snapshot.devices.flatMap((device) => device.agents).filter((agent) => agent.status !== 'offline').length,
    version: snapshot.version,
  };
}
