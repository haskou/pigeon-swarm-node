import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { PushSubscription } from '../../domain/PushSubscription';
import { PushSubscriptionRepository as Repository } from '../../domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionEndpoint } from '../../domain/value-objects/PushSubscriptionEndpoint';
import { MongoPushSubscriptionDocument } from './documents/MongoPushSubscriptionDocument';

export class MongoPushSubscriptionRepository implements Repository {
  private static readonly COLLECTION = 'push_subscriptions';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoPushSubscriptionDocument>(
      MongoPushSubscriptionRepository.COLLECTION,
    );
  }

  private toDocument(
    subscription: PushSubscription,
  ): MongoPushSubscriptionDocument {
    const primitives = subscription.toPrimitives();

    return {
      _id: primitives.endpoint,
      auth: primitives.auth,
      createdAt: primitives.createdAt,
      endpoint: primitives.endpoint,
      expirationTime: primitives.expirationTime,
      identityId: primitives.identityId,
      p256dh: primitives.p256dh,
    };
  }

  private toDomain(document: MongoPushSubscriptionDocument): PushSubscription {
    return PushSubscription.fromPrimitives({
      auth: document.auth,
      createdAt: document.createdAt,
      endpoint: document.endpoint,
      expirationTime: document.expirationTime,
      identityId: document.identityId,
      p256dh: document.p256dh,
    });
  }

  public async delete(
    identityId: IdentityId,
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({
      _id: endpoint.valueOf(),
      identityId: identityId.valueOf(),
    });
  }

  public async deleteByEndpoint(
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({
      _id: endpoint.valueOf(),
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<PushSubscription[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        identityId: identityId.valueOf(),
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(subscription: PushSubscription): Promise<void> {
    const document = this.toDocument(subscription);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
