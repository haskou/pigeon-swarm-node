import { OrbitDBCallFold } from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallFold';

import {
  newCallSigner,
  participantPayload,
  signCallEnd,
  signCallParticipant,
  signCallStart,
} from '../../../../../support/signCall';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';

const NETWORK = '550e8400-e29b-41d4-a716-446655440002';

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe('OrbitDBCallFold', () => {
  const t0 = 1_770_000_000_000;

  it('folds nothing without a start', () => {
    expect(OrbitDBCallFold.fold({ participants: new Map() })).toBeUndefined();
  });

  it('derives the same call from the same records in every arrival order', async () => {
    const alice = await newCallSigner();
    const bob = await newCallSigner();
    const start = signCallStart({
      networkId: NETWORK,
      nonce: 'fold-spec-nonce-00001',
      participantIds: [alice.id, bob.id],
      scope: { conversationId: 'one-to-one:fold', type: 'conversation' },
      signer: alice,
      startedAt: t0,
    });
    const joined = signCallParticipant({
      at: t0 + 1_000,
      callId: start.callId,
      signer: bob,
      state: 'joined',
    });
    const end = signCallEnd({
      at: t0 + 5_000,
      callId: start.callId,
      signer: alice,
    });
    const records = [
      PublicMutationRecord.withProof(start.payload, start.proof),
      PublicMutationRecord.withProof(joined.payload, joined.proof),
      PublicMutationRecord.withProof(end.payload, end.proof),
    ];
    const results = permutations(records).map((order) => {
      const folded = {
        participants: new Map<string, Record<string, unknown>>(),
      } as {
        end?: Record<string, unknown>;
        participants: Map<string, Record<string, unknown>>;
        start?: Record<string, unknown>;
      };

      for (const record of order) {
        if (record.scopeType === 'call_start') folded.start = record;
        else if (record.scopeType === 'call_end') folded.end = record;
        else folded.participants.set(record.identityId as string, record);
      }

      return OrbitDBCallFold.fold(folded);
    });

    expect(results[0]?.primitives.status).toBe('ended');
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it('reads a decline of the callee as a missed call', async () => {
    const alice = await newCallSigner();
    const bob = await newCallSigner();
    const start = signCallStart({
      networkId: NETWORK,
      nonce: 'fold-spec-nonce-00002',
      participantIds: [alice.id, bob.id],
      scope: { conversationId: 'one-to-one:fold', type: 'conversation' },
      signer: alice,
      startedAt: t0,
    });
    const folded = OrbitDBCallFold.fold({
      participants: new Map([
        [
          bob.id,
          participantPayload({
            at: t0 + 100,
            callId: start.callId,
            identityId: bob.id,
            state: 'declined',
          }),
        ],
      ]),
      start: start.payload,
    });

    expect(folded?.primitives.status).toBe('missed');
  });

  it('ignores an event that does not apply to the state reached', async () => {
    const alice = await newCallSigner();
    const stranger = await newCallSigner();
    const start = signCallStart({
      networkId: NETWORK,
      nonce: 'fold-spec-nonce-00003',
      participantIds: [alice.id, (await newCallSigner()).id],
      scope: { conversationId: 'one-to-one:fold', type: 'conversation' },
      signer: alice,
      startedAt: t0,
    });
    const folded = OrbitDBCallFold.fold({
      participants: new Map([
        [
          stranger.id,
          participantPayload({
            at: t0 + 5,
            callId: start.callId,
            identityId: stranger.id,
            state: 'joined',
          }),
        ],
      ]),
      start: start.payload,
    });

    expect(folded?.primitives.status).toBe('active');
    expect(
      folded?.primitives.participants.some((p) => p.identityId === stranger.id),
    ).toBe(false);
  });

  it('carries the payload digest of the start and no participants for a community call', async () => {
    const alice = await newCallSigner();
    const bob = await newCallSigner();
    const start = signCallStart({
      networkId: NETWORK,
      nonce: 'fold-spec-nonce-00004',
      scope: { channelId: 'ch', communityId: 'co', type: 'community_channel' },
      sessionEpoch: 1,
      signer: alice,
      startedAt: t0,
    });
    const record = PublicMutationRecord.withProof(start.payload, start.proof);
    const folded = OrbitDBCallFold.fold({
      participants: new Map([
        [
          bob.id,
          participantPayload({
            at: t0 + 1,
            callId: start.callId,
            identityId: bob.id,
            state: 'joined',
          }),
        ],
      ]),
      start: record,
    });

    expect(folded?.digest).toBe(
      PublicMutationRecord.proofOf(record)?.getBody().payloadDigest,
    );
    expect(folded?.primitives.participants).toEqual([]);
    expect(folded?.primitives.sessionEpoch).toBe(1);
  });

  it('marks a local timeout only while the call is still active', async () => {
    const alice = await newCallSigner();
    const start = signCallStart({
      networkId: NETWORK,
      nonce: 'fold-spec-nonce-00005',
      participantIds: [alice.id, (await newCallSigner()).id],
      scope: { conversationId: 'one-to-one:fold', type: 'conversation' },
      signer: alice,
      startedAt: t0,
    });

    expect(
      OrbitDBCallFold.fold(
        { participants: new Map(), start: start.payload },
        t0 + 60_000,
      )?.primitives.status,
    ).toBe('missed');
  });
});
