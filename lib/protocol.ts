export const PROTOCOL_VERSION = 'murmur.v1';

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'sleeping' | 'offline';
export type TaskStatus = '待认领' | '执行中' | '等待主人' | '已完成' | '已取消';
export type TaskPriority = '高' | '中' | '低';

export type AgentRegistration = {
  id: string;
  name: string;
  role?: string;
  capabilities?: string[];
  leader?: boolean;
};

export type DeviceRegistration = {
  id: string;
  name: string;
  os?: string;
  meta?: string;
};

export type AgentPresence = AgentRegistration & {
  status: PresenceStatus;
  state: string;
  truth: string;
  tool: string;
  tokens: string;
  lastHeartbeatAt: string | null;
};

export type ConnectedDevice = DeviceRegistration & {
  os: string;
  meta: string;
  online: boolean;
  load: number;
  connectedAt: string;
  lastHeartbeatAt: string;
  leaderAgentId: string;
  agents: AgentPresence[];
};

export type RoomMessage = {
  id: string;
  sender: { kind: 'owner' | 'agent' | 'system'; id: string; name: string };
  text: string;
  mentions: string[];
  createdAt: string;
};

export type RoomTask = {
  id: string;
  title: string;
  ownerAgentId: string | null;
  ownerName: string;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  path: string[];
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  kind: string;
  text: string;
  actorId?: string;
  createdAt: string;
};

export type RoomSnapshot = {
  protocol: typeof PROTOCOL_VERSION;
  roomId: string;
  ownerName: string;
  version: number;
  updatedAt: string;
  devices: ConnectedDevice[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  events: AuditEvent[];
};

export type ConnectRequest = {
  device: DeviceRegistration;
  agents: AgentRegistration[];
};

export type HeartbeatRequest = {
  deviceId: string;
  agentId?: string;
  load?: number;
  status?: PresenceStatus;
  state?: string;
  truth?: string;
  tool?: string;
  tokens?: string;
};

export type MessageRequest = {
  sender: { kind: 'owner' | 'agent' | 'system'; id: string; name: string };
  text: string;
  mentions?: string[];
};

export type TaskRequest = {
  title: string;
  priority?: TaskPriority;
  assigneeAgentId?: string;
  capabilities?: string[];
};

export type EventRequest = {
  kind: string;
  text: string;
  actorId?: string;
};

export type ModelDescriptor = {
  id: string;
  name: string;
  provider?: string;
  kind?: 'local' | 'remote';
  capabilities?: string[];
  contextWindow?: number;
  available?: boolean;
};

export type RegisterModelsRequest = {
  deviceId: string;
  models: ModelDescriptor[];
};

export type ModelSwitchStatus = 'pending' | 'applied' | 'failed' | 'superseded';

export type ModelSwitchRequest = {
  id: string;
  deviceId: string;
  agentId: string;
  modelId: string;
  requestedBy: string;
  reason: string;
  status: ModelSwitchStatus;
  requestedAt: string;
  acknowledgedAt: string | null;
  error: string | null;
};

export type SelectModelRequest = {
  deviceId: string;
  agentId: string;
  modelId: string;
  requestedBy?: string;
  reason?: string;
};

export type AcknowledgeModelRequest = {
  requestId: string;
  status: 'applied' | 'failed';
  actualModelId?: string;
  error?: string;
};
