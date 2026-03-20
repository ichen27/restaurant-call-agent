import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { safeLog } from '../logger.js';
import { CallSession } from './call-session.js';

export interface CallWorkerConfig {
  port: number;
  apiBaseUrl: string;
  internalApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiVoice: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

export function createCallWorkerServer(config: CallWorkerConfig) {
  const activeSessions = new Map<string, CallSession>();

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'call-worker',
        active_calls: activeSessions.size
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
    if (url.pathname !== '/media-stream') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleNewTwilioConnection(ws, config, activeSessions);
    });
  });

  return { server, activeSessions };
}

export function handleNewTwilioConnection(
  ws: WebSocket,
  config: CallWorkerConfig,
  activeSessions: Map<string, CallSession>
): void {
  let streamSid: string | null = null;

  // This handler ONLY processes the initial "start" event from Twilio.
  // Once the session is created, session.start(ws) registers its own
  // handlers for media/stop events. We remove this listener after
  // setup to avoid double-processing audio frames.
  const onMessage = (data: WebSocket.RawData) => {
    const msg = JSON.parse(data.toString());

    if (msg.event === 'start') {
      const { customParameters } = msg.start;
      streamSid = msg.start.streamSid;
      const callSid = msg.start.callSid;
      const storeId = customParameters?.store_id ?? 'store-1';
      const storeName = customParameters?.store_name ?? 'Restaurant';
      const callerPhone = customParameters?.caller_phone ?? 'unknown';

      const session = new CallSession({
        streamSid: streamSid!,
        callSid,
        storeId,
        storeName,
        callerPhone,
        apiBaseUrl: config.apiBaseUrl,
        internalApiKey: config.internalApiKey,
        openaiApiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
        openaiVoice: config.openaiVoice,
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken
      });

      activeSessions.set(streamSid!, session);

      // Remove this listener BEFORE calling start() to avoid
      // double-registration on the WebSocket
      ws.removeListener('message', onMessage);

      session.start(ws);

      safeLog('info', 'call_session_created', {
        streamSid,
        callSid,
        storeId,
        active_calls: activeSessions.size
      });
    }
  };

  ws.on('message', onMessage);

  ws.on('close', () => {
    if (streamSid) {
      activeSessions.delete(streamSid);
    }
  });
}

// --- Main entry point ---

function readEnvOrThrow(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

async function main(): Promise<void> {
  const port = Number(process.env.CALL_WORKER_PORT ?? 3001);

  const config: CallWorkerConfig = {
    port,
    apiBaseUrl: readEnvOrThrow('API_BASE_URL'),
    internalApiKey: readEnvOrThrow('INTERNAL_API_KEY'),
    openaiApiKey: readEnvOrThrow('OPENAI_API_KEY'),
    openaiModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
    openaiVoice: process.env.OPENAI_VOICE ?? 'alloy',
    twilioAccountSid: readEnvOrThrow('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: readEnvOrThrow('TWILIO_AUTH_TOKEN')
  };

  const { server, activeSessions } = createCallWorkerServer(config);

  // Graceful shutdown
  let draining = false;
  const shutdown = () => {
    if (draining) return;
    draining = true;
    safeLog('info', 'call_worker_shutting_down', { active_calls: activeSessions.size });

    server.close();

    const timeout = setTimeout(() => {
      safeLog('warn', 'call_worker_force_shutdown', { remaining_calls: activeSessions.size });
      for (const session of activeSessions.values()) {
        session.cleanup('shutdown');
      }
      process.exit(0);
    }, 30_000);

    const checkDrained = setInterval(() => {
      if (activeSessions.size === 0) {
        clearInterval(checkDrained);
        clearTimeout(timeout);
        safeLog('info', 'call_worker_shutdown_complete', {});
        process.exit(0);
      }
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, () => {
    safeLog('info', 'call_worker_started', { port });
  });
}

// Only run main when not in test environment
if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
