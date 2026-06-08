import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RegisterConversationWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterConversationWhenAnnounced';
import RespondToConversationNetworkSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationNetworkSyncRequest';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentityNetworkSyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentityNetworkSyncRequest';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import ConversationRegistrar from '@app/contexts/conversations/application/register-conversation/ConversationRegistrar';
import { RegisterConversationMessage as ConversationMetadataRegisterMessage } from '@app/contexts/conversations/application/register-conversation/messages/RegisterConversationMessage';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import ConversationNetworkSyncResponder from '@app/contexts/conversations/application/respond-network-sync/ConversationNetworkSyncResponder';
import { ConversationNetworkSyncResponseMessage } from '@app/contexts/conversations/application/respond-network-sync/messages/ConversationNetworkSyncResponseMessage';
import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { ConversationSyncResponseMessage } from '@app/contexts/conversations/application/respond-sync/messages/ConversationSyncResponseMessage';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { ConversationNetworkSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationNetworkSyncRequestedEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import IdentityNetworkSyncResponder from '@app/contexts/identities/application/respond-network-sync/IdentityNetworkSyncResponder';
import { IdentityNetworkSyncResponseMessage } from '@app/contexts/identities/application/respond-network-sync/messages/IdentityNetworkSyncResponseMessage';
import IdentitySyncResponder from '@app/contexts/identities/application/respond-sync/IdentitySyncResponder';
import { IdentitySyncResponseMessage } from '@app/contexts/identities/application/respond-sync/messages/IdentitySyncResponseMessage';
import { IdentityNetworkSyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentityNetworkSyncRequestedEvent';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import KeychainCandidateRegistrar from '@app/contexts/keychains/application/register-candidate/KeychainCandidateRegistrar';
import { RegisterKeychainCandidateMessage } from '@app/contexts/keychains/application/register-candidate/messages/RegisterKeychainCandidateMessage';
import KeychainSyncResponder from '@app/contexts/keychains/application/respond-sync/KeychainSyncResponder';
import { KeychainSyncResponseMessage } from '@app/contexts/keychains/application/respond-sync/messages/KeychainSyncResponseMessage';
import { KeychainSyncAvailableEvent } from '@app/contexts/keychains/domain/events/KeychainSyncAvailableEvent';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { NodePeerRegisterMessage } from '@app/contexts/nodes/application/register-peer/messages/NodePeerRegisterMessage';
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Signature } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('PubSub sync consumers', () => {
  const conversationId =
    'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de';
  const messageId = '507f1f77bcf86cd799439011';
  const externalIdentifier = 'bafybeigdyrztomockexternalidentifier';

  let eventConsumer: MockProxy<DomainEventConsumer>;
  let suppressionTracker: MockProxy<SyncResponseSuppressionTracker>;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    suppressionTracker = mock<SyncResponseSuppressionTracker>();
  });

  it('synchronizes identity updates through the published identity registrar', async () => {
    const identityId = new IdentityMother().id.valueOf();
    const registrar = mock<RegisterPublishedIdentity>();
    const consumer = new SynchronizeIdentityWhenUpdated(
      eventConsumer,
      registrar,
    );

    await consumer.init();
    await consumer.handler(new IdentityWasUpdatedEvent(identityId));

    expect(eventConsumer.consume).toHaveBeenCalledWith(
      SynchronizeIdentityWhenUpdated.QUEUE_NAME,
      IdentityWasUpdatedEvent.EVENT_NAME,
      IdentityWasUpdatedEvent,
      'pigeon-swarm',
      expect.any(Function),
    );
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterPublishedIdentityMessage),
    );
    expect(registrar.register.mock.calls[0][0].identityId.valueOf()).toBe(
      identityId,
    );
  });

  it('responds to identity sync requests', async () => {
    const identityId = new IdentityMother().id.valueOf();
    const responder = mock<IdentitySyncResponder>();
    const consumer = new RespondToIdentitySyncRequest(eventConsumer, responder);

    await consumer.handler(
      new IdentitySyncRequestedEvent(identityId, { requestId: 'request-1' }),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(IdentitySyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].identityId.valueOf()).toBe(
      identityId,
    );
    expect(responder.respond.mock.calls[0][0].requestId).toBe('request-1');
  });

  it('responds to identity network sync requests', async () => {
    const responder = mock<IdentityNetworkSyncResponder>();
    const consumer = new RespondToIdentityNetworkSyncRequest(
      eventConsumer,
      responder,
    );

    await consumer.handler(
      new IdentityNetworkSyncRequestedEvent(
        '123e4567-e89b-12d3-a456-426614174000',
        { requestId: 'request-1' },
      ),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(IdentityNetworkSyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].networkId.valueOf()).toBe(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(responder.respond.mock.calls[0][0].requestId).toBe('request-1');
  });

  it('registers identities announced by sync responses', async () => {
    const registrar = mock<IdentityCandidateRegistrar>();
    const publisher = mock<DomainEventPublisher>();
    const consumer = new RegisterIdentityWhenSyncAvailable(
      eventConsumer,
      registrar,
      publisher,
      suppressionTracker,
    );

    await consumer.handler(
      new IdentitySyncAvailableEvent('identity-sync', {
        externalIdentifier,
      }),
    );

    expect(suppressionTracker.markAvailable).toHaveBeenCalledWith(
      'identity',
      'identity-sync',
      undefined,
    );
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterIdentityCandidateMessage),
    );
    expect(
      registrar.register.mock.calls[0][0].externalIdentifier.valueOf(),
    ).toBe(externalIdentifier);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('registers and synchronizes keychain publication events', async () => {
    const ownerIdentityId = new IdentityMother().id.valueOf();
    const finder = mock<CurrentKeychainFinder>();
    const registerConsumer = new RegisterKeychainWhenPublished(
      eventConsumer,
      finder,
    );
    const syncConsumer = new SynchronizeKeychainWhenUpdated(
      eventConsumer,
      finder,
    );

    await registerConsumer.handler(
      new KeychainWasPublishedEvent(ownerIdentityId),
    );
    await syncConsumer.handler(new KeychainWasPublishedEvent(ownerIdentityId));

    expect(finder.find).toHaveBeenCalledWith(
      expect.any(CurrentKeychainFindMessage),
    );
    expect(finder.find).toHaveBeenCalledTimes(2);
    expect(finder.find.mock.calls[0][0].ownerIdentityId.valueOf()).toBe(
      ownerIdentityId,
    );
  });

  it('responds to keychain sync requests', async () => {
    const ownerIdentityId = new IdentityMother().id.valueOf();
    const responder = mock<KeychainSyncResponder>();
    const consumer = new RespondToKeychainSyncRequest(eventConsumer, responder);

    await consumer.handler(
      new KeychainSyncRequestedEvent(ownerIdentityId, {
        requestId: 'request-2',
      }),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(KeychainSyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].ownerIdentityId.valueOf()).toBe(
      ownerIdentityId,
    );
    expect(responder.respond.mock.calls[0][0].requestId).toBe('request-2');
  });

  it('registers keychains announced by sync responses', async () => {
    const registrar = mock<KeychainCandidateRegistrar>();
    const consumer = new RegisterKeychainWhenSyncAvailable(
      eventConsumer,
      registrar,
      suppressionTracker,
    );

    await consumer.handler(
      new KeychainSyncAvailableEvent('keychain-sync', {
        externalIdentifier,
      }),
    );

    expect(suppressionTracker.markAvailable).toHaveBeenCalledWith(
      'keychain',
      'keychain-sync',
      undefined,
    );
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterKeychainCandidateMessage),
    );
    expect(
      registrar.register.mock.calls[0][0].externalIdentifier.valueOf(),
    ).toBe(externalIdentifier);
  });

  it('registers announced conversation message mutations', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const sentConsumer = new RegisterMessageWhenAnnounced(
      eventConsumer,
      registrar,
      conversationRegistrar,
    );
    const editedConsumer = new RegisterMessageEditionWhenAnnounced(
      eventConsumer,
      registrar,
    );
    const deletedConsumer = new RegisterMessageDeletionWhenAnnounced(
      eventConsumer,
      registrar,
    );
    const attributes = { messageId };

    await sentConsumer.handler(
      new ConversationMessageWasSentEvent(conversationId, attributes),
    );
    await editedConsumer.handler(
      new ConversationMessageWasEditedEvent(conversationId, attributes),
    );
    await deletedConsumer.handler(
      new ConversationMessageWasDeletedEvent(conversationId, attributes),
    );

    expect(registrar.register).toHaveBeenCalledTimes(3);
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterConversationMessage),
    );
    expect(registrar.register.mock.calls[0][0].conversationId.valueOf()).toBe(
      conversationId,
    );
    expect(registrar.register.mock.calls[0][0].messageId.valueOf()).toBe(
      messageId,
    );
  });

  it('does not synthesize missing conversation metadata from message announcements', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessageWhenAnnounced(
      eventConsumer,
      registrar,
      conversationRegistrar,
    );
    const expectedError = new ConversationNotFoundError(
      new ConversationId(conversationId),
    );

    registrar.register.mockRejectedValueOnce(expectedError);

    await expect(
      consumer.handler(
        new ConversationMessageWasSentEvent(conversationId, {
          conversationType: 'one-to-one',
          messageId,
          networkId: '123e4567-e89b-12d3-a456-426614174000',
          participantIds: [
            new IdentityMother().id.valueOf(),
            new IdentityMother().id.valueOf(),
          ],
        }),
      ),
    ).rejects.toBe(expectedError);

    expect(conversationRegistrar.register).not.toHaveBeenCalled();
    expect(registrar.register).toHaveBeenCalledTimes(1);
  });

  it('registers announced messages from the embedded encrypted candidate', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessageWhenAnnounced(
      eventConsumer,
      registrar,
      conversationRegistrar,
    );
    const authorId = new IdentityMother().id;
    const candidate = MessageSent.create({
      authorId,
      conversationId: new ConversationId(conversationId),
      encryptedPayload: new EncryptedMessagePayload('encrypted-payload'),
      id: new MessageId(messageId),
      signature: new Signature(
        'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
      ),
    });

    await consumer.handler(
      new ConversationMessageWasSentEvent(conversationId, {
        conversationType: 'one-to-one',
        message: candidate.toPrimitives(),
        messageId,
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        participantIds: [authorId.valueOf()],
      }),
    );

    expect(registrar.register).not.toHaveBeenCalled();
    expect(registrar.registerCandidate).toHaveBeenCalledWith(
      expect.any(RegisterConversationMessage),
      expect.any(MessageSent),
    );
    expect(registrar.registerCandidate.mock.calls[0][1].toPrimitives()).toEqual(
      candidate.toPrimitives(),
    );
  });

  it('responds to conversation sync requests', async () => {
    const responder = mock<ConversationSyncResponder>();
    const consumer = new RespondToConversationSyncRequest(
      eventConsumer,
      responder,
    );

    await consumer.handler(
      new ConversationSyncRequestedEvent(conversationId, {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        requestId: 'request-3',
      }),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(ConversationSyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].conversationId.valueOf()).toBe(
      conversationId,
    );
    expect(responder.respond.mock.calls[0][0].networkId.valueOf()).toBe(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(responder.respond.mock.calls[0][0].requestId?.valueOf()).toBe(
      'request-3',
    );
  });

  it('responds to conversation network sync requests', async () => {
    const responder = mock<ConversationNetworkSyncResponder>();
    const consumer = new RespondToConversationNetworkSyncRequest(
      eventConsumer,
      responder,
    );

    await consumer.handler(
      new ConversationNetworkSyncRequestedEvent(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          networkId: '123e4567-e89b-12d3-a456-426614174000',
          requestId: 'request-4',
        },
      ),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(ConversationNetworkSyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].networkId.valueOf()).toBe(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(responder.respond.mock.calls[0][0].requestId).toBe('request-4');
  });

  it('registers valid conversation creation announcements before fan-out', async () => {
    const registrar = mock<ConversationRegistrar>();
    const consumer = new RegisterConversationWhenAnnounced(
      eventConsumer,
      registrar,
    );

    await consumer.handler(
      new ConversationWasCreatedEvent(conversationId, {
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        participantIds: [
          new IdentityMother().id.valueOf(),
          new IdentityMother().id.valueOf(),
        ],
        type: 'one-to-one',
      }),
    );

    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(ConversationMetadataRegisterMessage),
    );
    expect(registrar.register.mock.calls[0][0].conversationId.valueOf()).toBe(
      conversationId,
    );
  });

  it('rejects malformed conversation creation announcements', async () => {
    const registrar = mock<ConversationRegistrar>();
    const consumer = new RegisterConversationWhenAnnounced(
      eventConsumer,
      registrar,
    );

    await expect(
      consumer.handler(
        new ConversationWasCreatedEvent(conversationId, {
          participantIds: [
            new IdentityMother().id.valueOf(),
            new IdentityMother().id.valueOf(),
          ],
          type: 'one-to-one',
        }),
      ),
    ).rejects.toThrow('Invalid conversation announcement.');

    expect(registrar.register).not.toHaveBeenCalled();
  });

  it('registers valid messages announced by conversation sync responses', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const reactionRegistrar = mock<MessageReactionRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessagesWhenSyncAvailable(
      eventConsumer,
      registrar,
      reactionRegistrar,
      conversationRegistrar,
      suppressionTracker,
    );

    await consumer.handler(
      new ConversationSyncAvailableEvent(conversationId, {
        messageCandidates: [{ messageId }, { messageId: 42 }, null],
        conversation: {
          id: conversationId,
          networkId: '550e8400-e29b-41d4-a716-446655440011',
          participantIds: [
            'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
            'MCowBQYDK2VwAyEA2+5oVbSUaiTZLcwruvmBmtHLgo+LVCmaw4kG9AQPx20=',
          ],
          type: 'one-to-one',
        },
      }),
    );

    expect(suppressionTracker.markAvailable).toHaveBeenCalledWith(
      'conversation',
      conversationId,
      undefined,
    );
    expect(registrar.register).toHaveBeenCalledTimes(1);
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterConversationMessage),
    );
    expect(registrar.register.mock.calls[0][0].messageId.valueOf()).toBe(
      messageId,
    );
    expect(conversationRegistrar.register).toHaveBeenCalledWith(
      expect.any(ConversationMetadataRegisterMessage),
    );
    expect(reactionRegistrar.register).not.toHaveBeenCalled();
  });

  it('registers embedded message candidates announced by conversation sync responses', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const reactionRegistrar = mock<MessageReactionRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessagesWhenSyncAvailable(
      eventConsumer,
      registrar,
      reactionRegistrar,
      conversationRegistrar,
      suppressionTracker,
    );
    const authorId =
      'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';

    await consumer.handler(
      new ConversationSyncAvailableEvent(conversationId, {
        conversation: {
          id: conversationId,
          networkId: '550e8400-e29b-41d4-a716-446655440011',
          participantIds: [authorId],
          type: 'one-to-one',
        },
        messageCandidates: [
          {
            message: {
              attachmentExternalIdentifiers: [],
              authorId,
              conversationId,
              createdAt: 1778513696020,
              encryptedPayload: 'encrypted-message-payload',
              id: messageId,
              previousMessageIds: [],
              signature:
                'J3F0mR6aZyVIC3THJwTGQ4cV7wb3PWyfzv/dbqydslhDpb6dApp8kiTD8lB8gFkcXTKTO/rMP44jXWhfpaGCDw==',
              type: 'sent',
            },
            messageId,
          },
        ],
      }),
    );

    expect(conversationRegistrar.register).toHaveBeenCalledWith(
      expect.any(ConversationMetadataRegisterMessage),
    );
    expect(registrar.register).not.toHaveBeenCalled();
    expect(registrar.registerCandidate).toHaveBeenCalledTimes(1);
    expect(registrar.registerCandidate).toHaveBeenCalledWith(
      expect.any(RegisterConversationMessage),
      expect.any(MessageSent),
    );
  });

  it('rejects conversation sync metadata for another aggregate', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const reactionRegistrar = mock<MessageReactionRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessagesWhenSyncAvailable(
      eventConsumer,
      registrar,
      reactionRegistrar,
      conversationRegistrar,
      suppressionTracker,
    );

    await expect(
      consumer.handler(
        new ConversationSyncAvailableEvent(conversationId, {
          conversation: {
            id: 'one-to-one:different',
            networkId: '550e8400-e29b-41d4-a716-446655440011',
            participantIds: [
              'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
              'MCowBQYDK2VwAyEA2+5oVbSUaiTZLcwruvmBmtHLgo+LVCmaw4kG9AQPx20=',
            ],
            type: 'one-to-one',
          },
          messageCandidates: [{ messageId }],
        }),
      ),
    ).rejects.toThrow(
      'Conversation sync metadata does not match aggregate id.',
    );

    expect(conversationRegistrar.register).not.toHaveBeenCalled();
    expect(registrar.register).not.toHaveBeenCalled();
    expect(registrar.registerCandidate).not.toHaveBeenCalled();
  });

  it('registers valid reactions announced by conversation sync responses', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const reactionRegistrar = mock<MessageReactionRegistrar>();
    const conversationRegistrar = mock<ConversationRegistrar>();
    const consumer = new RegisterMessagesWhenSyncAvailable(
      eventConsumer,
      registrar,
      reactionRegistrar,
      conversationRegistrar,
      suppressionTracker,
    );

    await consumer.handler(
      new ConversationSyncAvailableEvent(conversationId, {
        reactionCandidates: [
          {
            authorId:
              'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
            createdAt: 1778513696020,
            emoji: '👍',
            messageId,
          },
          { messageId },
        ],
      }),
    );

    expect(registrar.register).not.toHaveBeenCalled();
    expect(reactionRegistrar.register).toHaveBeenCalledTimes(1);
    expect(reactionRegistrar.register).toHaveBeenCalledWith(
      expect.any(RegisterMessageReaction),
    );
    expect(
      reactionRegistrar.register.mock.calls[0][0].messageId.valueOf(),
    ).toBe(messageId);
  });

  it('registers node peers announced by heartbeat events', async () => {
    const nodeId = '550e8400-e29b-41d4-a716-446655440010';
    const networkId = '550e8400-e29b-41d4-a716-446655440011';
    const ownerIdentityId = new IdentityMother().id.valueOf();
    const registrar = mock<NodePeerRegistrar>();
    const consumer = new RegisterNodePeerWhenHeartbeatReceived(
      eventConsumer,
      registrar,
    );

    await consumer.init();
    await consumer.handler(
      new NodeHeartbeatWasSent(nodeId, {
        networks: [{ id: networkId, name: 'public' }],
        owner: ownerIdentityId,
      }),
    );

    expect(eventConsumer.consume).toHaveBeenCalledWith(
      RegisterNodePeerWhenHeartbeatReceived.QUEUE_NAME,
      NodeHeartbeatWasSent.EVENT_NAME,
      NodeHeartbeatWasSent,
      'pigeon-swarm',
      expect.any(Function),
    );
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(NodePeerRegisterMessage),
    );
    expect(registrar.register.mock.calls[0][0].nodeId.valueOf()).toBe(nodeId);
    expect(registrar.register.mock.calls[0][0].owner?.valueOf()).toBe(
      ownerIdentityId,
    );
    expect(
      registrar.register.mock.calls[0][0].networks[0].toPrimitives(),
    ).toEqual({
      id: networkId,
      name: 'public',
    });
  });
});
