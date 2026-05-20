import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Poll } from '../../domain/Poll';
import { PollRepository } from '../../domain/repositories/PollRepository';
import { PollId } from '../../domain/value-objects/PollId';
import { MongoPollDocument } from './documents/MongoPollDocument';

export class MongoPollRepository implements PollRepository {
  private static readonly COLLECTION = 'polls';

  constructor(private readonly mongo: MongoDB) {}

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

  public async save(poll: Poll): Promise<void> {
    const document = this.toDocument(poll);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
