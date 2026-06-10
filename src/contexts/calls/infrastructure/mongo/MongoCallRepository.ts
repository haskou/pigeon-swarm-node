import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import { MongoCallDocument } from './documents/MongoCallDocument';

export default class MongoCallRepository extends CallRepository {
  private static readonly COLLECTION = 'calls';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoCallDocument>(
      MongoCallRepository.COLLECTION,
    );
  }

  private toDocument(call: Call): MongoCallDocument {
    const primitives = call.toPrimitives();

    return {
      _id: primitives.id,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
    };
  }

  private toDomain(document: MongoCallDocument): Call {
    return Call.fromPrimitives({
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      endedAt: document.endedAt,
      endedByIdentityId: document.endedByIdentityId,
      id: document._id,
      networkId: document.networkId,
      participantIds: document.participantIds,
      participants: document.participants,
      scope: document.scope,
      status: document.status,
    });
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        participants: {
          $elemMatch: {
            identityId: participantId.valueOf(),
            status: { $in: ['joined', 'ringing'] },
          },
        },
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        participantIds: participantId.valueOf(),
      })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        'scope.conversationId': conversationId.valueOf(),
        'scope.type': 'conversation',
      })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        'scope.channelId': channelId.valueOf(),
        'scope.communityId': communityId.valueOf(),
        'scope.type': 'community_channel',
      })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const document = await (
      await this.collection()
    ).findOne(
      {
        'scope.channelId': channelId.valueOf(),
        'scope.communityId': communityId.valueOf(),
        'scope.type': 'community_channel',
        status: 'active',
      },
      {
        sort: { createdAt: -1 },
      },
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        'scope.communityId': communityId.valueOf(),
        'scope.type': 'community_channel',
        status: 'active',
      })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        createdAt: { $lte: timeoutThreshold.valueOf() },
        'participants.status': 'ringing',
        status: 'active',
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findTimedOutJoinedCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        participants: {
          $elemMatch: {
            lastSeenAt: { $lte: timeoutThreshold.valueOf() },
            status: 'joined',
          },
        },
        status: 'active',
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(call: Call): Promise<void> {
    const document = this.toDocument(call);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
