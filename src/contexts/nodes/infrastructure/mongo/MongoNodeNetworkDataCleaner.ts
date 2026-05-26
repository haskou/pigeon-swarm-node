import { MongoCallDocument } from '@app/contexts/calls/infrastructure/mongo/documents/MongoCallDocument';
import { MongoCommunityChannelMessageDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityChannelMessageDocument';
import { MongoCommunityChannelMessageReactionDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityChannelMessageReactionDocument';
import { MongoCommunityDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityDocument';
import { MongoCommunityInviteDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityInviteDocument';
import { MongoCommunityModerationLogDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityModerationLogDocument';
import { MongoCommunityRequestDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityRequestDocument';
import { MongoConversationDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoConversationDocument';
import { MongoMessageMetadataDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoMessageMetadataDocument';
import { MongoMessageReactionDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoMessageReactionDocument';
import { MongoUnreadConversationMessageDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoUnreadConversationMessageDocument';
import { MongoIdentityMetadataDocument } from '@app/contexts/identities/infrastructure/mongo/documents/MongoIdentityMetadataDocument';
import { MongoIPFSContentReplicaClaimDocument } from '@app/contexts/ipfs-replication/infrastructure/mongo/documents/MongoIPFSContentReplicaClaimDocument';
import { MongoIPFSContentReplicationDocument } from '@app/contexts/ipfs-replication/infrastructure/mongo/documents/MongoIPFSContentReplicationDocument';
import { MongoIPFSReplicationStatusSummaryDocument } from '@app/contexts/ipfs-replication/infrastructure/mongo/documents/MongoIPFSReplicationStatusSummaryDocument';
import { MongoNodePeerDocument } from '@app/contexts/nodes/infrastructure/mongo/documents/MongoNodePeerDocument';
import { MongoNotificationDocument } from '@app/contexts/notifications/infrastructure/mongo/documents/MongoNotificationDocument';
import { MongoPollDocument } from '@app/contexts/polls/infrastructure/mongo/documents/MongoPollDocument';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { NodeNetworkDataCleaner } from '../../domain/services/NodeNetworkDataCleaner';

type CommunityIdentifier = Pick<MongoCommunityDocument, '_id'>;
type CommunityReactionDocument = MongoCommunityChannelMessageReactionDocument;
type ConversationIdentifier = Pick<MongoConversationDocument, '_id'>;

export class MongoNodeNetworkDataCleaner implements NodeNetworkDataCleaner {
  private static readonly CALLS = 'calls';
  private static readonly COMMUNITIES = 'communities';
  private static readonly COMMUNITY_INVITES = 'community_invites';
  private static readonly COMMUNITY_MESSAGES = 'community_channel_messages';
  private static readonly COMMUNITY_MODERATION_LOGS =
    'community_moderation_logs';

  private static readonly COMMUNITY_REACTIONS =
    'community_channel_message_reactions';

  private static readonly COMMUNITY_REQUESTS = 'community_membership_requests';
  private static readonly CONVERSATION_MESSAGES = 'conversation_messages';
  private static readonly CONVERSATION_REACTIONS =
    'conversation_message_reactions';

  private static readonly CONVERSATION_UNREAD_MESSAGES =
    'conversation_unread_messages';

  private static readonly CONVERSATIONS = 'conversations';
  private static readonly IDENTITIES = 'identity_metadata';
  private static readonly IPFS_CONTENT_REPLICATION = 'ipfs_content_replication';

  private static readonly IPFS_REPLICA_CLAIMS = 'ipfs_content_replica_claims';
  private static readonly IPFS_REPLICATION_SUMMARIES =
    'ipfs_replication_status_summaries';

  private static readonly NODE_PEERS = 'node_peers';
  private static readonly NOTIFICATIONS = 'notifications';
  private static readonly POLLS = 'polls';

  constructor(
    private readonly mongo: MongoDB,
    private readonly networkRegistry: IPFSNetworkRegistry,
  ) {}

  private async findCommunityIds(networkId: string): Promise<string[]> {
    const communities = await this.mongo.getCollection<CommunityIdentifier>(
      MongoNodeNetworkDataCleaner.COMMUNITIES,
    );
    const documents = await communities
      .find({ networkId }, { projection: { _id: 1 } })
      .toArray();

    return documents.map((document) => document._id);
  }

  private async findConversationIds(networkId: string): Promise<string[]> {
    const conversations =
      await this.mongo.getCollection<ConversationIdentifier>(
        MongoNodeNetworkDataCleaner.CONVERSATIONS,
      );
    const documents = await conversations
      .find({ networkId }, { projection: { _id: 1 } })
      .toArray();

    return documents.map((document) => document._id);
  }

  private async cleanIdentities(networkId: string): Promise<void> {
    const identities =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoNodeNetworkDataCleaner.IDENTITIES,
      );

    await identities.deleteMany({
      networkIds: {
        $all: [networkId],
        $size: 1,
      },
    });
    await identities.updateMany(
      { networkIds: networkId },
      {
        $pull: {
          networkIds: networkId,
        },
      },
    );
  }

  private async cleanPeers(networkId: string): Promise<void> {
    const peers = await this.mongo.getCollection<MongoNodePeerDocument>(
      MongoNodeNetworkDataCleaner.NODE_PEERS,
    );

    await peers.updateMany(
      { 'networks.id': networkId },
      {
        $pull: {
          networks: {
            id: networkId,
          },
        },
      },
    );
    await peers.deleteMany({ networks: { $size: 0 } });
  }

  private async cleanConversations(
    networkId: string,
    conversationIds: string[],
  ): Promise<void> {
    await (
      await this.mongo.getCollection<MongoConversationDocument>(
        MongoNodeNetworkDataCleaner.CONVERSATIONS,
      )
    ).deleteMany({ networkId });

    await (
      await this.mongo.getCollection<MongoMessageMetadataDocument>(
        MongoNodeNetworkDataCleaner.CONVERSATION_MESSAGES,
      )
    ).deleteMany({
      $or: [
        { networkId },
        {
          conversationId: {
            $in: conversationIds,
          },
        },
      ],
    });

    await (
      await this.mongo.getCollection<MongoMessageReactionDocument>(
        MongoNodeNetworkDataCleaner.CONVERSATION_REACTIONS,
      )
    ).deleteMany({
      conversationId: {
        $in: conversationIds,
      },
    });

    await (
      await this.mongo.getCollection<MongoUnreadConversationMessageDocument>(
        MongoNodeNetworkDataCleaner.CONVERSATION_UNREAD_MESSAGES,
      )
    ).deleteMany({
      $or: [
        { networkId },
        {
          conversationId: {
            $in: conversationIds,
          },
        },
      ],
    });
  }

  private async cleanCommunities(
    networkId: string,
    communityIds: string[],
  ): Promise<void> {
    await (
      await this.mongo.getCollection<MongoCommunityDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITIES,
      )
    ).deleteMany({ networkId });

    await (
      await this.mongo.getCollection<MongoCommunityChannelMessageDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITY_MESSAGES,
      )
    ).deleteMany({
      communityId: {
        $in: communityIds,
      },
    });

    await (
      await this.mongo.getCollection<CommunityReactionDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITY_REACTIONS,
      )
    ).deleteMany({
      communityId: {
        $in: communityIds,
      },
    });

    await (
      await this.mongo.getCollection<MongoCommunityInviteDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITY_INVITES,
      )
    ).deleteMany({
      communityId: {
        $in: communityIds,
      },
    });

    await (
      await this.mongo.getCollection<MongoCommunityRequestDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITY_REQUESTS,
      )
    ).deleteMany({
      communityId: {
        $in: communityIds,
      },
    });

    await (
      await this.mongo.getCollection<MongoCommunityModerationLogDocument>(
        MongoNodeNetworkDataCleaner.COMMUNITY_MODERATION_LOGS,
      )
    ).deleteMany({
      communityId: {
        $in: communityIds,
      },
    });
  }

  private async cleanCalls(networkId: string): Promise<void> {
    await (
      await this.mongo.getCollection<MongoCallDocument>(
        MongoNodeNetworkDataCleaner.CALLS,
      )
    ).deleteMany({ networkId });
  }

  private async cleanPolls(networkId: string): Promise<void> {
    await (
      await this.mongo.getCollection<MongoPollDocument>(
        MongoNodeNetworkDataCleaner.POLLS,
      )
    ).deleteMany({
      'scope.networkId': networkId,
    });
  }

  private async cleanNotifications(
    networkId: string,
    communityIds: string[],
    conversationIds: string[],
  ): Promise<void> {
    await (
      await this.mongo.getCollection<MongoNotificationDocument>(
        MongoNodeNetworkDataCleaner.NOTIFICATIONS,
      )
    ).deleteMany({
      $or: [
        { 'payload.networkId': networkId },
        {
          'payload.communityId': {
            $in: communityIds,
          },
        },
        {
          'payload.conversationId': {
            $in: conversationIds,
          },
        },
      ],
    });
  }

  private async cleanIPFSReplication(networkId: string): Promise<void> {
    await (
      await this.mongo.getCollection<MongoIPFSContentReplicaClaimDocument>(
        MongoNodeNetworkDataCleaner.IPFS_REPLICA_CLAIMS,
      )
    ).deleteMany({ networkId });

    const contentReplication =
      await this.mongo.getCollection<MongoIPFSContentReplicationDocument>(
        MongoNodeNetworkDataCleaner.IPFS_CONTENT_REPLICATION,
      );

    await contentReplication.deleteMany({
      networkIds: {
        $all: [networkId],
        $size: 1,
      },
    });
    await contentReplication.updateMany(
      { networkIds: networkId },
      {
        $pull: {
          networkIds: networkId,
        },
      },
    );

    await (
      await this.mongo.getCollection<MongoIPFSReplicationStatusSummaryDocument>(
        MongoNodeNetworkDataCleaner.IPFS_REPLICATION_SUMMARIES,
      )
    ).deleteMany({});
  }

  public async clean(networkId: NetworkId): Promise<void> {
    const networkIdValue = networkId.valueOf();
    const communityIds = await this.findCommunityIds(networkIdValue);
    const conversationIds = await this.findConversationIds(networkIdValue);

    await this.networkRegistry.deleteNetwork(networkIdValue);
    await this.cleanIdentities(networkIdValue);
    await this.cleanPeers(networkIdValue);
    await this.cleanConversations(networkIdValue, conversationIds);
    await this.cleanCommunities(networkIdValue, communityIds);
    await this.cleanCalls(networkIdValue);
    await this.cleanPolls(networkIdValue);
    await this.cleanNotifications(
      networkIdValue,
      communityIds,
      conversationIds,
    );
    await this.cleanIPFSReplication(networkIdValue);
  }
}
