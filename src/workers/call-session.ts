import WebSocket from 'ws';
import { safeLog } from '../logger.js';
import { twilioToOpenAI, openAIToTwilio } from './call-audio.js';
import { CallToolHandler } from './call-tools.js';
import { buildSystemPrompt, buildToolDefinitions } from './call-prompt.js';

export interface CallSessionConfig {
  streamSid: string;
  callSid: string;
  storeId: string;
  storeName: string;
  callerPhone: string;
  apiBaseUrl: string;
  internalApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiVoice: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

export class CallSession {
  readonly callSid: string;
  readonly storeId: string;
  private openaiWs: WebSocket | null = null;
  private twilioWs: WebSocket | null = null;
  private toolHandler: CallToolHandler;
  private config: CallSessionConfig;
  private startedAt = Date.now();
  private closed = false;

  constructor(config: CallSessionConfig) {
    this.config = config;
    this.callSid = config.callSid;
    this.storeId = config.storeId;
    this.toolHandler = new CallToolHandler({
      apiBaseUrl: config.apiBaseUrl,
      internalApiKey: config.internalApiKey,
      storeId: config.storeId,
      callerPhone: config.callerPhone,
      callSid: config.callSid
    });
  }

  buildSessionUpdate(): {
    type: 'session.update';
    session: Record<string, unknown>;
  } {
    return {
      type: 'session.update',
      session: {
        model: this.config.openaiModel,
        modalities: ['text', 'audio'],
        voice: this.config.openaiVoice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad' },
        tools: buildToolDefinitions(),
        instructions: buildSystemPrompt(this.config.storeName)
      }
    };
  }

  start(twilioSocket: WebSocket): void {
    this.twilioWs = twilioSocket;

    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${this.config.openaiModel}`;
    this.openaiWs = new WebSocket(openaiUrl, {
      headers: {
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    this.openaiWs.on('open', () => {
      safeLog('info', 'openai_ws_connected', { callSid: this.callSid });
      this.openaiWs!.send(JSON.stringify(this.buildSessionUpdate()));
    });

    this.openaiWs.on('message', (data) => {
      this.handleOpenAIMessage(data.toString());
    });

    this.openaiWs.on('error', (err) => {
      safeLog('error', 'openai_ws_error', {
        callSid: this.callSid,
        error: err.message
      });
      this.handleOpenAIFailure();
    });

    this.openaiWs.on('close', () => {
      safeLog('info', 'openai_ws_closed', { callSid: this.callSid });
      if (!this.closed) this.cleanup('openai_disconnect');
    });

    twilioSocket.on('message', (data) => {
      this.handleTwilioMessage(data.toString());
    });

    twilioSocket.on('close', () => {
      safeLog('info', 'twilio_ws_closed', { callSid: this.callSid });
      this.cleanup('caller_hangup');
    });

    twilioSocket.on('error', (err) => {
      safeLog('error', 'twilio_ws_error', {
        callSid: this.callSid,
        error: err.message
      });
      this.cleanup('twilio_error');
    });

    safeLog('info', 'call_started', {
      callSid: this.callSid,
      storeId: this.storeId,
      callerPhone: this.config.callerPhone
    });
  }

  private handleTwilioMessage(raw: string): void {
    const msg = JSON.parse(raw);

    if (msg.event === 'media' && this.openaiWs?.readyState === WebSocket.OPEN) {
      const pcmBase64 = twilioToOpenAI(msg.media.payload);
      this.openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: pcmBase64
      }));
    }

    if (msg.event === 'stop') {
      this.cleanup('twilio_stop');
    }
  }

  private handleOpenAIMessage(raw: string): void {
    const msg = JSON.parse(raw);

    if (msg.type === 'response.audio.delta' && this.twilioWs?.readyState === WebSocket.OPEN) {
      const mulawBase64 = openAIToTwilio(msg.delta);
      this.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: this.config.streamSid,
        media: { payload: mulawBase64 }
      }));
    }

    if (msg.type === 'response.function_call_arguments.done') {
      this.handleFunctionCall(msg.call_id, msg.name, msg.arguments);
    }
  }

  private async handleFunctionCall(callId: string, name: string, argsJson: string): Promise<void> {
    safeLog('info', 'tool_called', {
      callSid: this.callSid,
      tool: name
    });

    const result = await this.toolHandler.execute(name, argsJson);

    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result
        }
      }));

      this.openaiWs.send(JSON.stringify({ type: 'response.create' }));
    }

    if (name === 'end_call') {
      await this.twilioHangup();
    }

    if (name === 'transfer_to_staff') {
      await this.twilioTransfer();
    }
  }

  private async twilioHangup(): Promise<void> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'Status=completed'
      });
    } catch (err) {
      safeLog('error', 'twilio_hangup_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    }
  }

  private async twilioTransfer(): Promise<void> {
    try {
      const twimlUrl = `${this.config.apiBaseUrl}/api/telephony/twiml-transfer?store_id=${this.storeId}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `Url=${encodeURIComponent(twimlUrl)}`
      });
    } catch (err) {
      safeLog('error', 'twilio_transfer_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    }
  }

  private handleOpenAIFailure(): void {
    const twimlUrl = `${this.config.apiBaseUrl}/api/telephony/twiml-error`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
        ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Url=${encodeURIComponent(twimlUrl)}`
    }).catch((err) => {
      safeLog('error', 'twilio_error_redirect_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    });
    this.cleanup('openai_failure');
  }

  cleanup(reason: string): void {
    if (this.closed) return;
    this.closed = true;

    const durationMs = Date.now() - this.startedAt;
    safeLog('info', 'call_ended', {
      callSid: this.callSid,
      storeId: this.storeId,
      duration_ms: durationMs,
      reason
    });

    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.close();
    }
    if (this.twilioWs && this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.close();
    }
  }
}
