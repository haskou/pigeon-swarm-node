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
      type: 'community_channel',
      communityId: 'community',
      channelId: 'voice',
      conversationId: undefined,
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

  it('does not revive an ended call with a later-saved active snapshot', () => {
    const ended = {
      ...document([]),
      status: 'ended',
      endedAt: 20,
      endedByIdentityId: 'a',
    };
    const active = document([], 30);

    expect(merger.merge(ended, active)).toEqual(merger.merge(active, ended));
    expect(merger.merge(ended, active).status).toBe('ended');
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
});
