import { Call } from '@app/contexts/calls/domain/Call';
import OrbitDBCallMapper from '@app/contexts/calls/infrastructure/orbitdb/mappers/OrbitDBCallMapper';

describe('OrbitDBCallMapper', () => {
  it('maps calls to persistence documents and back', () => {
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
        channelId: 'channel-1',
        communityId: 'community-1',
        conversationId: undefined,
        type: 'community_channel',
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
});
