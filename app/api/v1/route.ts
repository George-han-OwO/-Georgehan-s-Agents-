import { success } from '@/lib/api';
import { PROTOCOL_VERSION } from '@/lib/protocol';

export function GET() {
  return success({
    name: 'Murmur connector API',
    protocol: PROTOCOL_VERSION,
    description: '任意设备通过注册、心跳和事件接口加入 George 的 Agent 们。',
    endpoints: {
      health: 'GET /api/v1/health',
      room: 'GET /api/v1/room',
      models: 'GET /api/v1/models?deviceId=pc-4070',
      connect: 'POST /api/v1/connect',
      heartbeat: 'POST /api/v1/heartbeat',
      message: 'POST /api/v1/messages',
      task: 'POST /api/v1/tasks',
      event: 'POST /api/v1/events',
      registerModels: 'POST /api/v1/models/register',
      selectModel: 'POST /api/v1/models/select',
      acknowledgeModel: 'POST /api/v1/models/ack',
    },
    authentication: 'Bearer MURMUR_API_TOKEN 或 x-murmur-token',
  });
}
