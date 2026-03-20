import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { RealtimeGateway } from './realtime/gateway.js';
import { handleNewTwilioConnection, type CallWorkerConfig } from './workers/call.js';
import type { CallSession } from './workers/call-session.js';
import { safeLog } from './logger.js';

const port = Number(process.env.PORT ?? 3000);
const realtimeGateway = new RealtimeGateway();
const { app, authService } = createApp({ realtimeGateway });
const server = createServer(app);

// --- Media Stream WebSocket for Twilio calls ---
const callWorkerConfig: CallWorkerConfig = {
  port,
  apiBaseUrl: `http://localhost:${port}`,
  internalApiKey: process.env.INTERNAL_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
  openaiVoice: process.env.OPENAI_VOICE ?? 'alloy',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
};
const activeSessions = new Map<string, CallSession>();
const mediaWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/media-stream') {
    mediaWss.handleUpgrade(request, socket, head, (ws) => {
      handleNewTwilioConnection(ws, callWorkerConfig, activeSessions);
    });
    return;
  }

  // Realtime gateway handles /ws
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = value;
  }
  realtimeGateway.attachUpgrade(request.url, headers, socket, authService);
});

server.listen(port, () => {
  console.log(`call-agent listening on ${port}`);
});
