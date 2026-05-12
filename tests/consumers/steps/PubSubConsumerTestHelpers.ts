import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import { KeyPair } from '@haskou/value-objects';

export type UseCaseCall = {
  message: unknown;
  method: string;
};

export class FakeEventConsumer implements DomainEventConsumer {
  public async consume(): Promise<void> {
    return;
  }
}

export class FakeSuppressionTracker {
  public available: Array<{
    aggregateId: string;
    requestId: string | undefined;
    type: string;
  }> = [];

  public markAvailable(
    type: string,
    aggregateId: string,
    requestId?: string,
  ): void {
    this.available.push({ aggregateId, requestId, type });
  }
}

export abstract class PubSubConsumerTestContext {
  protected readonly externalIdentifier =
    'bafybeigdyrztomockexternalidentifier';

  protected readonly requestId = 'request-1';

  protected calls: UseCaseCall[] = [];
  protected identityId: IdentityId | undefined;
  protected suppressionTracker = new FakeSuppressionTracker();

  protected eventConsumer(): DomainEventConsumer {
    return new FakeEventConsumer();
  }

  protected fakeUseCase<T>(method: string): T {
    return {
      [method]: async (message: unknown): Promise<void> => {
        this.calls.push({ message, method });
      },
    } as T;
  }

  protected lastMessage<T>(): T {
    const call = this.calls.at(-1);

    if (!call) {
      throw new Error('Expected a use case call.');
    }

    return call.message as T;
  }

  protected ownerIdentityId(): string {
    if (!this.identityId) {
      throw new Error('Identity id is not initialized.');
    }

    return this.identityId.valueOf();
  }

  public async resetConsumerTestContext(): Promise<void> {
    const keyPair = await KeyPair.generate();

    this.calls = [];
    this.identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    this.suppressionTracker = new FakeSuppressionTracker();
  }
}
