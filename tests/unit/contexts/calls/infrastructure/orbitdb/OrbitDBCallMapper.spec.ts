import { Call } from '@app/contexts/calls/domain/Call';
import OrbitDBCallMapper from '@app/contexts/calls/infrastructure/orbitdb/mappers/OrbitDBCallMapper';

describe('OrbitDBCallMapper', () => {
  it('maps conversation calls to persistence documents and back', () => {
    const mapper = new OrbitDBCallMapper();
    const identityId =
      'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
    const call = Call.fromPrimitives({
      createdAt: 1780000000000,
      creatorIdentityId: identityId,
      endedAt: undefined,
      endedByIdentityId: undefined,
      id: '550e8400-e29b-41d4-a716-446655440001',
      networkId: '550e8400-e29b-41d4-a716-446655440002',
      participantIds: [identityId],
      participants: [{ identityId, status: 'joined' }],
      scope: {
        channelId: undefined,
        communityId: undefined,
        conversationId: 'conversation-1',
        type: 'conversation',
      },
      status: 'active',
    });

    jest.spyOn(Date, 'now').mockReturnValue(1780000005000);

    const document = mapper.toDocument(call);
    const restoredCall = mapper.toDomain(document);

    expect(document).toEqual(
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440001',
        updatedAt: 1780000005000,
      }),
    );
    expect(restoredCall.toPrimitives()).toEqual(call.toPrimitives());
  });
  it('persists community session lifecycle without participant attribution', () => {
    const mapper = new OrbitDBCallMapper();
    const identityId = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
    const call = Call.fromPrimitives({
      createdAt: 1780000000000,
      creatorIdentityId: identityId,
      endedAt: 1780000001000,
      endedByIdentityId: identityId,
      id: '550e8400-e29b-41d4-a716-446655440001',
      networkId: '550e8400-e29b-41d4-a716-446655440002',
      participantIds: [identityId],
      participants: [{ identityId, status: 'left', joinedAt: 1780000000000, leftAt: 1780000001000 }],
      scope: { channelId: 'channel-1', communityId: 'community-1', conversationId: undefined, type: 'community_channel' },
      status: 'ended',
      sessionEpoch: 1,
    });
    const document = mapper.toDocument(call);
    expect(document.participantIds).toEqual([]);
    expect(document.participants).toEqual([]);
    expect(document).not.toHaveProperty('creatorIdentityId');
    expect(document).not.toHaveProperty('endedByIdentityId');
    expect(JSON.stringify(document)).not.toContain(identityId);
    expect(document).toMatchObject({ status: 'ended', sessionEpoch: 1 });
    expect(mapper.toDomain(document).getParticipantIds()).toEqual([]);
  });

});
