import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import OrbitDBCallDocumentMerger from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentMerger';

const merger = new OrbitDBCallDocumentMerger();

function document(
  participants: OrbitDBCallDocument['participants'],
  updatedAt = 10,
): OrbitDBCallDocument {
  return {
    createdAt: 1,
    creatorIdentityId: 'a',
    id: 'call',
    networkId: 'network',
    participantIds: participants.map((participant) => participant.identityId),
    participants,
    scope: {
      type: 'conversation',
      communityId: undefined,
      channelId: undefined,
      conversationId: 'conversation',
    },
    status: 'active',
    updatedAt,
  };
}

describe('OrbitDBCallDocumentMerger', () => {
  it.each(['left', 'declined', 'missed'] as const)(
    'preserves an explicit %s transition over a same-time join',
    (status) => {
      const joined = document([
        { identityId: 'a', status: 'joined', joinedAt: 20 },
      ]);
      const departed = document([
        {
          identityId: 'a',
          status,
          [`${status === 'left' ? 'left' : status}At`]: 20,
        },
      ]);

      for (const [left, right] of [
        [joined, departed],
        [departed, joined],
      ]) {
        expect(merger.merge(left, right).participants[0].status).toBe(status);
      }
    },
  );

  it.each(['ended', 'missed'])('does not revive a %s call with a later-saved active snapshot', (status) => {
    const ended = {
      ...document([]),
      status,
      endedAt: 20,
      endedByIdentityId: 'a',
    };
    const active = document([], 30);

    expect(merger.merge(ended, active)).toEqual(merger.merge(active, ended));
    expect(merger.merge(ended, active).status).toBe(status);
  });

  it('preserves the session epoch when an older node omits it from a newer update', () => {
    const current = { ...document([], 10), sessionEpoch: 3 };
    const legacy = document([], 20);
    expect(merger.merge(current, legacy).sessionEpoch).toBe(3);
    expect(merger.merge(legacy, current).sessionEpoch).toBe(3);
  });

  it('selects immutable session fields independently of accumulated update timestamps', () => {
    const a = { ...document([], 1), status: 'ended', endedAt: 10, creatorIdentityId: 'z', createdAt: 1 };
    const b = { ...document([], 100), creatorIdentityId: 'c', createdAt: 2 };
    const c = { ...document([], 50), status: 'ended', endedAt: 10, creatorIdentityId: 'b', createdAt: 3 };
    const expected = merger.merge(merger.merge(a, b), c);
    for (const order of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
      const result = order.reduce((current, incoming) => merger.merge(current, incoming), undefined as OrbitDBCallDocument | undefined);
      expect(result).toEqual(expected);
    }
    expect(expected.creatorIdentityId).toBe('b');
    expect(expected.createdAt).toBe(1);
  });

  it('converges across three versions, duplicates and every delivery order', () => {
    const a = document(
      [{ identityId: 'a', status: 'joined', joinedAt: 20 }],
      20,
    );
    const b = document(
      [{ identityId: 'b', status: 'joined', joinedAt: 20 }],
      20,
    );
    const c = document(
      [{ identityId: 'a', status: 'left', joinedAt: 1, leftAt: 10 }],
      100,
    );
    const expected = merger.merge(merger.merge(a, b), c);

    for (const order of [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ]) {
      const result = order.reduce(
        (current, incoming) => merger.merge(current, incoming),
        undefined as OrbitDBCallDocument | undefined,
      );

      expect(result).toEqual(expected);
      expect(merger.merge(result, expected)).toEqual(expected);
    }
    expect(
      expected.participants.map((participant) => participant.status),
    ).toEqual(['joined', 'joined']);
  });
  it('strips community participant attribution in both legacy replay orders', () => {
    const legacy: OrbitDBCallDocument = { ...document([{ identityId: 'a', status: 'joined', joinedAt: 20 }]), scope: { type: 'community_channel', communityId: 'community', channelId: 'voice', conversationId: undefined } };
    const current = { ...legacy, status: 'ended', endedAt: 40, endedByIdentityId: 'a', sessionEpoch: 2 };
    for (const order of [[legacy, current], [current, legacy]]) {
      const merged = merger.merge(order[0], order[1]);
      expect(merged.participantIds).toEqual([]);
      expect(merged.participants).toEqual([]);
      expect(merged).not.toHaveProperty('creatorIdentityId');
      expect(merged).not.toHaveProperty('endedByIdentityId');
      expect(merged).toMatchObject({ status: 'ended', sessionEpoch: 2 });
      expect(merger.merge(merged, legacy)).toEqual(merged);
      const stored = JSON.parse(JSON.stringify(merged));
      expect(merger.merge(undefined, stored)).toEqual(stored);
    }
  });

});
