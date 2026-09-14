import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import WebSocketClientMessageHandler from '@app/shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { WebSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import winston from 'winston';
import { WebSocket, WebSocketServer } from 'ws';

class PrivateEvent extends DomainEvent {
  public eventName(): string {
    return 'PRIVATE-EVENT';
  }
}

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Realtime fixture timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('WebSocket log privacy with real connections', () => {
  let directory: string;
  let server: WebSocketServer;
  let logger: WinstonLogger;
  let hub: WebSocketEventHub;
  let captured: Array<{ level: string; message: unknown }>;
  let clients: WebSocket[];
  let identities: IdentityId[];
  let messages: Array<Array<Record<string, unknown>>>;
  let previous: Record<string, string | undefined>;
  const handler = mock<WebSocketClientMessageHandler>();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pigeon-websocket-log-'));
    previous = Object.fromEntries(
      ['LOG_LEVEL', 'LOG_URL', 'SERVICE_NAME'].map((key) => [
        key,
        process.env[key],
      ]),
    );
    Object.assign(process.env, {
      LOG_LEVEL: 'debug',
      LOG_URL: '.',
      SERVICE_NAME: 'realtime-privacy',
    });
    captured = [];
    clients = [];
    messages = [[], [], []];
    identities = await Promise.all(
      [0, 1, 2].map(
        async () =>
          new IdentityId((await KeyPair.generate()).toPrimitives().publicKey),
      ),
    );
    jest.spyOn(Kernel, 'rootDirectory', 'get').mockReturnValue(directory);
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        captured.push(info as { level: string; message: unknown });
        if (typeof callback === 'function') callback();
      });
    logger = new WinstonLogger();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
    logger.info('Realtime privacy fixture started');
    hub = new WebSocketEventHub();
    hub.setClientMessageHandler(handler);
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    for (let index = 0; index < identities.length; index += 1) {
      server.once('connection', (socket) =>
        hub.register(identities[index], socket),
      );
      const client = new WebSocket(
        `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
      );
      clients.push(client);
      client.on('message', (data) =>
        messages[index].push(JSON.parse(data.toString())),
      );
      await until(() =>
        messages[index].some((message) => message.type === 'connection_ack'),
      );
    }
  });

  afterEach(async () => {
    for (const client of clients) client.terminate();
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    hub.clear();
    logger.logger.close();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });

  const assertPrivateLogs = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      logger.logger.once('finish', resolve);
      logger.logger.end();
    });
    const file = await readFile(
      join(directory, 'realtime-privacy.log'),
      'utf8',
    );
    for (const output of [file, JSON.stringify(captured)]) {
      expect(output).toContain('Realtime privacy fixture started');
      for (const value of [
        'PRIVATE-',
        ...identities.map((identity) => identity.valueOf()),
      ]) {
        expect(output).not.toContain(value);
      }
    }
  };

  it('delivers private events and typing without recording recipients or their activity', async () => {
    handler.findConversationTypingRecipients.mockResolvedValue([
      identities[1].valueOf(),
    ]);
    handler.findIdentityUpdateRecipients.mockResolvedValue([
      identities[1].valueOf(),
    ]);
    handler.findCommunityChannelEventRecipients.mockResolvedValue([
      identities[1].valueOf(),
    ]);
    const event = new PrivateEvent('PRIVATE-CONVERSATION', {
      recipientIdentityId: identities[1].valueOf(),
      payload: 'PRIVATE-SDP',
    });
    hub.publish([event]);
    const identityEvent = new PrivateEvent(identities[0].valueOf());
    jest
      .spyOn(identityEvent, 'eventName')
      .mockReturnValue('identities.v1.identity.was_updated');
    hub.publish([identityEvent]);
    const poll = new PrivateEvent('PRIVATE-POLL', {
      poll: {
        scope: {
          type: 'community_channel',
          communityId: 'PRIVATE-COMMUNITY',
          channelId: 'PRIVATE-CHANNEL',
        },
      },
    });
    jest.spyOn(poll, 'eventName').mockReturnValue('polls.v1.poll.was_created');
    hub.publish([poll]);
    clients[0].send(
      JSON.stringify({
        type: 'typing',
        scope: 'conversation',
        conversationId: 'PRIVATE-CONVERSATION',
        active: true,
      }),
    );
    await until(
      () =>
        messages[1].filter((message) => message.type === 'domain_event')
          .length === 3 &&
        messages[1].some((message) => message.type === 'typing'),
    );
    expect(messages[1]).toContainEqual({
      type: 'domain_event',
      event: JSON.parse(event.decode()),
    });
    clients[2].send(JSON.stringify({ type: 'identity_heartbeat' }));
    await until(() =>
      messages[2].some((message) => message.type === 'heartbeat_ack'),
    );
    expect(messages[2].map((message) => message.type)).toEqual([
      'connection_ack',
      'heartbeat_ack',
    ]);
    await assertPrivateLogs();
    expect(
      captured.filter((entry) => entry.level.includes('debug')),
    ).toHaveLength(0);
  });

  it('keeps handler failures private and continues heartbeats, typing and call acknowledgements', async () => {
    const error = new Error('PRIVATE-SDP PRIVATE-TEXT PRIVATE-KEY');
    handler.findConversationTypingRecipients
      .mockRejectedValueOnce(error)
      .mockResolvedValue([identities[1].valueOf()]);
    handler.acknowledgeCallSignal
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    handler.recordIdentityHeartbeat
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    handler.findIdentityUpdateRecipients.mockRejectedValueOnce(error);
    handler.findCommunityChannelEventRecipients.mockRejectedValueOnce(error);
    clients[0].send(
      JSON.stringify({
        type: 'typing',
        scope: 'conversation',
        conversationId: 'PRIVATE-CONVERSATION',
      }),
    );
    clients[0].send(
      JSON.stringify({ type: 'call_signal_ack', signalId: 'PRIVATE-SIGNAL' }),
    );
    clients[0].send(JSON.stringify({ type: 'identity_heartbeat' }));
    const identityEvent = new PrivateEvent(identities[0].valueOf());
    jest
      .spyOn(identityEvent, 'eventName')
      .mockReturnValue('identities.v1.identity.was_updated');
    hub.publish([identityEvent]);
    const poll = new PrivateEvent('PRIVATE-POLL', {
      poll: {
        scope: {
          type: 'community_channel',
          communityId: 'PRIVATE-COMMUNITY',
          channelId: 'PRIVATE-CHANNEL',
        },
      },
    });
    jest.spyOn(poll, 'eventName').mockReturnValue('polls.v1.poll.was_created');
    hub.publish([poll]);
    await until(
      () =>
        captured.filter((entry) => entry.level.includes('error')).length === 5,
    );
    clients[0].send(
      JSON.stringify({
        type: 'typing',
        scope: 'conversation',
        conversationId: 'PRIVATE-CONVERSATION',
        active: true,
      }),
    );
    clients[0].send(
      JSON.stringify({ type: 'call_signal_ack', signalId: 'PRIVATE-SIGNAL' }),
    );
    clients[0].send(
      JSON.stringify({ type: 'identity_heartbeat', active: true }),
    );
    await until(
      () =>
        messages[1].some((message) => message.type === 'typing') &&
        messages[0].filter((message) => message.type === 'heartbeat_ack')
          .length === 2,
    );
    expect(handler.acknowledgeCallSignal).toHaveBeenNthCalledWith(
      2,
      identities[0].valueOf(),
      'PRIVATE-SIGNAL',
    );
    expect(handler.recordIdentityHeartbeat).toHaveBeenNthCalledWith(
      2,
      identities[0].valueOf(),
      true,
    );
    await assertPrivateLogs();
    expect(
      captured.filter((entry) => entry.level.includes('error')),
    ).toHaveLength(5);
  });
});
