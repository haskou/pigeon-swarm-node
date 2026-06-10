import { Collection, MongoServerError } from 'mongodb';

import { ExistingIndex } from './ExistingIndex';
import { IndexDefinition } from './IndexDefinition';
import MongoDB from './MongoDB';

export default class MongoIndexInitializer {
  private readonly indexes: IndexDefinition[] = [
    {
      collection: 'communities',
      keys: [
        ['memberIds', 1],
        ['createdAt', -1],
      ],
      name: 'communities_memberIds_createdAt_idx',
    },
    {
      collection: 'communities',
      keys: [
        ['discoverable', 1],
        ['networkId', 1],
        ['createdAt', -1],
      ],
      name: 'communities_discoverable_networkId_createdAt_idx',
    },
    {
      collection: 'conversations',
      keys: [
        ['participantIds', 1],
        ['createdAt', -1],
      ],
      name: 'conversations_participantIds_createdAt_idx',
    },
    {
      collection: 'conversation_messages',
      keys: [
        ['conversationId', 1],
        ['valid', 1],
        ['createdAt', -1],
      ],
      name: 'conversation_messages_conversation_valid_createdAt_idx',
    },
    {
      collection: 'conversation_messages',
      keys: [
        ['conversationId', 1],
        ['messageId', 1],
        ['valid', 1],
      ],
      name: 'conversation_messages_conversation_message_valid_idx',
    },
    {
      collection: 'conversation_messages',
      keys: [
        ['conversationId', 1],
        ['replyToMessageId', 1],
        ['valid', 1],
        ['createdAt', 1],
      ],
      name: 'conversation_messages_thread_createdAt_idx',
    },
    {
      collection: 'conversation_message_reactions',
      keys: [
        ['conversationId', 1],
        ['messageId', 1],
      ],
      name: 'conversation_message_reactions_message_idx',
    },
    {
      collection: 'conversation_unread_messages',
      keys: [
        ['recipientIdentityId', 1],
        ['conversationId', 1],
      ],
      name: 'conversation_unread_messages_recipient_conversation_idx',
    },
    {
      collection: 'conversation_unread_messages',
      keys: [
        ['recipientIdentityId', 1],
        ['conversationId', 1],
        ['messageId', 1],
      ],
      name: 'conversation_unread_messages_recipient_message_idx',
    },
    {
      collection: 'conversation_message_pins',
      keys: [
        ['conversationId', 1],
        ['createdAt', -1],
      ],
      name: 'conversation_message_pins_conversation_createdAt_idx',
    },
    {
      collection: 'community_channel_messages',
      keys: [
        ['communityId', 1],
        ['channelId', 1],
        ['createdAt', -1],
      ],
      name: 'community_channel_messages_channel_createdAt_idx',
    },
    {
      collection: 'community_channel_messages',
      keys: [
        ['communityId', 1],
        ['createdAt', -1],
      ],
      name: 'community_channel_messages_community_createdAt_idx',
    },
    {
      collection: 'community_channel_messages',
      keys: [
        ['communityId', 1],
        ['channelId', 1],
        ['plaintextPayload', 1],
      ],
      name: 'community_channel_messages_public_text_idx',
    },
    {
      collection: 'community_channel_message_reactions',
      keys: [
        ['channelId', 1],
        ['communityId', 1],
        ['messageId', 1],
      ],
      name: 'community_channel_message_reactions_message_idx',
    },
    {
      collection: 'community_channel_message_pins',
      keys: [
        ['communityId', 1],
        ['channelId', 1],
        ['createdAt', -1],
      ],
      name: 'community_channel_message_pins_channel_createdAt_idx',
    },
    {
      collection: 'polls',
      keys: [
        ['scope.type', 1],
        ['scope.communityId', 1],
        ['scope.channelId', 1],
        ['createdAt', -1],
        ['_id', -1],
      ],
      name: 'polls_community_channel_timeline_idx',
    },
    {
      collection: 'polls',
      keys: [
        ['scope.type', 1],
        ['scope.conversationId', 1],
        ['createdAt', -1],
        ['_id', -1],
      ],
      name: 'polls_group_conversation_timeline_idx',
    },
    {
      collection: 'community_membership_requests',
      keys: [
        ['communityId', 1],
        ['identityId', 1],
        ['updatedAt', -1],
      ],
      name: 'community_membership_requests_community_identity_idx',
    },
    {
      collection: 'community_membership_requests',
      keys: [
        ['creatorIdentityId', 1],
        ['identityId', 1],
        ['updatedAt', -1],
      ],
      name: 'community_membership_requests_identity_idx',
    },
    {
      collection: 'identity_presence',
      keys: [
        ['lastHeartbeatAt', 1],
        ['status', 1],
      ],
      name: 'identity_presence_expiration_idx',
    },
    {
      collection: 'notification_scope_settings',
      keys: [
        ['identityId', 1],
        ['scopeKey', 1],
      ],
      name: 'notification_scope_settings_identity_scope_idx',
    },
  ];

  constructor(private readonly mongo: MongoDB) {}

  private hasSameKeys(
    existingKeys: Record<string, unknown>,
    requestedKeys: ReadonlyArray<readonly [string, 1 | -1]>,
  ): boolean {
    const existingEntries = Object.entries(existingKeys);

    return (
      existingEntries.length === requestedKeys.length &&
      requestedKeys.every(([field, direction], index) => {
        const existingEntry = existingEntries[index];

        return (
          existingEntry !== undefined &&
          existingEntry[0] === field &&
          existingEntry[1] === direction
        );
      })
    );
  }

  private async findExistingIndex(
    collection: Collection,
    index: IndexDefinition,
  ): Promise<ExistingIndex | undefined> {
    try {
      const existingIndex = (await collection.indexes()).find(
        (candidate) => candidate.name === index.name,
      );

      if (!existingIndex) {
        return undefined;
      }

      return {
        key: existingIndex.key,
        name: existingIndex.name,
      };
    } catch (error) {
      if (
        error instanceof MongoServerError &&
        error.codeName === 'NamespaceNotFound'
      ) {
        return undefined;
      }

      throw error;
    }
  }

  public async ensure(): Promise<void> {
    for (const index of this.indexes) {
      const collection = await this.mongo.getCollection(index.collection);
      const keys = Object.fromEntries(index.keys);
      const existingIndex = await this.findExistingIndex(collection, index);

      if (
        existingIndex?.key &&
        !this.hasSameKeys(existingIndex.key, index.keys)
      ) {
        await collection.dropIndex(index.name);
      }

      await collection.createIndex(keys, {
        background: true,
        name: index.name,
      });
    }
  }
}
