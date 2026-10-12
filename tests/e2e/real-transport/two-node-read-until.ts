import { rm } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';

import type { IdentityFixture, NodeRuntime } from './two-real-node-gossipsub';
import {
  addPrivateNetwork,
  buildNodeRuntime,
  createOneToOneConversation,
  generateNetworkKey,
  publishIdentity,
  publishKeychain,
  request,
  sendConversationMessage,
  signRequest,
  startNode,
  stopNode,
  waitFor,
  waitForConversation,
  waitForIdentity,
  waitForKeychain,
  waitForMessage,
} from './two-real-node-gossipsub';
import {
  connectRealtimeSocket,
  issueRealtimeTicket,
} from './RealtimeTicketClient';

const ROOT = path.resolve(
  process.env.PIGEON_TEST_SOURCE_ROOT || path.resolve(__dirname, '../../..'),
);
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-node-read-until-e2e');
const NODE_A_PORT = 19220;
const NODE_B_PORT = 19221;
const READ_RECEIPT_EVENT = 'conversations.v1.messages.were_read';
// Lets replicated state settle before a rejected marker is asserted to have no effect.
const SETTLE_MS = 2_000;
// Read-until ordering compares createdAt, so consecutive messages get distinct timestamps.
const CREATED_AT_GAP_MS = 10;
// Inside the 30 s clock-skew window, so only the ordering rule can reject it.
const STALE_BY_MS = 5_000;

type ReadUntilRequest = {
  body: { messageId: string };
  headers: Record<string, string>;
  path: string;
};

type RealtimeMessage = {
  event?: {
    aggregate_id?: unknown;
    attributes?: { messageId?: unknown };
    type?: unknown;
  };
  type?: unknown;
};

type RealtimeSocket = { messages: RealtimeMessage[]; ws: WebSocket };

type ConversationsResponse = {
  conversations: Array<{ id: string; unreadCount: number }>;
};

async function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, ms);

  return promise;
}

function signReadUntil(
  signer: IdentityFixture,
  conversationId: string,
  messageId: string,
  signedAt: number = Date.now(),
): ReadUntilRequest {
  const requestPath = `/conversations/${encodeURIComponent(conversationId)}/messages/read-until`;
  const body = { messageId };
  const timestamp = String(signedAt);

  return {
    body,
    headers: {
      'x-identity-id': signer.id,
      'x-signature': signRequest(
        signer.keyPair,
        'PUT',
        requestPath,
        timestamp,
        body,
      ),
      'x-timestamp': timestamp,
    },
    path: requestPath,
  };
}

async function sendReadUntil(
  node: NodeRuntime,
  marker: ReadUntilRequest,
  headers: Record<string, string> = marker.headers,
): Promise<number> {
  const response = await fetch(`${node.baseUrl}${marker.path}`, {
    body: JSON.stringify(marker.body),
    headers: { 'content-type': 'application/json', ...headers },
    method: 'PUT',
  });

  await response.text();

  return response.status;
}

async function unreadCountOf(
  node: NodeRuntime,
  reader: IdentityFixture,
  conversationId: string,
): Promise<number> {
  const { conversations } = await request<ConversationsResponse>(
    node,
    'GET',
    '/conversations/',
    undefined,
    reader,
  );
  const conversation = conversations.find(
    (item) => item.id === conversationId,
  );

  if (!conversation) {
    throw new Error(`${node.name} does not list the conversation for reader`);
  }

  return conversation.unreadCount;
}

async function openRealtimeSocket(
  node: NodeRuntime,
  identity: IdentityFixture,
  label: string,
): Promise<RealtimeSocket> {
  const ticket = await issueRealtimeTicket(node, identity.keyPair);
  const ws = connectRealtimeSocket(node, ticket);
  const socket: RealtimeSocket = { messages: [], ws };

  ws.on('message', (data) => {
    socket.messages.push(JSON.parse(data.toString()) as RealtimeMessage);
  });
  ws.on('error', (error) => {
    console.error(`${label} socket error: ${error.message}`);
  });

  await waitFor(
    () => socket.messages.some((message) => message.type === 'connection_ack'),
    `${label} to acknowledge its connection`,
  );

  return socket;
}

function readReceiptsOf(
  socket: RealtimeSocket,
  conversationId: string,
): string[] {
  return socket.messages.flatMap((message) => {
    const event = message.event;

    if (
      message.type !== 'domain_event' ||
      event?.type !== READ_RECEIPT_EVENT ||
      event.aggregate_id !== conversationId
    ) {
      return [];
    }

    return [String(event.attributes?.messageId)];
  });
}

function assertStatus(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`);
  }
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

async function main(): Promise<void> {
  await rm(TMP_ROOT, { force: true, recursive: true });

  const networkKey = generateNetworkKey();
  const nodeA = buildNodeRuntime('node-a', NODE_A_PORT, TMP_ROOT);
  const nodeB = buildNodeRuntime('node-b', NODE_B_PORT, TMP_ROOT);
  const sockets: RealtimeSocket[] = [];

  try {
    await startNode(nodeA);
    await addPrivateNetwork(nodeA, networkKey);
    const alice = await publishIdentity(nodeA, 'Alice', 'alice');
    const aliceKeychain = await publishKeychain(nodeA, alice);

    await startNode(nodeB);
    await addPrivateNetwork(nodeB, networkKey);
    await stopNode(nodeB);

    await startNode(nodeB);
    await waitForIdentity(nodeB, alice.id);
    await waitForKeychain(nodeB, alice);

    const bob = await publishIdentity(nodeB, 'Bob', 'bob');
    await publishKeychain(nodeB, bob);
    await waitForIdentity(nodeA, bob.id);
    await waitForKeychain(nodeA, bob);

    const conversation = await createOneToOneConversation(
      nodeA,
      alice,
      bob,
      aliceKeychain,
    );
    const conversationId = conversation.id;
    await waitForConversation(nodeB, bob, conversationId);

    // Alice can only mark messages read that someone else wrote, so Bob sends them from node B.
    const first = await sendConversationMessage(
      nodeB,
      bob,
      conversationId,
      [],
      'read-until-first',
    );
    await pause(CREATED_AT_GAP_MS);
    const second = await sendConversationMessage(
      nodeB,
      bob,
      conversationId,
      [first.id],
      'read-until-second',
    );
    await waitForMessage(nodeA, alice, conversationId, first.id);
    await waitForMessage(nodeA, alice, conversationId, second.id);

    const bobSocket = await openRealtimeSocket(
      nodeB,
      bob,
      'Bob WebSocket on node B',
    );
    sockets.push(bobSocket);
    await waitFor(
      async () => (await unreadCountOf(nodeB, alice, conversationId)) === 2,
      'node B to count both of Bob messages as unread for Alice',
    );

    // Validly signed and never sent: it names the first message, which is older than the marker set next.
    const staleForFirst = signReadUntil(
      alice,
      conversationId,
      first.id,
      Date.now() - STALE_BY_MS,
    );

    assertStatus(
      'Alice marks the first message read',
      await sendReadUntil(nodeA, signReadUntil(alice, conversationId, first.id)),
      200,
    );
    await waitFor(
      async () => (await unreadCountOf(nodeB, alice, conversationId)) === 1,
      'node B to replicate the first read marker',
    );
    await waitFor(
      () => readReceiptsOf(bobSocket, conversationId).includes(first.id),
      'Bob WebSocket on node B to receive the first read receipt',
    );

    const proofForSecond = signReadUntil(alice, conversationId, second.id);
    assertStatus(
      'Alice marks the second message read',
      await sendReadUntil(nodeA, proofForSecond),
      200,
    );
    await waitFor(
      async () => (await unreadCountOf(nodeB, alice, conversationId)) === 0,
      'node B to replicate the second read marker',
    );
    await waitFor(
      () => readReceiptsOf(bobSocket, conversationId).includes(second.id),
      'Bob WebSocket on node B to receive the second read receipt',
    );

    await pause(CREATED_AT_GAP_MS);
    const third = await sendConversationMessage(
      nodeB,
      bob,
      conversationId,
      [second.id],
      'read-until-third',
    );
    await waitForMessage(nodeA, alice, conversationId, third.id);
    await waitFor(
      async () => (await unreadCountOf(nodeB, alice, conversationId)) === 1,
      'node B to count the third message as unread',
    );

    // Each rejected marker targets the third message, so acceptance would visibly advance Alice's marker.
    const unsignedStatus = await sendReadUntil(
      nodeA,
      signReadUntil(alice, conversationId, third.id),
      {},
    );
    const forgedStatus = await sendReadUntil(
      nodeA,
      // Bob's key signs a marker that claims Alice as the reader.
      signReadUntil(
        { ...alice, keyPair: bob.keyPair },
        conversationId,
        third.id,
      ),
    );
    // The exact request Alice already had accepted, sent again.
    const replayedStatus = await sendReadUntil(nodeA, proofForSecond);
    const staleStatus = await sendReadUntil(nodeA, staleForFirst);
    // The same stale marker, sent to the replica that already replicated the second marker.
    const staleStatusOnReplica = await sendReadUntil(nodeB, staleForFirst);

    await pause(SETTLE_MS);

    assertStatus('unsigned read marker is rejected', unsignedStatus, 401);
    assertStatus('forged read marker is rejected', forgedStatus, 401);
    assertStatus('replayed read marker is rejected', replayedStatus, 401);
    assertStatus('older read marker is rejected', staleStatus, 409);
    assertStatus(
      'older read marker is rejected by node B',
      staleStatusOnReplica,
      409,
    );
    assertSame(
      'node A unread after rejected markers',
      await unreadCountOf(nodeA, alice, conversationId),
      1,
    );
    assertSame(
      'node B unread after rejected markers',
      await unreadCountOf(nodeB, alice, conversationId),
      1,
    );
    assertSame(
      'Bob WebSocket receipts after rejected markers',
      readReceiptsOf(bobSocket, conversationId),
      [first.id, second.id],
    );

    assertStatus(
      'Alice marks the third message read',
      await sendReadUntil(nodeA, signReadUntil(alice, conversationId, third.id)),
      200,
    );
    await waitFor(
      async () => (await unreadCountOf(nodeB, alice, conversationId)) === 0,
      'node B to replicate the third read marker',
    );
    await waitFor(
      () => readReceiptsOf(bobSocket, conversationId).includes(third.id),
      'Bob WebSocket on node B to receive the third read receipt',
    );

    await pause(SETTLE_MS);
    assertSame(
      'Bob WebSocket receipts for the conversation',
      readReceiptsOf(bobSocket, conversationId),
      [first.id, second.id, third.id],
    );

    console.log(
      'Read-until: rejected markers never reached node B; accepted markers replicated and reached the WebSocket.',
    );
  } finally {
    for (const socket of sockets) {
      socket.ws.close();
    }

    const stops = await Promise.allSettled([stopNode(nodeA), stopNode(nodeB)]);

    for (const stop of stops) {
      if (stop.status === 'rejected') {
        process.exitCode = 1;
        console.error(`Teardown failure: ${String(stop.reason)}`);
      }
    }

    await rm(TMP_ROOT, { force: true, recursive: true });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
