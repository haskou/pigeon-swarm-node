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
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from '@app/contexts/communities/domain/events/CommunityWasUpdatedEvent';
import { ContentReplicationWasClaimedEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasClaimedEvent';
import { ContentReplicationWasRegisteredEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasRegisteredEvent';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
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

  private recordValue(
    entry: { value?: unknown } | unknown,
  ): Record<string, unknown> | undefined {
    if (this.isRecord(entry) && 'value' in entry) {
      return this.isRecord(entry.value) ? entry.value : undefined;
    }

    return this.isRecord(entry) ? entry : undefined;
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

  private async findHead(
    stores: OrbitDBReplicatedStateStores,
    key: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.recordValue(await stores.heads.get?.(key));
  }

  private stringValue(
    record: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = record[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private stringArrayValue(
    record: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = record[attribute];

    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
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

  private isAtLeastAsFresh(
    candidate: Record<string, unknown>,
    current: Record<string, unknown>,
  ): boolean {
    const candidateVersion = this.numberValue(candidate, 'version') ?? 0;
    const currentVersion = this.numberValue(current, 'version') ?? 0;

    if (candidateVersion !== currentVersion) {
      return candidateVersion > currentVersion;
    }

    return (
      (this.numberValue(candidate, 'receivedAt') ?? 0) >=
      (this.numberValue(current, 'receivedAt') ?? 0)
    );
  }

  private async shouldReplaceHead(
    stores: OrbitDBReplicatedStateStores,
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    const current = await this.findHead(stores, key);

    return !current || this.isAtLeastAsFresh(record, current);
  }

  private async putFreshHead(
    stores: OrbitDBReplicatedStateStores,
    key: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    if (await this.shouldReplaceHead(stores, key, record)) {
      await this.putHead(stores, key, record);
    }
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

    const identity = {
      cid: externalIdentifier,
      handle: this.getStringAttribute(message, 'handle'),
      id: identityId,
      lastEventId: message.event_id,
      networkId: this.getStringAttribute(message, 'networkId'),
      networkIds: this.getArrayAttribute(message, 'networkIds').filter(
        (networkId): networkId is string => typeof networkId === 'string',
      ),
      previousCid: this.getStringAttribute(
        message,
        'previousExternalIdentifier',
      ),
      receivedAt: this.receivedAt(message),
      version: this.getNumberAttribute(message, 'version'),
    };
    const shouldProject = await this.shouldReplaceHead(
      stores,
      `identity:${identityId}`,
      identity,
    );

    if (!shouldProject) {
      return;
    }

    await this.put(stores.identities, identity);
    await this.putHead(stores, `identity:${identityId}`, identity);
    const handle = this.getStringAttribute(message, 'handle');

    if (handle) {
      await this.putFreshHead(stores, `identity-handle:${handle}`, identity);
    }
  }

  private async projectKeychain(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const ownerIdentityId =
      this.getStringAttribute(message, 'ownerIdentityId') ||
      message.aggregate_id;

    const keychain = {
      cid: this.getStringAttribute(message, 'externalIdentifier'),
      id: ownerIdentityId,
      lastEventId: message.event_id,
      ownerIdentityId,
      previousCid: this.getStringAttribute(
        message,
        'previousExternalIdentifier',
      ),
      receivedAt: this.receivedAt(message),
      version: this.getNumberAttribute(message, 'version'),
    };
    const shouldProject = await this.shouldReplaceHead(
      stores,
      `keychain:${ownerIdentityId}`,
      keychain,
    );

    if (!shouldProject) {
      return;
    }

    await this.put(stores.keychains, keychain);
    await this.putHead(stores, `keychain:${ownerIdentityId}`, keychain);
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

    const document = {
      ...community,
      id: communityId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    };

    await this.put(stores.communities, document);
    await this.putFreshHead(stores, `community:${communityId}`, document);
    await Promise.all(
      this.stringArrayValue(document, 'memberIds').map((memberId) =>
        this.putCommunityMemberIndex(stores, memberId, document),
      ),
    );
  }

  private async putCommunityMemberIndex(
    stores: OrbitDBReplicatedStateStores,
    memberId: string,
    community: Record<string, unknown>,
  ): Promise<void> {
    const key = `community-member-index:${memberId}`;
    const communities = this.mergeIndexedRecord(
      this.recordsFromIndex(await this.findHead(stores, key), 'communities'),
      community,
    ).filter((document) =>
      this.stringArrayValue(document, 'memberIds').includes(memberId),
    );

    await this.putHead(stores, key, {
      communities,
      id: key,
      memberId,
      updatedAt: Date.now(),
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

    await this.putCommunity(stores, message, {
      ...message.attributes,
      id: message.aggregate_id,
    });
  }

  private async projectConversation(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const conversation = this.getRecordAttribute(message, 'conversation');
    const conversationId =
      this.stringValue(conversation || {}, 'id') || message.aggregate_id;

    const document = {
      ...(conversation || message.attributes),
      id: conversationId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    };
    const participantIds = this.stringArrayValue(document, 'participantIds');

    await this.put(stores.conversations, document);
    await this.putHead(stores, `conversation:${conversationId}`, document);
    await Promise.all(
      participantIds.map((participantId) =>
        this.putConversationParticipantIndex(stores, participantId, document),
      ),
    );
  }

  private recordsFromIndex(
    index: Record<string, unknown> | undefined,
    attribute: string,
  ): Record<string, unknown>[] {
    const value = index?.[attribute];

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is Record<string, unknown> =>
      this.isRecord(item),
    );
  }

  private mergeIndexedRecord(
    records: Record<string, unknown>[],
    record: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const recordId = this.stringValue(record, 'id');

    if (!recordId) {
      return records;
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const current of records) {
      const currentId = this.stringValue(current, 'id');

      if (currentId) {
        merged.set(currentId, current);
      }
    }

    merged.set(recordId, record);

    return [...merged.values()];
  }

  private async putConversationParticipantIndex(
    stores: OrbitDBReplicatedStateStores,
    participantId: string,
    conversation: Record<string, unknown>,
  ): Promise<void> {
    const key = `conversation-participant-index:${participantId}`;
    const conversations = this.mergeIndexedRecord(
      this.recordsFromIndex(await this.findHead(stores, key), 'conversations'),
      conversation,
    );

    await this.putHead(stores, key, {
      conversations,
      id: key,
      participantId,
      updatedAt: Date.now(),
    });
  }

  private async putConversationMessageIndex(
    stores: OrbitDBReplicatedStateStores,
    conversationId: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const key = `conversation-message-index:${conversationId}`;
    const messages = this.mergeIndexedRecord(
      this.recordsFromIndex(await this.findHead(stores, key), 'messages'),
      message,
    );

    await this.putHead(stores, key, {
      conversationId,
      id: key,
      messages,
      updatedAt: Date.now(),
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

    const messageDocument = {
      ...document,
      id: messageId,
      lastEventId: message.event_id,
      lastEventType: message.type,
      receivedAt: this.receivedAt(message),
    };

    await this.put(stores.messages, messageDocument);

    if (this.stringValue(messageDocument, 'scopeType') === 'conversation') {
      const conversationId = this.stringValue(
        messageDocument,
        'conversationId',
      );

      if (conversationId) {
        await this.putConversationMessageIndex(
          stores,
          conversationId,
          messageDocument,
        );
      }
    }
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
      await this.putMessageDocument(stores, message, {
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
    const document = {
      ...(notification || message.attributes),
      id: message.aggregate_id,
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    };
    const recipientIdentityId = this.stringValue(
      document,
      'recipientIdentityId',
    );

    await this.put(stores.notifications, document);
    await this.putHead(
      stores,
      `notification:${message.aggregate_id}`,
      document,
    );

    if (recipientIdentityId) {
      await this.putNotificationRecipientIndex(
        stores,
        recipientIdentityId,
        document,
      );
    }
  }

  private async putNotificationRecipientIndex(
    stores: OrbitDBReplicatedStateStores,
    recipientIdentityId: string,
    notification: Record<string, unknown>,
  ): Promise<void> {
    const key = `notification-recipient-index:${recipientIdentityId}`;
    const notifications = this.mergeIndexedRecord(
      this.recordsFromIndex(await this.findHead(stores, key), 'notifications'),
      notification,
    );

    await this.putHead(stores, key, {
      id: key,
      notifications,
      recipientIdentityId,
      updatedAt: Date.now(),
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

  private async projectContentReplication(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const content = {
      ...message.attributes,
      id: message.aggregate_id,
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    };
    const cid = this.stringValue(content, 'cid') || message.aggregate_id;

    await this.put(stores.contentReplication, content);
    await this.putHead(stores, `content-replication:${cid}`, content);
  }

  private async projectContentReplicaClaim(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const cid = this.getStringAttribute(message, 'cid') || message.aggregate_id;
    const networkId = this.getStringAttribute(message, 'networkId');
    const nodeId = this.getStringAttribute(message, 'nodeId');

    if (!networkId || !nodeId) {
      return;
    }

    await this.put(stores.contentReplication, {
      ...message.attributes,
      cid,
      id: `${cid}:${networkId}:${nodeId}`,
      kind: 'content_replica_claim',
      lastEventId: message.event_id,
      receivedAt: this.receivedAt(message),
    });
  }

  public async project(
    stores: OrbitDBReplicatedStateStores,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    await this.putEventHead(stores, message);

    const projection = [
      {
        eventNames: [
          IdentityWasCreatedEvent.EVENT_NAME,
          IdentityWasUpdatedEvent.EVENT_NAME,
        ],
        project: () => this.projectIdentity(stores, message),
      },
      {
        eventNames: [KeychainWasPublishedEvent.EVENT_NAME],
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
        eventNames: [ContentReplicationWasRegisteredEvent.EVENT_NAME],
        project: () => this.projectContentReplication(stores, message),
      },
      {
        eventNames: [ContentReplicationWasClaimedEvent.EVENT_NAME],
        project: () => this.projectContentReplicaClaim(stores, message),
      },
    ].find(({ eventNames }) => eventNames.includes(message.type));

    await projection?.project();
  }
}
