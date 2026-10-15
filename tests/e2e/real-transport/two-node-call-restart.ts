import 'reflect-metadata';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import fs from 'fs-extra';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import {
  callIdOf,
  mutationOf,
  signCallParticipant,
  signCallStart,
} from '../../support/signCall';
import { signConversationOperation } from '../../support/signConversationOperation';
import {
  addPrivateNetwork,
  buildNodeRuntime,
  generateNetworkKey,
  IdentityFixture,
  NETWORK_ID,
  NodeRuntime,
  publishIdentity,
  publishKeychain,
  request,
  signHeaders,
  startNode,
  stopNode,
  waitFor,
  waitForConversation,
  waitForIdentity,
  waitForKeychain,
} from './two-real-node-gossipsub';

/**
 * The callee's node restarts during a live direct call. It replays the call
 * records before the caller's device authorization they rest on has loaded
 * from its peers, so for a moment it holds them unadmitted, and it may admit
 * the start of the call before the callee's own participant record. Meanwhile
 * a join or a heartbeat must answer the retryable 503, never a final 409
 * (`CallNotFoundError` or `CallParticipantNotFoundError`) a client ends the
 * call on, and it succeeds once the records are admitted.
 */

const TMP_ROOT = path.resolve(__dirname, '../../../.tmp/two-node-call-restart');
const RECOVERY_TIMEOUT_MS = 40_000;
const RETRY_INTERVAL_MS = 100;

/** An HTTP answer; status 0 when the node did not answer at all. */
type Outcome = { body: string; status: number };

async function createOneToOneConversation(
  node: NodeRuntime,
  owner: IdentityFixture,
  participant: IdentityFixture,
  keychainExternalIdentifier: string,
): Promise<{ id: string }> {
  const participantIds = [owner.id, participant.id].sort();
  const signed = signConversationOperation({
    action: ConversationOperationAction.CONVERSATION_CREATED.valueOf(),
    args: { participantIds, type: 'one-to-one' },
    conversationId: ConversationId.deterministic(
      owner.id,
      participant.id,
      NETWORK_ID,
    ).valueOf(),
    createdAt: Date.now(),
    networkId: NETWORK_ID,
    parents: [],
    signer: owner,
  });

  return request<{ id: string }>(
    node,
    'POST',
    '/conversations/',
    {
      keychainExternalIdentifier,
      networkId: NETWORK_ID,
      operation: signed.body,
      participantIds,
      type: 'one-to-one',
    },
    owner,
  );
}

async function send(
  node: NodeRuntime,
  identity: IdentityFixture,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Outcome> {
  try {
    const response = await fetch(`${node.baseUrl}${endpoint}`, {
      body: JSON.stringify(body),
      headers: {
        Connection: 'close',
        'content-type': 'application/json',
        ...signHeaders(identity, 'POST', endpoint, body),
      },
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });

    return { body: await response.text(), status: response.status };
  } catch (error) {
    return {
      body: error instanceof Error ? error.message : String(error),
      status: 0,
    };
  }
}

function join(
  node: NodeRuntime,
  identity: IdentityFixture,
  callId: string,
): Promise<Outcome> {
  const joined = signCallParticipant({
    at: Date.now(),
    callId,
    signer: identity,
    state: 'joined',
  });

  return send(node, identity, `/calls/${callId}/participants`, {
    at: joined.payload.at,
    mutation: mutationOf(joined.proof),
  });
}

function isRetryable({ body, status }: Outcome): boolean {
  if (status === 0) return true;

  if (status !== 503) return false;

  try {
    const answer: unknown = JSON.parse(body);

    return (
      typeof answer === 'object' &&
      answer !== null &&
      'code' in answer &&
      answer.code === ReplicatedStateNotReadyError.CODE
    );
  } catch {
    return false;
  }
}

async function pause(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);
  await promise;
}

/**
 * Restarts the node and repeats the request from the moment it stops until it
 * succeeds, as a client retrying a retryable answer would. Any other answer
 * fails the proof.
 */
async function retryAcrossRestart(
  node: NodeRuntime,
  label: string,
  attempt: () => Promise<Outcome>,
): Promise<void> {
  await stopNode(node);
  const restartedAt = Date.now();
  const started = startNode(node);
  const observed: string[] = [];

  started.catch((): void => undefined);

  for (;;) {
    const outcome = await attempt();

    observed.push(
      `${Date.now() - restartedAt}ms ${outcome.status} ${outcome.body.slice(0, 160)}`,
    );

    if (outcome.status >= 200 && outcome.status < 300) break;

    assert.ok(
      isRetryable(outcome),
      `${label} on the restarted node answered a final error:\n${observed.join('\n')}`,
    );
    assert.ok(
      Date.now() - restartedAt < RECOVERY_TIMEOUT_MS,
      `${label} on the restarted node never succeeded:\n${observed.join('\n')}`,
    );
    await pause(RETRY_INTERVAL_MS);
  }

  await started;
  console.log(
    `${label} on the restarted node succeeded after ${observed.length} attempts` +
      ` (${observed.at(-1)?.split(' ')[0]}; ` +
      `${observed.filter((line) => line.includes(' 503 ')).length} not ready)`,
  );
}

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  const networkKey = generateNetworkKey();
  const nodeA = buildNodeRuntime('node-a', 19280, TMP_ROOT);
  const nodeB = buildNodeRuntime('node-b', 19281, TMP_ROOT);

  try {
    await startNode(nodeA);
    await addPrivateNetwork(nodeA, networkKey);
    const identityA = await publishIdentity(nodeA, 'Restart A', 'restart-a');
    const keychainA = await publishKeychain(nodeA, identityA);

    await startNode(nodeB);
    await addPrivateNetwork(nodeB, networkKey);
    await stopNode(nodeB);
    await startNode(nodeB);
    await waitForIdentity(nodeB, identityA.id);
    await waitForKeychain(nodeB, identityA);
    const identityB = await publishIdentity(nodeB, 'Restart B', 'restart-b');

    await publishKeychain(nodeB, identityB);
    await waitForIdentity(nodeA, identityB.id);
    await waitForKeychain(nodeA, identityB);

    const conversation = await createOneToOneConversation(
      nodeA,
      identityA,
      identityB,
      keychainA,
    );

    await waitForConversation(nodeB, identityB, conversation.id);

    const nonce = `restart-${randomBytes(12).toString('hex')}`;
    const startedAt = Date.now();
    const start = signCallStart({
      networkId: NETWORK_ID,
      nonce,
      participantIds: [identityA.id, identityB.id].sort(),
      scope: { conversationId: conversation.id, type: 'conversation' },
      signer: identityA,
      startedAt,
    });

    await request(
      nodeA,
      'POST',
      '/calls/',
      {
        conversationId: conversation.id,
        mutation: mutationOf(start.proof),
        nonce,
        scopeType: 'conversation',
        startedAt,
      },
      identityA,
    );
    const callId = callIdOf(identityA.id, nonce);

    await waitFor(async () => {
      try {
        await request(nodeB, 'GET', `/calls/${callId}`, undefined, identityB);

        return true;
      } catch {
        return false;
      }
    }, 'call ringing on node B');

    await retryAcrossRestart(nodeB, 'Join', () =>
      join(nodeB, identityB, callId),
    );

    const heartbeatPath = `/calls/${callId}/participants/me/heartbeat`;
    const settled = await send(nodeB, identityB, heartbeatPath, {
      mediaConnections: [],
    });

    assert.equal(settled.status, 204, settled.body);

    await retryAcrossRestart(nodeB, 'Heartbeat', () =>
      send(nodeB, identityB, heartbeatPath, { mediaConnections: [] }),
    );
  } finally {
    await Promise.allSettled([stopNode(nodeA), stopNode(nodeB)]);
    await fs.remove(TMP_ROOT);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
