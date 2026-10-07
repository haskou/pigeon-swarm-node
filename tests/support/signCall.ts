import { CallRecordIds } from '@app/contexts/calls/domain/CallRecordIds';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { randomBytes } from 'node:crypto';

export interface CallSigner {
  deviceCredential: string;
  deviceKeyPair: KeyPair;
  id: string;
}

export type CallRecordPayload = { id: string } & Record<string, unknown>;

export type CallScopeInput =
  | { conversationId: string; type: 'conversation' }
  | { channelId: string; communityId: string; type: 'community_channel' };

export interface CallStartInput {
  networkId: string;
  nonce: string;
  participantIds?: string[];
  scope: CallScopeInput;
  sessionEpoch?: number;
  signer: CallSigner;
  startedAt: number;
}

export type CallParticipantState = 'declined' | 'joined' | 'left';

/** A signer whose identity is its own device key; the caller authorizes it. */
export async function newCallSigner(): Promise<CallSigner> {
  const deviceKeyPair = await KeyPair.generate();
  const deviceCredential = deviceKeyPair.toPrimitives().publicKey;

  return {
    deviceCredential,
    deviceKeyPair,
    id: new IdentityId(deviceCredential).valueOf(),
  };
}

export function callIdOf(creatorIdentityId: string, nonce: string): string {
  return CallId.fromStart(
    new IdentityId(creatorIdentityId),
    new CallNonce(nonce),
  ).valueOf();
}

/** Signs any record as a `calls` put, even one the policies must refuse. */
export function signCallRecord(
  payload: CallRecordPayload,
  signer: CallSigner,
  sequence = 0,
  predecessor: string | null = null,
): PublicMutationProof {
  const body = {
    author: {
      deviceCredential: signer.deviceCredential,
      identityId: signer.id,
    },
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor,
    recordId: payload.id,
    sequence,
    store: 'calls',
    version: 1,
  } as const;

  return PublicMutationProof.signed(
    body,
    signer.deviceKeyPair.sign(PublicMutationProof.signingContentOf(body)),
  );
}

export function startPayload(input: CallStartInput): CallRecordPayload {
  const callId = callIdOf(input.signer.id, input.nonce);
  const conversation = input.scope.type === 'conversation';

  return {
    callId,
    creatorIdentityId: input.signer.id,
    id: CallRecordIds.start(callId),
    networkId: input.networkId,
    nonce: input.nonce,
    participantIds: conversation ? (input.participantIds ?? []) : [],
    scope: input.scope,
    scopeType: 'call_start',
    ...(input.sessionEpoch === undefined
      ? {}
      : { sessionEpoch: input.sessionEpoch }),
    startedAt: input.startedAt,
  };
}

export function participantPayload(input: {
  at: number;
  callId: string;
  identityId: string;
  state: CallParticipantState;
}): CallRecordPayload {
  return {
    at: input.at,
    callId: input.callId,
    id: CallRecordIds.participant(input.callId, input.identityId),
    identityId: input.identityId,
    scopeType: 'call_participant',
    state: input.state,
  };
}

export function endPayload(input: {
  at: number;
  callId: string;
  endedByIdentityId: string;
}): CallRecordPayload {
  return {
    at: input.at,
    callId: input.callId,
    endedByIdentityId: input.endedByIdentityId,
    id: CallRecordIds.end(input.callId),
    scopeType: 'call_end',
  };
}

export function signCallStart(input: CallStartInput): {
  callId: string;
  payload: CallRecordPayload;
  proof: PublicMutationProof;
} {
  const payload = startPayload(input);

  return {
    callId: payload.callId as string,
    payload,
    proof: signCallRecord(payload, input.signer),
  };
}

/** Signs the next participant state, chained after the previous proof of that record. */
export function signCallParticipant(input: {
  at: number;
  callId: string;
  predecessor?: PublicMutationProof;
  signer: CallSigner;
  state: CallParticipantState;
}): { payload: CallRecordPayload; proof: PublicMutationProof } {
  const payload = participantPayload({
    at: input.at,
    callId: input.callId,
    identityId: input.signer.id,
    state: input.state,
  });
  const previous = input.predecessor?.toPrimitives() as
    | { sequence: number }
    | undefined;

  return {
    payload,
    proof: signCallRecord(
      payload,
      input.signer,
      previous ? previous.sequence + 1 : 0,
      input.predecessor ? input.predecessor.digest() : null,
    ),
  };
}

export function signCallEnd(input: {
  at: number;
  callId: string;
  signer: CallSigner;
}): { payload: CallRecordPayload; proof: PublicMutationProof } {
  const payload = endPayload({
    at: input.at,
    callId: input.callId,
    endedByIdentityId: input.signer.id,
  });

  return { payload, proof: signCallRecord(payload, input.signer) };
}

/** The request `mutation` field of a proof. */
export const mutationOf = (
  proof: PublicMutationProof,
): Record<string, unknown> =>
  proof.toPrimitives() as unknown as Record<string, unknown>;

let startSeed = 0;

/**
 * The nonce and start time `Call.start` needs after the participants. Each
 * call gets a fresh nonce, so two calls of one creator never share an id.
 */
export function callStartArgs(
  startedAt = 1_770_000_000_000,
): [CallNonce, Timestamp] {
  startSeed += 1;

  return [
    new CallNonce(`test-call-nonce-${String(startSeed).padStart(6, '0')}`),
    new Timestamp(startedAt),
  ];
}

/** A well-formed, validly signed proof for tests that only need a message to parse. */
export async function sampleMutation(): Promise<Record<string, unknown>> {
  const signer = await newCallSigner();
  const payload = endPayload({
    at: 1_770_000_000_000,
    callId: callIdOf(signer.id, 'sample-mutation-nonce'),
    endedByIdentityId: signer.id,
  });

  return mutationOf(signCallRecord(payload, signer));
}
