import { CommunityChannelMessageSignaturePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageSignaturePayload';
import CommunityChannelMessageSignatureDomainService from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { PublicKey, Signature } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

describe('CommunityChannelMessageSignatureDomainService', () => {
  it('builds sent channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          authorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          encryptedPayload: 'encrypted-community-message-payload',
          id: 'community-message-id',
          type: 'sent',
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"encryptedPayload":"encrypted-community-message-payload","id":"community-message-id","type":"sent"}',
    );
  });

  it('builds public sent channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          authorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          id: 'community-message-id',
          plaintextPayload: 'public-community-message-payload',
          type: 'sent',
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"id":"community-message-id","plaintextPayload":"public-community-message-payload","type":"sent"}',
    );
  });

  it('builds poll channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          authorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          id: 'community-message-id',
          plaintextPayload: 'public-poll-message-payload',
          type: 'poll',
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"id":"community-message-id","plaintextPayload":"public-poll-message-payload","type":"poll"}',
    );
  });

  it('builds deleted channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          actorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          id: 'deleted-community-message-id',
          targetMessageId: 'community-message-id',
          type: 'deleted',
        }),
      );

    expect(serializedPayload).toBe(
      '{"actorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"id":"deleted-community-message-id","targetMessageId":"community-message-id","type":"deleted"}',
    );
  });

  it('builds edited channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          authorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          encryptedPayload: 'edited-community-message-payload',
          id: 'community-message-id',
          type: 'edited',
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"encryptedPayload":"edited-community-message-payload","id":"community-message-id","type":"edited"}',
    );
  });

  it('builds public edited channel messages canonical signing content', () => {
    const serializedPayload =
      new CommunityChannelMessageSignatureDomainService().getCanonicalSigningContent(
        CommunityChannelMessageSignaturePayload.fromPrimitives({
          authorIdentityId: 'identity-id',
          channelId: 'channel-id',
          communityId: 'community-id',
          createdAt: 1778536870557,
          id: 'community-message-id',
          plaintextPayload: 'edited-public-community-message-payload',
          type: 'edited',
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"id":"community-message-id","plaintextPayload":"edited-public-community-message-payload","type":"edited"}',
    );
  });

  it('accepts legacy channel message signatures with empty attachment identifiers', () => {
    const publicKey = mock<PublicKey>();
    const signature = new Signature(
      'N19zbyYoEWjEZZ9YlXHiWFV3zDFzgApaAhlX9LtJZdS0OwniOywLmU1hjyfB4IaU45Ka5kSSTUwdCcfSEEWQBQ==',
    );
    const payload = CommunityChannelMessageSignaturePayload.fromPrimitives({
      authorIdentityId: 'identity-id',
      channelId: 'channel-id',
      communityId: 'community-id',
      createdAt: 1778536870557,
      encryptedPayload: 'encrypted-community-message-payload',
      id: 'community-message-id',
      type: 'sent',
    });
    const legacySigningContent =
      '{"authorIdentityId":"identity-id","channelId":"channel-id","communityId":"community-id","createdAt":1778536870557,"encryptedPayload":"encrypted-community-message-payload","id":"community-message-id","type":"sent","attachmentExternalIdentifiers":[]}';

    publicKey.isValidSignature.mockImplementation(
      (signingContent) => signingContent === legacySigningContent,
    );

    expect(
      new CommunityChannelMessageSignatureDomainService().isValidSignature(
        publicKey,
        payload,
        signature,
      ),
    ).toBe(true);
  });
});
