import MongoDB from './MongoDB';

type IndexDefinition = {
  readonly collection: string;
  readonly keys: Record<string, 1 | -1>;
  readonly name: string;
};

export class MongoIndexInitializer {
  private readonly indexes: IndexDefinition[] = [
    {
      collection: 'communities',
      keys: { memberIds: 1, createdAt: -1 },
      name: 'communities_memberIds_createdAt_idx',
    },
    {
      collection: 'communities',
      keys: { discoverable: 1, networkId: 1, createdAt: -1 },
      name: 'communities_discoverable_networkId_createdAt_idx',
    },
    {
      collection: 'community_channel_messages',
      keys: { communityId: 1, channelId: 1, createdAt: -1 },
      name: 'community_channel_messages_channel_createdAt_idx',
    },
    {
      collection: 'community_channel_messages',
      keys: { communityId: 1, createdAt: -1 },
      name: 'community_channel_messages_community_createdAt_idx',
    },
    {
      collection: 'community_channel_message_reactions',
      keys: { channelId: 1, communityId: 1, messageId: 1 },
      name: 'community_channel_message_reactions_message_idx',
    },
    {
      collection: 'community_membership_requests',
      keys: { communityId: 1, identityId: 1, updatedAt: -1 },
      name: 'community_membership_requests_community_identity_idx',
    },
    {
      collection: 'community_membership_requests',
      keys: { creatorIdentityId: 1, identityId: 1, updatedAt: -1 },
      name: 'community_membership_requests_identity_idx',
    },
    {
      collection: 'identity_presence',
      keys: { lastHeartbeatAt: 1, status: 1 },
      name: 'identity_presence_expiration_idx',
    },
  ];

  constructor(private readonly mongo: MongoDB) {}

  private hasSameKeys(
    existingKeys: Record<string, unknown>,
    requestedKeys: Record<string, 1 | -1>,
  ): boolean {
    const existingEntries = Object.entries(existingKeys);
    const requestedEntries = Object.entries(requestedKeys);

    return (
      existingEntries.length === requestedEntries.length &&
      requestedEntries.every(([field, direction], index) => {
        const existingEntry = existingEntries[index];

        return (
          existingEntry !== undefined &&
          existingEntry[0] === field &&
          existingEntry[1] === direction
        );
      })
    );
  }

  public async ensure(): Promise<void> {
    for (const index of this.indexes) {
      const collection = await this.mongo.getCollection(index.collection);
      const existingIndex = (await collection.indexes()).find(
        (candidate) => candidate.name === index.name,
      );

      if (
        existingIndex?.key &&
        !this.hasSameKeys(existingIndex.key, index.keys)
      ) {
        await collection.dropIndex(index.name);
      }

      await collection.createIndex(index.keys, {
        background: true,
        name: index.name,
      });
    }
  }
}
