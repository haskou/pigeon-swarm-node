import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { ConversationSyncResponseMessage } from '@app/contexts/conversations/application/respond-sync/messages/ConversationSyncResponseMessage';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import IdentitySyncResponder from '@app/contexts/identities/application/respond-sync/IdentitySyncResponder';
import { IdentitySyncResponseMessage } from '@app/contexts/identities/application/respond-sync/messages/IdentitySyncResponseMessage';
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
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodePeerRegisterMessage } from '@app/contexts/nodes/application/register-peer/messages/NodePeerRegisterMessage';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('PubSub sync consumers', () => {
  const conversationId =
    'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de';
  const messageId = '507f1f77bcf86cd799439011';
  const externalIdentifier = 'bafybeigdyrztomockexternalidentifier';

  let eventConsumer: MockProxy<DomainEventConsumer>;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
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

  it('registers identities announced by sync responses', async () => {
    const registrar = mock<IdentityCandidateRegistrar>();
    const consumer = new RegisterIdentityWhenSyncAvailable(
      eventConsumer,
      registrar,
    );

    await consumer.handler(
      new IdentitySyncAvailableEvent('identity-sync', {
        externalIdentifier,
      }),
    );

    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterIdentityCandidateMessage),
    );
    expect(
      registrar.register.mock.calls[0][0].externalIdentifier.valueOf(),
    ).toBe(externalIdentifier);
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

    await registerConsumer.handler(new KeychainWasPublishedEvent(ownerIdentityId));
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
      new KeychainSyncRequestedEvent(ownerIdentityId, { requestId: 'request-2' }),
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
    );

    await consumer.handler(
      new KeychainSyncAvailableEvent('keychain-sync', {
        externalIdentifier,
      }),
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
    const sentConsumer = new RegisterMessageWhenAnnounced(
      eventConsumer,
      registrar,
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

  it('responds to conversation sync requests', async () => {
    const responder = mock<ConversationSyncResponder>();
    const consumer = new RespondToConversationSyncRequest(
      eventConsumer,
      responder,
    );

    await consumer.handler(
      new ConversationSyncRequestedEvent(conversationId, {
        requestId: 'request-3',
      }),
    );

    expect(responder.respond).toHaveBeenCalledWith(
      expect.any(ConversationSyncResponseMessage),
    );
    expect(responder.respond.mock.calls[0][0].conversationId.valueOf()).toBe(
      conversationId,
    );
    expect(responder.respond.mock.calls[0][0].requestId?.valueOf()).toBe(
      'request-3',
    );
  });

  it('registers valid messages announced by conversation sync responses', async () => {
    const registrar = mock<ConversationMessageRegistrar>();
    const consumer = new RegisterMessagesWhenSyncAvailable(
      eventConsumer,
      registrar,
    );

    await consumer.handler(
      new ConversationSyncAvailableEvent(conversationId, {
        messageCandidates: [{ messageId }, { messageId: 42 }, null],
      }),
    );

    expect(registrar.register).toHaveBeenCalledTimes(1);
    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterConversationMessage),
    );
    expect(registrar.register.mock.calls[0][0].messageId.valueOf()).toBe(
      messageId,
    );
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
