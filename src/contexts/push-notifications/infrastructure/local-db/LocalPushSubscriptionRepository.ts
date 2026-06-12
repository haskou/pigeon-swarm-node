import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { PushSubscription } from '../../domain/PushSubscription';
import PushSubscriptionRepository from '../../domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionEndpoint } from '../../domain/value-objects/PushSubscriptionEndpoint';
import { LocalPushSubscriptionDocument } from './documents/LocalPushSubscriptionDocument';

// eslint-disable-next-line max-len
export default class LocalPushSubscriptionRepository extends PushSubscriptionRepository {
  private static readonly NAMESPACE = 'push_subscriptions';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private toDocument(
    subscription: PushSubscription,
  ): LocalPushSubscriptionDocument {
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

  private toDomain(document: LocalPushSubscriptionDocument): PushSubscription {
    return PushSubscription.fromPrimitives({
      auth: document.auth,
      createdAt: document.createdAt,
      endpoint: document.endpoint,
      expirationTime: document.expirationTime,
      identityId: document.identityId,
      p256dh: document.p256dh,
    });
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalPushSubscriptionDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.auth === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.endpoint === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.p256dh === 'string' &&
      (document.expirationTime === undefined ||
        typeof document.expirationTime === 'number')
    );
  }

  private async removeInvalidDocument(
    document: Record<string, unknown>,
  ): Promise<void> {
    if (typeof document._id === 'string') {
      await this.database.delete(
        LocalPushSubscriptionRepository.NAMESPACE,
        document._id,
      );
    }
  }

  private async hydrateValidDocuments(
    documents: Array<Record<string, unknown>>,
  ): Promise<PushSubscription[]> {
    const subscriptions: PushSubscription[] = [];

    for (const document of documents) {
      if (!this.isDocument(document)) {
        await this.removeInvalidDocument(document);
        continue;
      }

      try {
        subscriptions.push(this.toDomain(document));
      } catch {
        await this.removeInvalidDocument(document);
      }
    }

    return subscriptions;
  }

  public async delete(
    identityId: IdentityId,
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void> {
    const document = await this.database.findOne(
      LocalPushSubscriptionRepository.NAMESPACE,
      endpoint.valueOf(),
    );

    if (document?.identityId === identityId.valueOf()) {
      await this.database.delete(
        LocalPushSubscriptionRepository.NAMESPACE,
        endpoint.valueOf(),
      );
    }
  }

  public async deleteByEndpoint(
    endpoint: PushSubscriptionEndpoint,
  ): Promise<void> {
    await this.database.delete(
      LocalPushSubscriptionRepository.NAMESPACE,
      endpoint.valueOf(),
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<PushSubscription[]> {
    const documents = await this.database.find(
      LocalPushSubscriptionRepository.NAMESPACE,
      (document) => document.identityId === identityId.valueOf(),
    );

    return this.hydrateValidDocuments(documents);
  }

  public async save(subscription: PushSubscription): Promise<void> {
    const document = this.toDocument(subscription);

    await this.database.save(
      LocalPushSubscriptionRepository.NAMESPACE,
      document._id,
      document,
    );
  }
}
