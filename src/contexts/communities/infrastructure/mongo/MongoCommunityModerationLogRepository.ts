import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CommunityModerationLogEntry } from '../../domain/CommunityModerationLogEntry';
import { CommunityModerationLogRepository as LogRepository } from '../../domain/repositories/CommunityModerationLogRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '../../domain/value-objects/CommunityModerationLogId';
import { MongoCommunityModerationLogDocument } from './documents/MongoCommunityModerationLogDocument';

export class MongoCommunityModerationLogRepository implements LogRepository {
  private static readonly COLLECTION = 'community_moderation_logs';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityModerationLogDocument>(
      MongoCommunityModerationLogRepository.COLLECTION,
    );
  }

  private toDocument(
    entry: CommunityModerationLogEntry,
  ): MongoCommunityModerationLogDocument {
    const primitives = entry.toPrimitives();

    return {
      _id: primitives.id,
      action: primitives.action,
      actorIdentityId: primitives.actorIdentityId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      details: primitives.details,
      target: primitives.target,
    };
  }

  private toDomain(
    document: MongoCommunityModerationLogDocument,
  ): CommunityModerationLogEntry {
    return CommunityModerationLogEntry.fromPrimitives({
      action: document.action,
      actorIdentityId: document.actorIdentityId,
      communityId: document.communityId,
      createdAt: document.createdAt,
      details: document.details,
      id: document._id,
      target: document.target,
    });
  }

  public async findByCommunity(
    communityId: CommunityId,
    limit: number,
    beforeLogId?: CommunityModerationLogId,
  ): Promise<CommunityModerationLogEntry[]> {
    const beforeLog = beforeLogId
      ? await (await this.collection()).findOne({ _id: beforeLogId.valueOf() })
      : undefined;
    const documents = await (
      await this.collection()
    )
      .find({
        communityId: communityId.valueOf(),
        ...(beforeLog ? { createdAt: { $lt: beforeLog.createdAt } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    await (
      await this.collection()
    ).deleteMany({
      communityId: communityId.valueOf(),
    });
  }

  public async save(entry: CommunityModerationLogEntry): Promise<void> {
    const document = this.toDocument(entry);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
