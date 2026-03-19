import { randomUUID } from 'node:crypto';
import { safeLog } from '../logger.js';

export interface CallToolConfig {
  apiBaseUrl: string;
  internalApiKey: string;
  storeId: string;
  callerPhone: string;
  callSid: string;
}

export class CallToolHandler {
  constructor(private readonly config: CallToolConfig) {}

  async execute(toolName: string, argsJson: string): Promise<string> {
    try {
      switch (toolName) {
        case 'get_store_mode':
          return await this.getStoreMode();
        case 'search_menu':
          return await this.searchMenu(argsJson);
        case 'create_order':
          return await this.createOrder(argsJson);
        case 'transfer_to_staff':
          return await this.transferToStaff(argsJson);
        case 'end_call':
          return await this.endCall(argsJson);
        default:
          return JSON.stringify({ error: `unknown tool: ${toolName}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      safeLog('error', 'tool_call_failed', {
        callSid: this.config.callSid,
        tool: toolName,
        error: message
      });
      return JSON.stringify({ error: message });
    }
  }

  private async apiGet(path: string): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      headers: {
        'x-internal-api-key': this.config.internalApiKey,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
    return res.json();
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'x-internal-api-key': this.config.internalApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': randomUUID()
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
    return res.json();
  }

  private async getStoreMode(): Promise<string> {
    const data = await this.apiGet(`/api/internal/stores/${this.config.storeId}`);
    return JSON.stringify(data);
  }

  private async searchMenu(argsJson: string): Promise<string> {
    const { query } = JSON.parse(argsJson) as { query: string };
    const data = await this.apiGet(
      `/api/internal/stores/${this.config.storeId}/menu?q=${encodeURIComponent(query)}`
    );
    return JSON.stringify(data);
  }

  private async createOrder(argsJson: string): Promise<string> {
    const { customer_name, items } = JSON.parse(argsJson) as {
      customer_name: string;
      items: Array<{ item_id: string; qty: number }>;
    };
    const data = await this.apiPost('/api/internal/orders', {
      store_id: this.config.storeId,
      call_id: this.config.callSid,
      customer_name,
      customer_phone: this.config.callerPhone,
      items
    });
    return JSON.stringify(data);
  }

  private async transferToStaff(argsJson: string): Promise<string> {
    const { reason } = JSON.parse(argsJson) as { reason: string };
    await this.apiPost('/api/internal/call-events', {
      store_id: this.config.storeId,
      call_id: this.config.callSid,
      event_type: 'CallHandoffRequested',
      payload: { reason, callerPhone: this.config.callerPhone }
    });
    return JSON.stringify({ status: 'transferring', reason });
  }

  private async endCall(argsJson: string): Promise<string> {
    const { reason } = JSON.parse(argsJson) as { reason: string };
    return JSON.stringify({ status: 'ending', reason });
  }
}
