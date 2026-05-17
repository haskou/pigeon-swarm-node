import { CommunityChannelMessageSignatureDomainService } from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';

describe('CommunityChannelMessageSignatureDomainService', () => {
  it('serializes sent channel messages with the public signing contract order', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().serializePayload({
        attachmentExternalIdentifiers: [],
        authorIdentityId: 'identity-id',
        channelId: 'channel-id',
        communityId: 'community-id',
        createdAt: 1778536870557,
        encryptedPayload: 'encrypted-community-message-payload',
        id: 'community-message-id',
        type: 'sent',
      });

    expect(serializedPayload).toBe(
      '{"attachmentExternalIdentifiers":[],"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"encryptedPayload":"encrypted-community-message-payload","id":"community-message-id","type":"sent"}',
    );
  });

  it('serializes deleted channel messages with the public signing contract order', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().serializePayload({
        actorIdentityId: 'identity-id',
        channelId: 'channel-id',
        communityId: 'community-id',
        createdAt: 1778536870557,
        id: 'deleted-community-message-id',
        targetMessageId: 'community-message-id',
        type: 'deleted',
      });

    expect(serializedPayload).toBe(
      '{"actorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"id":"deleted-community-message-id","targetMessageId":"community-message-id","type":"deleted"}',
    );
  });
});
