import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelMessageWasEditedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasEditedEvent';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { CommunityInviteWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasAcceptedEvent';
import { CommunityInviteWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasCreatedEvent';
import { CommunityMembershipRequestWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasAcceptedEvent';
import { CommunityMembershipRequestWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasCreatedEvent';
import { CommunityMembershipRequestWasDeclinedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasDeclinedEvent';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from '@app/contexts/communities/domain/events/CommunityWasUpdatedEvent';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import { IPFSContentReplicationWasClaimedEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import { KeychainSyncAvailableEvent } from '@app/contexts/keychains/domain/events/KeychainSyncAvailableEvent';
import { NotificationWasAcceptedEvent } from '@app/contexts/notifications/domain/events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import { NotificationWasDeclinedEvent } from '@app/contexts/notifications/domain/events/NotificationWasDeclinedEvent';

import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from './ReplicatedDomainEventMessage';

export default class OrbitDBDomainEventProjector {
  private getStringAttribute(
    message: ReplicatedDomainEventMessage,
    attribute: string,
  ): string | undefined {
    const value = message.attributes[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private getNumberAttribute(
    message: ReplicatedDomainEventMessage,
    attribute: string,
  ): number | undefined {
    const value = message.attributes[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private getRecordAttribute(
    message: ReplicatedDomainEventMessage,
    attribute: string,
  ): Record<string, unknown> | undefined {
    const value = message.attributes[attribute];

    return this.isRecord(value) ? value : undefined;
  }

  private getArrayAttribute(
    message: ReplicatedDomainEventMessage,
    attribute: string,
  ): unknown[] {
    const value = message.attributes[attribute];

    return Array.isArray(value) ? value : [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private withoutUndefined(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.withoutUndefined(item));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [
          entryKey,
          this.withoutUndefined(entryValue),
        ]),
    );
  }

  private cleanRecord(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.withoutUndefined(record) as Record<string, unknown>;
  }

  private async put(
    store: OrbitDBDatabase,
    record: Record<string, unknown>,
  ): Promise<void> {
    await store.put?.(this.cleanRecord(record));
  }

  private async putHead(
    stores: OrbitDBReplicatedStateStores,
    key: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    await stores.heads.put?.(key, this.cleanRecord(record));
  }

  private stringValue(
    record: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = record[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    record: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = record[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private receivedAt(message: ReplicatedDomainEventMessage): number {
    return Number(message.occurred_on);
  }

  private async putEventHead(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    await this.putHead(
      stores,
      `event:${message.type}:${message.aggregate_id}`,
      {
        eventId: message.event_id,
        occurredOn: message.occurred_on,
      },
    );
  }

  private async projectIdentity(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const identityId =
      this.getStringAttribute(message, 'identityId') || message.aggregate_id;
    const externalIdentifier = this.getStringAttribute(
      message,
      'externalIdentifier',
    );

    await this.put(stores.identities, {
      cid: externalIdentifier,
      id: identityId,
      lastEventId: message.event_id,
      networkId: this.getStringAttribute(message, 'networkId'),
      receivedAt: this.receivedAt(message),
      version: this.getNumberAttribute(message, 'version'),
    });
  }

  private async projectKeychain(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const ownerIdentityId =
      this.getStringAttribute(message, 'ownerIdentityId') ||
      message.aggregate_id;

    await this.put(stores.keychains, {
      cid: this.getStringAttribute(message, 'externalIdentifier'),
      id: ownerIdentityId,
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
      version: this.getNumberAttribute(message, 'version'),
    });
  }

  private async putCommunity(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    community: Record<string, unknown>,
  ): Promise<void> {
    const communityId =
      this.stringValue(community, 'id') ||
      this.getStringAttribute(message, 'communityId') ||
      message.aggregate_id;

    await this.put(stores.communities, {
      ...community,
      id: communityId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectCommunity(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const community = this.getRecordAttribute(message, 'community');

    if (community) {
      await this.putCommunity(stores, message, community);

      return;
    }

    await this.put(stores.communities, {
      ...message.attributes,
      id: message.aggregate_id,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectConversation(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const conversation = this.getRecordAttribute(message, 'conversation');
    const conversationId =
      this.stringValue(conversation || {}, 'id') || message.aggregate_id;

    await this.put(stores.conversations, {
      ...(conversation || message.attributes),
      id: conversationId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    });
  }

  private async putMessageDocument(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    document: Record<string, unknown>,
  ): Promise<void> {
    const messageId =
      this.stringValue(document, 'id') ||
      this.stringValue(document, 'messageId') ||
      this.getStringAttribute(message, 'messageId') ||
      message.aggregate_id;

    await this.put(stores.messages, {
      ...document,
      id: messageId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectConversationMessage(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const document = this.getRecordAttribute(message, 'message') || {};
    const targetMessageId = this.getStringAttribute(message, 'targetMessageId');
    const conversationId =
      this.stringValue(document, 'conversationId') || message.aggregate_id;

    await this.putMessageDocument(stores, message, {
      ...document,
      conversationId,
      messageId: this.getStringAttribute(message, 'messageId'),
      scopeType: 'conversation',
      targetMessageId,
    });

    if (
      message.type === ConversationMessageWasDeletedEvent.EVENT_NAME &&
      targetMessageId
    ) {
      await this.put(stores.messages, {
        conversationId,
        id: targetMessageId,
        messageId: targetMessageId,
        scopeType: 'conversation',
        valid: false,
      });
    }
  }

  private async projectCommunityMessage(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const document = this.getRecordAttribute(message, 'message') || {};

    await this.putMessageDocument(stores, message, {
      ...document,
      channelId:
        this.stringValue(document, 'channelId') ||
        this.getStringAttribute(message, 'channelId'),
      communityId:
        this.stringValue(document, 'communityId') ||
        this.getStringAttribute(message, 'communityId') ||
        message.aggregate_id,
      messageId: this.getStringAttribute(message, 'messageId'),
      scopeType: 'community_channel',
      targetMessageId: this.getStringAttribute(message, 'targetMessageId'),
    });
  }

  private reactionValue(
    message: ReplicatedDomainEventMessage,
    reaction: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    return (
      this.stringValue(reaction, attribute) ||
      this.getStringAttribute(message, attribute)
    );
  }

  private reactionScopeType(
    message: ReplicatedDomainEventMessage,
    reaction: Record<string, unknown>,
  ): 'community_channel' | 'conversation' {
    return this.reactionValue(message, reaction, 'communityId')
      ? 'community_channel'
      : 'conversation';
  }

  private reactionDocumentId(
    message: ReplicatedDomainEventMessage,
    reaction: Record<string, unknown>,
    scopeType: string,
  ): string {
    const conversationId =
      scopeType === 'conversation'
        ? this.reactionValue(message, reaction, 'conversationId') ||
          message.aggregate_id
        : undefined;

    return [
      scopeType,
      this.reactionValue(message, reaction, 'communityId'),
      this.reactionValue(message, reaction, 'channelId'),
      conversationId,
      this.reactionValue(message, reaction, 'messageId'),
      this.stringValue(reaction, 'authorId') ||
        this.stringValue(reaction, 'authorIdentityId'),
      this.stringValue(reaction, 'emoji'),
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(':');
  }

  private async putReactionDocument(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    reaction: Record<string, unknown>,
    removed: boolean,
  ): Promise<void> {
    const scopeType = this.reactionScopeType(message, reaction);
    const id = this.reactionDocumentId(message, reaction, scopeType);

    await this.put(stores.reactions, {
      ...reaction,
      id,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
      removed,
      scopeType,
    });
  }

  private async projectConversationSyncMessageCandidate(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    candidate: Record<string, unknown>,
  ): Promise<void> {
    const messageDocument = this.isRecord(candidate.message)
      ? candidate.message
      : candidate;
    const messageId =
      this.stringValue(candidate, 'messageId') ||
      this.stringValue(messageDocument, 'id');

    await this.putMessageDocument(stores, message, {
      ...messageDocument,
      conversationId:
        this.stringValue(messageDocument, 'conversationId') ||
        message.aggregate_id,
      id: messageId,
      messageId,
      scopeType: 'conversation',
    });
  }

  private async projectConversationSyncReactionCandidate(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    reaction: Record<string, unknown>,
  ): Promise<void> {
    await this.putReactionDocument(stores, message, reaction, false);
  }

  private async projectReaction(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
    removed: boolean,
  ): Promise<void> {
    await this.putReactionDocument(
      stores,
      message,
      message.attributes,
      removed,
    );
  }

  private async projectReadMarker(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const readerIdentityId = this.getStringAttribute(
      message,
      'readerIdentityId',
    );
    const messageId = this.getStringAttribute(message, 'messageId');

    if (!readerIdentityId || !messageId) {
      return;
    }

    await this.putHead(
      stores,
      `read-marker:${message.aggregate_id}:${readerIdentityId}`,
      {
        eventId: message.event_id,
        messageId,
        networkId: this.getStringAttribute(message, 'networkId'),
        readAt: this.receivedAt(message),
      },
    );
  }

  private async projectNotification(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const notification = this.getRecordAttribute(message, 'notification');

    await this.put(stores.notifications, {
      ...(notification || message.attributes),
      id: message.aggregate_id,
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectRequest(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const request = this.getRecordAttribute(message, 'request');
    const requestId =
      this.stringValue(request || {}, 'id') ||
      this.getStringAttribute(message, 'requestId') ||
      this.getStringAttribute(message, 'inviteId') ||
      message.aggregate_id;

    await this.put(stores.requests, {
      ...(request || message.attributes),
      id: requestId,
      kind: 'community_membership_request',
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectInvite(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const invite = this.getRecordAttribute(message, 'invite') || {};
    const token =
      this.stringValue(invite, 'token') ||
      this.getStringAttribute(message, 'inviteToken') ||
      message.aggregate_id;

    await this.put(stores.requests, {
      ...invite,
      id: token,
      kind: 'community_invite',
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
      token,
    });
  }

  private async projectIPFSReplication(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    await this.put(stores.ipfsReplication, {
      ...message.attributes,
      id: message.aggregate_id,
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectIPFSReplicaClaim(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const cid = this.getStringAttribute(message, 'cid') || message.aggregate_id;
    const networkId = this.getStringAttribute(message, 'networkId');
    const nodeId = this.getStringAttribute(message, 'nodeId');

    if (!networkId || !nodeId) {
      return;
    }

    await this.put(stores.ipfsReplication, {
      ...message.attributes,
      cid,
      id: `${cid}:${networkId}:${nodeId}`,
      kind: 'ipfs_content_replica_claim',
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    });
  }

  private async projectConversationSync(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const conversation = this.getRecordAttribute(message, 'conversation');

    if (conversation) {
      await this.projectConversation(stores, message);
    }

    for (const candidate of this.getArrayAttribute(
      message,
      'messageCandidates',
    )) {
      if (!this.isRecord(candidate)) {
        continue;
      }

      await this.projectConversationSyncMessageCandidate(
        stores,
        message,
        candidate,
      );
    }

    for (const reaction of this.getArrayAttribute(
      message,
      'reactionCandidates',
    )) {
      if (this.isRecord(reaction)) {
        await this.projectConversationSyncReactionCandidate(
          stores,
          message,
          reaction,
        );
      }
    }
  }

  private async projectCommunitySync(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const community = this.getRecordAttribute(message, 'community');

    if (community) {
      await this.putCommunity(stores, message, community);
    }

    for (const candidate of this.getArrayAttribute(
      message,
      'messageCandidates',
    )) {
      if (!this.isRecord(candidate)) {
        continue;
      }

      await this.putMessageDocument(stores, message, {
        ...candidate,
        communityId:
          this.stringValue(candidate, 'communityId') ||
          this.getStringAttribute(message, 'communityId') ||
          message.aggregate_id,
        scopeType: 'community_channel',
      });
    }

    for (const reaction of this.getArrayAttribute(
      message,
      'reactionCandidates',
    )) {
      if (this.isRecord(reaction)) {
        await this.putReactionDocument(stores, message, reaction, false);
      }
    }
  }

  public async project(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    await this.putEventHead(stores, message);

    const projection = [
      {
        eventNames: [IdentitySyncAvailableEvent.EVENT_NAME],
        project: () => this.projectIdentity(stores, message),
      },
      {
        eventNames: [KeychainSyncAvailableEvent.EVENT_NAME],
        project: () => this.projectKeychain(stores, message),
      },
      {
        eventNames: [
          CommunityWasCreatedEvent.EVENT_NAME,
          CommunityWasUpdatedEvent.EVENT_NAME,
        ],
        project: () => this.projectCommunity(stores, message),
      },
      {
        eventNames: [ConversationWasCreatedEvent.EVENT_NAME],
        project: () => this.projectConversation(stores, message),
      },
      {
        eventNames: [ConversationSyncAvailableEvent.EVENT_NAME],
        project: () => this.projectConversationSync(stores, message),
      },
      {
        eventNames: [CommunitySyncAvailableEvent.EVENT_NAME],
        project: () => this.projectCommunitySync(stores, message),
      },
      {
        eventNames: [
          ConversationMessageWasSentEvent.EVENT_NAME,
          ConversationMessageWasEditedEvent.EVENT_NAME,
          ConversationMessageWasDeletedEvent.EVENT_NAME,
        ],
        project: () => this.projectConversationMessage(stores, message),
      },
      {
        eventNames: [
          CommunityChannelMessageWasSentEvent.EVENT_NAME,
          CommunityChannelMessageWasEditedEvent.EVENT_NAME,
          CommunityChannelMessageWasDeletedEvent.EVENT_NAME,
        ],
        project: () => this.projectCommunityMessage(stores, message),
      },
      {
        eventNames: [ConversationMessagesWereReadEvent.EVENT_NAME],
        project: () => this.projectReadMarker(stores, message),
      },
      {
        eventNames: [
          NotificationWasAcceptedEvent.EVENT_NAME,
          NotificationWasCreatedEvent.EVENT_NAME,
          NotificationWasDeclinedEvent.EVENT_NAME,
        ],
        project: () => this.projectNotification(stores, message),
      },
      {
        eventNames: [
          ConversationMessageReactionWasAddedEvent.EVENT_NAME,
          CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME,
        ],
        project: () => this.projectReaction(stores, message, false),
      },
      {
        eventNames: [
          ConversationMessageReactionWasRemovedEvent.EVENT_NAME,
          CommunityChannelMessageReactionRemovedEvent.EVENT_NAME,
        ],
        project: () => this.projectReaction(stores, message, true),
      },
      {
        eventNames: [
          CommunityMembershipRequestWasCreatedEvent.EVENT_NAME,
          CommunityMembershipRequestWasAcceptedEvent.EVENT_NAME,
          CommunityMembershipRequestWasDeclinedEvent.EVENT_NAME,
        ],
        project: () => this.projectRequest(stores, message),
      },
      {
        eventNames: [
          CommunityInviteWasCreatedEvent.EVENT_NAME,
          CommunityInviteWasAcceptedEvent.EVENT_NAME,
        ],
        project: () => this.projectInvite(stores, message),
      },
      {
        eventNames: [IPFSContentReplicationWasRegisteredEvent.EVENT_NAME],
        project: () => this.projectIPFSReplication(stores, message),
      },
      {
        eventNames: [IPFSContentReplicationWasClaimedEvent.EVENT_NAME],
        project: () => this.projectIPFSReplicaClaim(stores, message),
      },
    ].find(({ eventNames }) => eventNames.includes(message.type));

    await projection?.project();
  }
}
