import { addAuditEvent, StoreError, readSnapshot } from './room-store';
import type {
  AcknowledgeModelRequest,
  ModelDescriptor,
  ModelSwitchRequest,
  RegisterModelsRequest,
  SelectModelRequest,
} from './protocol';

const MODEL_STORE_KEY = '__murmurModelStoreV1';

type ModelRuntimeStore = {
  catalogs: Record<string, ModelDescriptor[]>;
  selected: Record<string, string>;
  requests: ModelSwitchRequest[];
};

type RuntimeGlobal = typeof globalThis & { [MODEL_STORE_KEY]?: ModelRuntimeStore };

const isoNow = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function getModelStore() {
  const runtime = globalThis as RuntimeGlobal;
  runtime[MODEL_STORE_KEY] ??= { catalogs: {}, selected: {}, requests: [] };
  return runtime[MODEL_STORE_KEY]!;
}

function requiredText(value: unknown, field: string, maxLength = 160) {
  if (typeof value !== 'string' || !value.trim()) throw new StoreError(`${field} 不能为空`);
  if (value.length > maxLength) throw new StoreError(`${field} 不能超过 ${maxLength} 个字符`);
  return value.trim();
}

function findAgent(deviceId: string, agentId: string) {
  const snapshot = readSnapshot();
  const device = snapshot.devices.find((item) => item.id === deviceId);
  if (!device) throw new StoreError(`设备不存在：${deviceId}`, 404);
  const agent = device.agents.find((item) => item.id === agentId);
  if (!agent) throw new StoreError(`Agent 不属于设备 ${deviceId}：${agentId}`, 404);
  return { device, agent };
}

function validateCatalog(models: ModelDescriptor[]) {
  if (!Array.isArray(models) || models.length === 0) throw new StoreError('至少需要注册一个可用模型');
  if (models.length > 100) throw new StoreError('单台设备最多注册 100 个模型');
  const ids = new Set<string>();
  return models.map((model) => {
    const id = requiredText(model?.id, 'model.id', 180);
    const name = requiredText(model?.name, 'model.name', 180);
    if (ids.has(id)) throw new StoreError(`模型 id 重复：${id}`);
    ids.add(id);
    return {
      id,
      name,
      provider: typeof model.provider === 'string' ? model.provider.slice(0, 120) : undefined,
      kind: model.kind === 'remote' ? 'remote' : 'local',
      capabilities: Array.isArray(model.capabilities)
        ? model.capabilities.filter((item): item is string => typeof item === 'string').slice(0, 30)
        : [],
      contextWindow: typeof model.contextWindow === 'number' ? Math.max(0, Math.floor(model.contextWindow)) : undefined,
      available: model.available !== false,
    } satisfies ModelDescriptor;
  });
}

export function registerModels(input: RegisterModelsRequest) {
  const deviceId = requiredText(input?.deviceId, 'deviceId');
  findAgent(deviceId, readSnapshot().devices.find((device) => device.id === deviceId)?.leaderAgentId ?? '');
  const models = validateCatalog(input.models);
  const store = getModelStore();
  store.catalogs[deviceId] = models;
  addAuditEvent({ kind: 'model.catalog', text: `${deviceId} 注册了 ${models.length} 个模型`, actorId: deviceId });
  return readModels(deviceId);
}

export function readModels(deviceId?: string) {
  const store = getModelStore();
  const snapshot = readSnapshot();
  const deviceIds = deviceId
    ? [requiredText(deviceId, 'deviceId')]
    : snapshot.devices.map((device) => device.id);
  if (deviceId && !snapshot.devices.some((device) => device.id === deviceId)) {
    throw new StoreError(`设备不存在：${deviceId}`, 404);
  }
  return {
    devices: deviceIds.map((id) => {
      const device = snapshot.devices.find((item) => item.id === id);
      const agents = device?.agents ?? [];
      return {
        deviceId: id,
        models: store.catalogs[id] ?? [],
        agents: agents.map((agent) => ({
          agentId: agent.id,
          agentName: agent.name,
          selectedModelId: store.selected[`${id}:${agent.id}`] ?? null,
        })),
        pendingRequests: store.requests.filter((request) => request.deviceId === id && request.status === 'pending'),
      };
    }),
    requests: store.requests.slice(0, 200),
  };
}

export function requestModelSwitch(input: SelectModelRequest) {
  const deviceId = requiredText(input?.deviceId, 'deviceId');
  const agentId = requiredText(input?.agentId, 'agentId');
  const modelId = requiredText(input?.modelId, 'modelId', 180);
  const { agent } = findAgent(deviceId, agentId);
  const store = getModelStore();
  const catalog = store.catalogs[deviceId] ?? [];
  if (!catalog.some((model) => model.id === modelId && model.available !== false)) {
    throw new StoreError(`模型未在设备目录中注册或当前不可用：${modelId}`, 404);
  }
  const now = isoNow();
  for (const request of store.requests) {
    if (request.deviceId === deviceId && request.agentId === agentId && request.status === 'pending') {
      request.status = 'superseded';
      request.acknowledgedAt = now;
    }
  }
  const request: ModelSwitchRequest = {
    id: makeId('model_req'),
    deviceId,
    agentId,
    modelId,
    requestedBy: input.requestedBy?.trim() || 'George',
    reason: input.reason?.trim() || `为 ${agent.name} 请求切换模型`,
    status: 'pending',
    requestedAt: now,
    acknowledgedAt: null,
    error: null,
  };
  store.requests = [request, ...store.requests].slice(0, 200);
  addAuditEvent({ kind: 'model.switch_requested', text: `${agent.name} 收到模型切换请求：${modelId}`, actorId: agentId });
  return { request, models: readModels(deviceId) };
}

export function acknowledgeModelSwitch(input: AcknowledgeModelRequest) {
  const requestId = requiredText(input?.requestId, 'requestId', 180);
  const store = getModelStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) throw new StoreError(`模型切换请求不存在：${requestId}`, 404);
  if (request.status !== 'pending') throw new StoreError(`模型切换请求已经处理：${request.status}`, 409);
  const now = isoNow();
  request.status = input.status;
  request.acknowledgedAt = now;
  request.error = input.status === 'failed' ? (input.error?.trim() || '本地 Claw 未提供失败原因') : null;
  if (input.status === 'applied') {
    const actualModelId = input.actualModelId?.trim() || request.modelId;
    const catalog = store.catalogs[request.deviceId] ?? [];
    if (!catalog.some((model) => model.id === actualModelId)) throw new StoreError(`实际模型未在目录中注册：${actualModelId}`, 400);
    store.selected[`${request.deviceId}:${request.agentId}`] = actualModelId;
  }
  addAuditEvent({
    kind: input.status === 'applied' ? 'model.switch_applied' : 'model.switch_failed',
    text: input.status === 'applied' ? `${request.agentId} 已切换到 ${input.actualModelId ?? request.modelId}` : `${request.agentId} 模型切换失败：${request.error}`,
    actorId: request.agentId,
  });
  return { request, models: readModels(request.deviceId) };
}

export function deviceIdForModelRequest(requestId: string) {
  const id = requiredText(requestId, 'requestId', 180);
  const request = getModelStore().requests.find((item) => item.id === id);
  if (!request) throw new StoreError(`模型切换请求不存在：${id}`, 404);
  return request.deviceId;
}
