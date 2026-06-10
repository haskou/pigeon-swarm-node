import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollId } from '../../domain/value-objects/PollId';
import { MongoPollDocument } from './documents/MongoPollDocument';

export default class MongoPollRepository extends PollRepository {
  private static readonly COLLECTION = 'polls';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoPollDocument>(
      MongoPollRepository.COLLECTION,
    );
  }

  private toDocument(poll: Poll): MongoPollDocument {
    const primitives = poll.toPrimitives();

    return {
      _id: primitives.id,
      allowsMultipleVotes: primitives.allowsMultipleVotes,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      expiresAt: primitives.expiresAt,
      options: primitives.options,
      question: primitives.question,
      scope: primitives.scope,
      status: primitives.status,
      votes: primitives.votes,
    };
  }

  private toDomain(document: MongoPollDocument): Poll {
    return Poll.fromPrimitives({
      allowsMultipleVotes: document.allowsMultipleVotes,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      expiresAt: document.expiresAt,
      id: document._id,
      options: document.options,
      question: document.question,
      scope: document.scope,
      status: document.status,
      votes: document.votes,
    });
  }

  public async findById(id: PollId): Promise<Poll | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        'scope.channelId': channelId.valueOf(),
        'scope.communityId': communityId.valueOf(),
        'scope.type': 'community_channel',
        ...(beforeCreatedAt ? { createdAt: { $lte: beforeCreatedAt } } : {}),
      })
      .sort([
        ['createdAt', -1],
        ['_id', -1],
      ])
      .limit(limit)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        'scope.conversationId': conversationId.valueOf(),
        'scope.type': 'group_conversation',
        ...(beforeCreatedAt ? { createdAt: { $lte: beforeCreatedAt } } : {}),
      })
      .sort([
        ['createdAt', -1],
        ['_id', -1],
      ])
      .limit(limit)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(poll: Poll): Promise<void> {
    const document = this.toDocument(poll);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
