import 'reflect-metadata';
import 'module-alias/register';

import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/value-objects';
import axios, { AxiosError } from 'axios';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync, randomUUID } from 'crypto';
import fs from 'fs-extra';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import WebSocket from 'ws';

type IdentityFixture = {
  externalIdentifier?: string;
  id: string;
  keyPair: KeyPair;
};

type NodeRuntime = {
  baseUrl: string;
  databaseName: string;
  ipfsPath: string;
  name: string;
  port: number;
  process?: ChildProcessWithoutNullStreams;
  stderr: string[];
  stdout: string[];
};

type SignedHeaders = {
  'x-identity-id': string;
  'x-nonce': string;
  'x-signature': string;
  'x-timestamp': string;
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

  const mongo = await MongoMemoryServer.create();
  const networkKey = generateNetworkKey();
  const nodeA = buildNodeRuntime('node-a', 19180);
  const nodeB = buildNodeRuntime('node-b', 19181);
  let nodeAIdentity: IdentityFixture | undefined;
  let nodeBIdentity: IdentityFixture | undefined;

  try {
    await startNode(nodeA, mongo.getUri());
    await addPrivateNetwork(nodeA, networkKey);
    nodeAIdentity = await publishIdentity(nodeA, 'Node A', 'node-a');
    const nodeAKeychain = await publishKeychain(nodeA, nodeAIdentity);

    await startNode(nodeB, mongo.getUri());
    await addPrivateNetwork(nodeB, networkKey);
    await stopNode(nodeB);

    await startNode(nodeB, mongo.getUri());
    await waitForIdentity(nodeB, nodeAIdentity.id);
    await waitForKeychain(nodeB, nodeAIdentity);

    nodeBIdentity = await publishIdentity(nodeB, 'Node B', 'node-b');
    await publishKeychain(nodeB, nodeBIdentity);
    await waitForIdentity(nodeA, nodeBIdentity.id);
    await waitForKeychain(nodeA, nodeBIdentity);

    const conversation = await createOneToOneConversation(
      nodeA,
      nodeAIdentity,
      nodeBIdentity,
      nodeAKeychain,
    );
    await waitForConversation(nodeB, nodeBIdentity, conversation.id);

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
    await waitForMessage(nodeB, nodeBIdentity, conversation.id, messageFromA.id);

    await stopNode(nodeB);
    const offlineMessageFromA = await sendConversationMessage(
      nodeA,
      nodeAIdentity,
      conversation.id,
      [messageFromA.id],
      'node-a-offline-message-payload',
    );

    await startNode(nodeB, mongo.getUri());
    await waitForMessage(
      nodeB,
      nodeBIdentity,
      conversation.id,
      offlineMessageFromA.id,
    );
    await waitForConversationTimeline(
      nodeB,
      nodeBIdentity,
      conversation.id,
      [messageFromA.id, offlineMessageFromA.id],
    );

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
    await waitForMessage(nodeA, nodeAIdentity, conversation.id, messageFromB.id);
    await waitForConversationTimeline(
      nodeA,
      nodeAIdentity,
      conversation.id,
      [messageFromA.id, offlineMessageFromA.id, messageFromB.id],
    );
    await waitForConversationTimeline(
      nodeB,
      nodeBIdentity,
      conversation.id,
      [messageFromA.id, offlineMessageFromA.id, messageFromB.id],
    );

    console.info(
      JSON.stringify(
        {
          conversationId: conversation.id,
          messageFromA: messageFromA.id,
          offlineMessageFromA: offlineMessageFromA.id,
          messageFromB: messageFromB.id,
          nodeAIdentityId: nodeAIdentity.id,
          nodeBIdentityId: nodeBIdentity.id,
          result: 'PASS',
          transportDsn: 'libp2p-gossipsub://',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([stopNode(nodeA), stopNode(nodeB)]);
    await mongo.stop();
    await fs.remove(TMP_ROOT);
  }
}

function buildNodeRuntime(name: string, port: number): NodeRuntime {
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    databaseName: `pigeon_swarm_${name.replace('-', '_')}_e2e`,
    ipfsPath: path.join(TMP_ROOT, name, 'ipfs'),
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

async function startNode(node: NodeRuntime, mongoUrl: string): Promise<void> {
  await fs.ensureDir(node.ipfsPath);

  node.stdout = [];
  node.stderr = [];
  node.process = spawn(NODE_COMMAND, NODE_ARGS, {
    cwd: ROOT,
    env: {
      ...process.env,
      API_PORT: String(node.port),
      IPFS_STORAGE_PATH: node.ipfsPath,
      MONGO_DATABASE: node.databaseName,
      MONGO_URL: mongoUrl,
      NODE_ENV: 'local',
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
    id,
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
  const response = await request(node, 'POST', '/identities/', body);

  return {
    externalIdentifier: response.identityExternalIdentifier,
    id: response.id,
    keyPair,
  };
}

async function publishKeychain(
  node: NodeRuntime,
  identity: IdentityFixture,
): Promise<string> {
  const bodyWithoutSignature = {
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
    signature: identity.keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
  };
  const response = await request(node, 'POST', '/keychains/', body, identity);

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

  return request(node, 'POST', '/conversations/', body, owner);
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
    attachmentExternalIdentifiers: [] as string[],
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
    attachmentExternalIdentifiers: [],
    createdAt,
    encryptedPayload,
    id,
    previousMessageIds,
    signature: author.keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
  };
  const path = `/conversations/${encodeURIComponent(conversationId)}/messages`;

  return request(node, 'POST', path, body, author);
}

async function waitForIdentity(
  node: NodeRuntime,
  identityId: string,
): Promise<void> {
  const path = `/identities/${encodeURIComponent(identityId)}`;

  await waitFor(async () => (await requestMaybe(node, 'GET', path)) !== undefined, `${node.name} to sync identity`);
}

async function waitForKeychain(
  node: NodeRuntime,
  identity: IdentityFixture,
): Promise<void> {
  const path = `/keychains/${encodeURIComponent(identity.id)}`;

  await waitFor(
    async () => (await requestMaybe(node, 'GET', path, undefined, identity)) !== undefined,
    `${node.name} to sync keychain`,
  );
}

async function waitForConversation(
  node: NodeRuntime,
  identity: IdentityFixture,
  conversationId: string,
): Promise<void> {
  await waitFor(async () => {
    const response = await requestMaybe(
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
      ? conversations.some((conversation: { id: string }) => conversation.id === conversationId)
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
    async () => (await requestMaybe(node, 'GET', path, undefined, identity)) !== undefined,
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
    const response = await requestMaybe(node, 'GET', path, undefined, identity);
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
  const nonce = randomUUID();
  const signature = signRequest(identity.keyPair, 'GET', '/ws', timestamp, nonce, {});
  const query = new URLSearchParams({
    identityId: identity.id,
    nonce,
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

async function request(
  node: NodeRuntime,
  method: string,
  requestPath: string,
  body?: unknown,
  signer?: IdentityFixture,
): Promise<any> {
  const canonicalPath = requestPath.split('?')[0];
  const response = await axios.request({
    data: body,
    headers: signer
      ? signHeaders(signer, method, canonicalPath, body ?? {})
      : {},
    method,
    timeout: REQUEST_TIMEOUT_MS,
    url: `${node.baseUrl}${requestPath}`,
  });

  return response.data;
}

async function requestMaybe(
  node: NodeRuntime,
  method: string,
  requestPath: string,
  body?: unknown,
  signer?: IdentityFixture,
): Promise<any | undefined> {
  try {
    return await request(node, method, requestPath, body, signer);
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return undefined;
    }

    if (
      error instanceof AxiosError &&
      error.response?.status === 409 &&
      typeof error.response.data?.code === 'string' &&
      error.response.data.code.endsWith('NotFoundError')
    ) {
      return undefined;
    }

    throw error;
  }
}

function signHeaders(
  identity: IdentityFixture,
  method: string,
  requestPath: string,
  body: unknown,
): SignedHeaders {
  const timestamp = String(Date.now());
  const nonce = randomUUID();

  return {
    'x-identity-id': identity.id,
    'x-nonce': nonce,
    'x-signature': signRequest(
      identity.keyPair,
      method,
      requestPath,
      timestamp,
      nonce,
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
  nonce: string,
  body: unknown,
): string {
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    method,
    requestPath,
    timestamp,
    nonce,
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
