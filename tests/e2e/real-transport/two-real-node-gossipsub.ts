import 'reflect-metadata';
import 'module-alias/register';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/value-objects';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import WebSocket from 'ws';

type IdentityFixture = {
  externalIdentifier?: string;
  id: string;
  keyPair: KeyPair;
};

type NodeRuntime = {
  baseUrl: string;
  ipfsPath: string;
  localDbPath: string;
  name: string;
  port: number;
  process?: ChildProcessWithoutNullStreams;
  stderr: string[];
  stdout: string[];
};

type SignedHeaders = {
  'x-identity-id': string;
  'x-signature': string;
  'x-timestamp': string;
};

type CallSignalDeliveryResult = {
  attempts: number[];
  expiresAt: number;
  signalId: string;
};

type CallSignalMessage = {
  event?: {
    aggregate_id?: unknown;
    attributes?: Record<string, unknown>;
    type?: unknown;
  };
  type?: unknown;
};

type CallSignalAttributes = {
  attempt: unknown;
  recipientIdentityId: unknown;
  signalId: string;
};

type CallSignalReceiver = {
  attempts: number[];
  delivery?: { expiresAt: number; signalId: string };
  sent: boolean;
  settleTimeout?: ReturnType<typeof setTimeout>;
};

type CallSignalReceiverContext = {
  callId: string;
  fail: (error: unknown) => void;
  identityId: string;
  sendSignal: () => Promise<{ expiresAt: number; signalId: string }>;
  timeout: ReturnType<typeof setTimeout>;
  ws: WebSocket;
};

type IdentityResponse = {
  identityExternalIdentifier: string;
  id: string;
  profile?: {
    handle?: string;
  };
  version?: number;
};

type KeychainResponse = {
  keychainExternalIdentifier: string;
};

type ConversationResponse = {
  id: string;
};

type CallResponse = {
  id: string;
};

type ConversationListResponse = {
  conversations?: ConversationResponse[];
  data?: ConversationResponse[];
};

type MessageListResponse = {
  data?: Array<{ id: string }>;
  messages?: Array<{ id: string }>;
};

type HttpRequestError = Error & {
  response: {
    data: unknown;
    status: number;
  };
};

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-real-node-gossipsub-e2e');
const NODE_COMMAND = process.execPath;
const NODE_ARGS = [
  '-r',
  'ts-node/register',
  '-r',
  'tsconfig-paths/register',
  path.join(ROOT, 'src/index.ts'),
];
const NETWORK_ID = '550e8400-e29b-41d4-a716-446655449999';
const NETWORK_NAME = 'two-real-node-e2e';
const PASSWORD = 'NodeE2ESecret1!';
const REQUEST_TIMEOUT_MS = 15000;
const WAIT_TIMEOUT_MS = 60000;

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  await fs.ensureDir(TMP_ROOT);

  const networkKey = generateNetworkKey();
  const nodeA = buildNodeRuntime('node-a', 19180);
  const nodeB = buildNodeRuntime('node-b', 19181);
  let nodeAIdentity: IdentityFixture | undefined;
  let nodeBIdentity: IdentityFixture | undefined;

  try {
    await startNode(nodeA);
    await addPrivateNetwork(nodeA, networkKey);
    nodeAIdentity = await publishIdentity(nodeA, 'Node A', 'node-a');
    const nodeAKeychain = await publishKeychain(nodeA, nodeAIdentity);

    await startNode(nodeB);
    await addPrivateNetwork(nodeB, networkKey);
    await stopNode(nodeB);

    await startNode(nodeB);
    await waitForIdentity(nodeB, nodeAIdentity.id);
    await waitForKeychain(nodeB, nodeAIdentity);

    nodeBIdentity = await publishIdentity(nodeB, 'Node B', 'node-b');
    await publishKeychain(nodeB, nodeBIdentity);
    await waitForIdentity(nodeA, nodeBIdentity.id);
    await waitForKeychain(nodeA, nodeBIdentity);

    for (let version = 2; version <= 4; version++) {
      nodeAIdentity = await updateIdentity(
        nodeA,
        nodeAIdentity,
        version,
        `Node A v${version}`,
        'node-a',
      );
    }
    await waitForIdentityVersion(nodeB, 'node-a', 4, 'node-a');

    const conversation = await createOneToOneConversation(
      nodeA,
      nodeAIdentity,
      nodeBIdentity,
      nodeAKeychain,
    );
    await waitForConversation(nodeB, nodeBIdentity, conversation.id);

    const call = await request<CallResponse>(
      nodeA,
      'POST',
      '/calls/',
      {
        conversationId: conversation.id,
        scopeType: 'conversation',
      },
      nodeAIdentity,
    );
    const callSignal = await receiveAndAcknowledgeCallSignal(
      nodeB,
      nodeBIdentity,
      call.id,
      () =>
        request(
          nodeA,
          'POST',
          `/calls/${call.id}/signals`,
          {
            payload: { sdp: 'node-a-offer-sdp' },
            recipientIdentityId: nodeBIdentity?.id,
            signalType: 'offer',
          },
          nodeAIdentity,
        ),
    );

    if (
      new Set(callSignal.attempts).size !== 1 ||
      callSignal.attempts[0] !== 1
    ) {
      throw new Error(
        `Call signal retried after acknowledgement: attempts=${callSignal.attempts.join(',')}`,
      );
    }

    const nodeBMessages = listenForDomainEvents(
      nodeB,
      nodeBIdentity,
      'conversations.v1.message.was_sent',
      conversation.id,
    );
    const messageFromA = await sendConversationMessage(
      nodeA,
      nodeAIdentity,
      conversation.id,
      [],
      'node-a-message-payload',
    );
    await nodeBMessages;
    await waitForMessage(
      nodeB,
      nodeBIdentity,
      conversation.id,
      messageFromA.id,
    );

    await stopNode(nodeB);
    const offlineMessageFromA = await sendConversationMessage(
      nodeA,
      nodeAIdentity,
      conversation.id,
      [messageFromA.id],
      'node-a-offline-message-payload',
    );

    await startNode(nodeB);
    await waitForMessage(
      nodeB,
      nodeBIdentity,
      conversation.id,
      offlineMessageFromA.id,
    );
    await waitForConversationTimeline(nodeB, nodeBIdentity, conversation.id, [
      messageFromA.id,
      offlineMessageFromA.id,
    ]);

    const nodeAMessages = listenForDomainEvents(
      nodeA,
      nodeAIdentity,
      'conversations.v1.message.was_sent',
      conversation.id,
    );
    const messageFromB = await sendConversationMessage(
      nodeB,
      nodeBIdentity,
      conversation.id,
      [offlineMessageFromA.id],
      'node-b-reply-payload',
    );
    await nodeAMessages;
    await waitForMessage(
      nodeA,
      nodeAIdentity,
      conversation.id,
      messageFromB.id,
    );
    await waitForConversationTimeline(nodeA, nodeAIdentity, conversation.id, [
      messageFromA.id,
      offlineMessageFromA.id,
      messageFromB.id,
    ]);
    await waitForConversationTimeline(nodeB, nodeBIdentity, conversation.id, [
      messageFromA.id,
      offlineMessageFromA.id,
      messageFromB.id,
    ]);

    console.info(
      JSON.stringify(
        {
          callId: call.id,
          callSignalId: callSignal.signalId,
          conversationId: conversation.id,
          messageFromA: messageFromA.id,
          messageFromB: messageFromB.id,
          nodeAIdentityId: nodeAIdentity.id,
          nodeBIdentityId: nodeBIdentity.id,
          offlineMessageFromA: offlineMessageFromA.id,
          result: 'PASS',
          transportDsn: 'libp2p-gossipsub://',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([stopNode(nodeA), stopNode(nodeB)]);
    await fs.remove(TMP_ROOT);
  }
}

function buildNodeRuntime(name: string, port: number): NodeRuntime {
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    ipfsPath: path.join(TMP_ROOT, name, 'ipfs'),
    localDbPath: path.join(TMP_ROOT, name, 'local-db'),
    name,
    port,
    stderr: [],
    stdout: [],
  };
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

async function startNode(node: NodeRuntime): Promise<void> {
  await fs.ensureDir(node.ipfsPath);
  await fs.ensureDir(node.localDbPath);

  node.stdout = [];
  node.stderr = [];
  node.process = spawn(NODE_COMMAND, NODE_ARGS, {
    cwd: ROOT,
    env: {
      ...process.env,
      API_PORT: String(node.port),
      IPFS_STORAGE_PATH: node.ipfsPath,
      NODE_ENV: 'local',
      PIGEON_LOCAL_DB_PATH: node.localDbPath,
      ROUTE_PREFIX: '',
      STARTUP_SYNC_PEER_WAIT_MS: '10000',
      TRANSPORT_DSN: 'libp2p-gossipsub://',
      TRANSPORT_MAX_RETRIES: '0',
      TRANSPORT_RETRY_DELAY: '0',
    },
  });

  node.process.stdout.on('data', (data: Buffer) => {
    const text = data.toString();

    node.stdout.push(text);
    process.stdout.write(`[${node.name}] ${text}`);
  });
  node.process.stderr.on('data', (data: Buffer) => {
    const text = data.toString();

    node.stderr.push(text);
    process.stderr.write(`[${node.name}] ${text}`);
  });

  await waitFor(
    () =>
      node.stdout.some((line) => line.includes('Ready!')) ||
      node.stderr.some((line) => line.includes('Application error')),
    `${node.name} to become ready`,
    WAIT_TIMEOUT_MS,
  );

  if (node.stderr.some((line) => line.includes('Application error'))) {
    throw new Error(`${node.name} failed to start:\n${node.stderr.join('')}`);
  }
}

async function stopNode(node: NodeRuntime): Promise<void> {
  if (!node.process || node.process.killed) {
    return;
  }

  const processToStop = node.process;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      processToStop.kill('SIGKILL');
      resolve();
    }, 5000);

    processToStop.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    processToStop.kill('SIGTERM');
  });

  node.process = undefined;
}

async function addPrivateNetwork(
  node: NodeRuntime,
  networkKey: string,
): Promise<void> {
  await request(node, 'POST', '/node/networks/', {
    id: NETWORK_ID,
    key: networkKey,
    name: NETWORK_NAME,
  });
}

async function publishIdentity(
  node: NodeRuntime,
  name: string,
  handle: string,
): Promise<IdentityFixture> {
  const keyPair = await KeyPair.generate();
  const id = new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
  const encryptedKeyPair = await keyPair.encryptKeyPair(PASSWORD);
  const timestamp = Date.now();
  const version = 1;
  const signaturePayload = {
    encryptedKeyPair: encryptedKeyPair.toPrimitives(),
    encryptedMasterKey: 'v1.e2e.encrypted-master-key',
    id,
    masterKeyDerivation: {
      passkeyPrf: {
        algorithm: 'webauthn-prf',
        credentialId: `${handle}-credential-id`,
        salt: `${handle}-salt`,
        version: 1,
      },
    },
    networks: [NETWORK_ID],
    previousIdentityExternalIdentifier: undefined as string | undefined,
    profile: {
      banner: undefined as string | undefined,
      biography: undefined as string | undefined,
      handle,
      name,
      picture: undefined as string | undefined,
    },
    timestamp,
    version,
  };
  const body = {
    ...signaturePayload,
    signature: keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
  };
  const response = await request<IdentityResponse>(
    node,
    'POST',
    '/identities/',
    body,
  );

  return {
    externalIdentifier: response.identityExternalIdentifier,
    id: response.id,
    keyPair,
  };
}

async function updateIdentity(
  node: NodeRuntime,
  identity: IdentityFixture,
  version: number,
  name: string,
  handle: string,
): Promise<IdentityFixture> {
  const encryptedKeyPair = await identity.keyPair.encryptKeyPair(PASSWORD);
  const signaturePayload = {
    encryptedKeyPair: encryptedKeyPair.toPrimitives(),
    encryptedMasterKey: 'v1.test.encrypted-master-key',
    id: identity.id,
    masterKeyDerivation: {
      passkeyPrf: {
        algorithm: 'webauthn-prf',
        credentialId: 'test-credential-id',
        salt: 'test-salt',
        version: 1,
      },
    },
    networks: [NETWORK_ID],
    previousIdentityExternalIdentifier: identity.externalIdentifier,
    profile: {
      banner: undefined as string | undefined,
      biography: undefined as string | undefined,
      handle,
      name,
      picture: undefined as string | undefined,
    },
    timestamp: Date.now(),
    version,
  };
  const body = {
    ...signaturePayload,
    signature: identity.keyPair
      .sign(JSON.stringify(signaturePayload))
      .valueOf(),
  };
  const response = await request<IdentityResponse>(
    node,
    'PUT',
    `/identities/${encodeURIComponent(identity.id)}`,
    body,
    identity,
  );

  return {
    externalIdentifier: response.identityExternalIdentifier,
    id: response.id,
    keyPair: identity.keyPair,
  };
}

async function publishKeychain(
  node: NodeRuntime,
  identity: IdentityFixture,
): Promise<string> {
  const bodyWithoutSignature: {
    encryptedPayload: string;
    previousKeychainExternalIdentifier: string | null;
    timestamp: number;
    version: number;
  } = {
    encryptedPayload: `encrypted-keychain-payload-${node.name}`,
    previousKeychainExternalIdentifier: null,
    timestamp: Date.now(),
    version: 1,
  };
  const signaturePayload = {
    encryptedPayload: bodyWithoutSignature.encryptedPayload,
    ownerIdentityId: identity.id,
    previousKeychainExternalIdentifier: undefined as string | undefined,
    timestamp: bodyWithoutSignature.timestamp,
    version: bodyWithoutSignature.version,
  };
  const body = {
    ...bodyWithoutSignature,
    signature: identity.keyPair
      .sign(JSON.stringify(signaturePayload))
      .valueOf(),
  };
  const response = await request<KeychainResponse>(
    node,
    'POST',
    '/keychains/',
    body,
    identity,
  );

  return response.keychainExternalIdentifier;
}

async function createOneToOneConversation(
  node: NodeRuntime,
  owner: IdentityFixture,
  participant: IdentityFixture,
  keychainExternalIdentifier: string,
): Promise<{ id: string }> {
  const body = {
    keychainExternalIdentifier,
    networkId: NETWORK_ID,
    participantIds: [owner.id, participant.id],
    type: 'one-to-one',
  };

  return request<ConversationResponse>(
    node,
    'POST',
    '/conversations/',
    body,
    owner,
  );
}

async function sendConversationMessage(
  node: NodeRuntime,
  author: IdentityFixture,
  conversationId: string,
  previousMessageIds: string[],
  encryptedPayload: string,
): Promise<{ id: string }> {
  const id = MessageId.generate().valueOf();
  const createdAt = Date.now();
  const signaturePayload = {
    authorId: author.id,
    conversationId,
    createdAt,
    encryptedPayload,
    id,
    previousMessageIds,
    replyToMessageId: undefined as string | undefined,
    targetMessageId: undefined as string | undefined,
    type: MessageType.SENT.valueOf(),
  };
  const body = {
    createdAt,
    encryptedPayload,
    id,
    previousMessageIds,
    signature: author.keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
  };
  const path = `/conversations/${encodeURIComponent(conversationId)}/messages`;

  return request<ConversationResponse>(node, 'POST', path, body, author);
}

async function waitForIdentity(
  node: NodeRuntime,
  identityId: string,
): Promise<void> {
  const path = `/identities/${encodeURIComponent(identityId)}`;

  await waitFor(
    async () => (await requestMaybe(node, 'GET', path)) !== undefined,
    `${node.name} to sync identity`,
  );
}

async function waitForIdentityVersion(
  node: NodeRuntime,
  identityReference: string,
  version: number,
  handle: string,
): Promise<void> {
  const requestPath = `/identities/${encodeURIComponent(identityReference)}`;

  await waitFor(async () => {
    const identity = await requestMaybe<IdentityResponse>(
      node,
      'GET',
      requestPath,
    );

    return (
      identity?.version === version && identity?.profile?.handle === handle
    );
  }, `${node.name} to sync identity version ${version}`);
}

async function waitForKeychain(
  node: NodeRuntime,
  identity: IdentityFixture,
): Promise<void> {
  const path = `/keychains/${encodeURIComponent(identity.id)}`;

  await waitFor(
    async () =>
      (await requestMaybe(node, 'GET', path, undefined, identity)) !==
      undefined,
    `${node.name} to sync keychain`,
  );
}

async function waitForConversation(
  node: NodeRuntime,
  identity: IdentityFixture,
  conversationId: string,
): Promise<void> {
  await waitFor(async () => {
    const response = await requestMaybe<ConversationListResponse>(
      node,
      'GET',
      `/conversations/?limit=30`,
      undefined,
      identity,
    );
    const conversations = Array.isArray(response?.conversations)
      ? response.conversations
      : response?.data;

    return Array.isArray(conversations)
      ? conversations.some(
          (conversation: { id: string }) => conversation.id === conversationId,
        )
      : false;
  }, `${node.name} to sync conversation`);
}

async function waitForMessage(
  node: NodeRuntime,
  identity: IdentityFixture,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const path = `/conversations/${encodeURIComponent(
    conversationId,
  )}/messages/${encodeURIComponent(messageId)}`;

  await waitFor(
    async () =>
      (await requestMaybe(node, 'GET', path, undefined, identity)) !==
      undefined,
    `${node.name} to sync message ${messageId}`,
  );
}

async function waitForConversationTimeline(
  node: NodeRuntime,
  identity: IdentityFixture,
  conversationId: string,
  messageIds: string[],
): Promise<void> {
  const path = `/conversations/${encodeURIComponent(
    conversationId,
  )}/messages?limit=30`;

  await waitFor(async () => {
    const response = await requestMaybe<MessageListResponse>(
      node,
      'GET',
      path,
      undefined,
      identity,
    );
    const messages = Array.isArray(response?.messages)
      ? response.messages
      : response?.data;

    if (!Array.isArray(messages)) {
      return false;
    }

    const listedMessageIds = messages.map((message: { id: string }) => {
      return message.id;
    });

    return messageIds.every((messageId) =>
      listedMessageIds.includes(messageId),
    );
  }, `${node.name} to list synced messages in ${conversationId}`);
}

async function listenForDomainEvents(
  node: NodeRuntime,
  identity: IdentityFixture,
  eventType: string,
  aggregateId: string,
): Promise<void> {
  const timestamp = String(Date.now());
  const signature = signRequest(identity.keyPair, 'GET', '/ws', timestamp, {});
  const query = new URLSearchParams({
    identityId: identity.id,
    signature,
    timestamp,
  });
  const ws = new WebSocket(
    `ws://127.0.0.1:${node.port}/ws?${query.toString()}`,
  );

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          `${node.name} did not receive ${eventType} for ${aggregateId}`,
        ),
      );
    }, WAIT_TIMEOUT_MS);

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (
        message.type === 'domain_event' &&
        message.event?.type === eventType &&
        message.event?.aggregate_id === aggregateId
      ) {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function receiveAndAcknowledgeCallSignal(
  node: NodeRuntime,
  identity: IdentityFixture,
  callId: string,
  sendSignal: () => Promise<{ expiresAt: number; signalId: string }>,
): Promise<CallSignalDeliveryResult> {
  const timestamp = String(Date.now());
  const signature = signRequest(identity.keyPair, 'GET', '/ws', timestamp, {});
  const query = new URLSearchParams({
    identityId: identity.id,
    signature,
    timestamp,
  });
  const ws = new WebSocket(
    `ws://127.0.0.1:${node.port}/ws?${query.toString()}`,
  );

  return new Promise<CallSignalDeliveryResult>((resolve, reject) => {
    const attempts: number[] = [];
    let delivery: { expiresAt: number; signalId: string } | undefined;
    let settleTimeout: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`${node.name} did not receive a signal for ${callId}`));
    }, WAIT_TIMEOUT_MS);
    const fail = (error: unknown): void => {
      clearTimeout(timeout);

      if (settleTimeout) {
        clearTimeout(settleTimeout);
      }

      ws.close();
      reject(error);
    };

    ws.on('message', (data) => {
      const receiver: CallSignalReceiver = {
        attempts,
        delivery,
        sent,
        settleTimeout,
      };
      handleCallSignalMessage(
        JSON.parse(data.toString()) as CallSignalMessage,
        receiver,
        {
          callId,
          fail,
          identityId: identity.id,
          sendSignal,
          timeout,
          ws,
        },
        resolve,
        reject,
      );
      delivery = receiver.delivery;
      sent = receiver.sent;
      settleTimeout = receiver.settleTimeout;
    });
    ws.on('error', fail);
  });
}

function handleCallSignalMessage(
  message: CallSignalMessage,
  receiver: CallSignalReceiver,
  context: CallSignalReceiverContext,
  resolve: (result: CallSignalDeliveryResult) => void,
  reject: (error: unknown) => void,
): void {
  if (message.type === 'connection_ack' && !receiver.sent) {
    receiver.sent = true;
    void context
      .sendSignal()
      .then((result) => {
        receiver.delivery = result;
      })
      .catch(context.fail);

    return;
  }

  const attributes = callSignalAttributes(message, context);

  if (!attributes) {
    return;
  }

  receiver.attempts.push(Number(attributes.attempt));
  context.ws.send(
    JSON.stringify({
      signalId: attributes.signalId,
      type: 'call_signal_ack',
    }),
  );

  if (!receiver.settleTimeout) {
    receiver.settleTimeout = setTimeout(
      () =>
        settleCallSignalDelivery(
          receiver,
          attributes.signalId,
          context,
          resolve,
          reject,
        ),
      3_000,
    );
  }
}

function callSignalAttributes(
  message: CallSignalMessage,
  context: CallSignalReceiverContext,
): CallSignalAttributes | undefined {
  const event = message.event;
  const attributes = event?.attributes;

  if (!isCallSignalEvent(message, context)) {
    return undefined;
  }

  if (attributes?.recipientIdentityId !== context.identityId) {
    return undefined;
  }

  if (typeof attributes?.signalId !== 'string') {
    return undefined;
  }

  return {
    attempt: attributes.attempt,
    recipientIdentityId: attributes.recipientIdentityId,
    signalId: attributes.signalId,
  };
}

function isCallSignalEvent(
  message: CallSignalMessage,
  context: CallSignalReceiverContext,
): boolean {
  return (
    message.type === 'domain_event' &&
    message.event?.type === 'calls.v1.signal.sent' &&
    message.event.aggregate_id === context.callId
  );
}

function settleCallSignalDelivery(
  receiver: CallSignalReceiver,
  signalId: string,
  context: CallSignalReceiverContext,
  resolve: (result: CallSignalDeliveryResult) => void,
  reject: (error: unknown) => void,
): void {
  clearTimeout(context.timeout);
  context.ws.close();

  if (!receiver.delivery || receiver.delivery.signalId !== signalId) {
    reject(
      new Error(
        `Signal response/event mismatch: response=${receiver.delivery?.signalId} event=${signalId}`,
      ),
    );

    return;
  }

  resolve({
    attempts: receiver.attempts,
    expiresAt: receiver.delivery.expiresAt,
    signalId: receiver.delivery.signalId,
  });
}

async function request<T = unknown>(
  node: NodeRuntime,
  method: string,
  requestPath: string,
  body?: unknown,
  signer?: IdentityFixture,
): Promise<T> {
  const canonicalPath = requestPath.split('?')[0];
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${node.baseUrl}${requestPath}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Connection: 'close',
        ...(signer
          ? signHeaders(signer, method, canonicalPath, body ?? {})
          : {}),
      },
      method,
      signal: abortController.signal,
    });
    const responseData = await readResponseData(response);

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status} ${response.statusText}`,
      ) as HttpRequestError;
      error.response = {
        data: responseData,
        status: response.status,
      };
      throw error;
    }

    return responseData as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestMaybe<T = unknown>(
  node: NodeRuntime,
  method: string,
  requestPath: string,
  body?: unknown,
  signer?: IdentityFixture,
): Promise<T | undefined> {
  try {
    return await request<T>(node, method, requestPath, body, signer);
  } catch (error) {
    if (isIgnorableNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isIgnorableNotFoundError(error: unknown): boolean {
  if (!isHttpRequestError(error)) {
    return false;
  }

  if (error.response.status === 404) {
    return true;
  }

  const responseData = error.response.data;

  return (
    error.response.status === 409 &&
    isRecord(responseData) &&
    typeof responseData.code === 'string' &&
    responseData.code.endsWith('NotFoundError')
  );
}

async function readResponseData(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpRequestError(value: unknown): value is HttpRequestError {
  return (
    value instanceof Error &&
    isRecord(value) &&
    isRecord(value.response) &&
    typeof value.response.status === 'number' &&
    'data' in value.response
  );
}

function signHeaders(
  identity: IdentityFixture,
  method: string,
  requestPath: string,
  body: unknown,
): SignedHeaders {
  const timestamp = String(Date.now());

  return {
    'x-identity-id': identity.id,
    'x-signature': signRequest(
      identity.keyPair,
      method,
      requestPath,
      timestamp,
      body,
    ),
    'x-timestamp': timestamp,
  };
}

function signRequest(
  keyPair: KeyPair,
  method: string,
  requestPath: string,
  timestamp: string,
  body: unknown,
): string {
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    method,
    requestPath,
    timestamp,
    body,
  );

  return keyPair.sign(JSON.stringify(payload)).valueOf();
}

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  label: string,
  timeoutMs: number = WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  throw new Error(`Timed out waiting for ${label}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
