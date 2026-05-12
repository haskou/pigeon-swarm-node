import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import IdentityCreator from '@app/contexts/identities/application/create/IdentityCreator';
import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import Kernel from '@app/Kernel';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from 'chai';
import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import * as fsSync from 'fs';
import path from 'path';

setDefaultTimeout(20_000);

let kernel: Kernel | null = null;

type TestLogger = {
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
};

@binding()
export default class RegisterIdentityWhenPublishedDefinition {
  private identity: Identity | undefined;

  private cleanupStorageFolder(): void {
    const storagePath = process.env.IPFS_STORAGE_PATH;

    if (!storagePath) {
      return;
    }

    const resolvedStoragePath = path.resolve(Kernel.rootDirectory, storagePath);
    const allowedRoot = path.resolve(Kernel.rootDirectory, 'memory');

    if (
      resolvedStoragePath !== allowedRoot &&
      !resolvedStoragePath.startsWith(`${allowedRoot}${path.sep}`)
    ) {
      return;
    }

    if (fsSync.existsSync(resolvedStoragePath)) {
      fsSync.rmSync(resolvedStoragePath, { force: true, recursive: true });
    }
  }

  private resetMemoryBus(): void {
    MemoryMessageBusAdapter.memoryMessages = {};
    MemoryMessageBusAdapter.errorMemoryMessages = {};
  }

  private installTestLogger(): void {
    (
      Kernel as unknown as {
        _logs: TestLogger;
      }
    )._logs = {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    };
  }

  private async waitUntilQueueIsEmpty(queueName: string): Promise<void> {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const pendingMessages =
        MemoryMessageBusAdapter.memoryMessages[queueName]?.length || 0;

      if (pendingMessages === 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Queue ${queueName} was not consumed before timeout.`);
  }

  private async waitUntilIdentityIsRegistered(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    const deadline = Date.now() + 5000;
    const metadataRepository =
      Kernel.di.getService<MongoIdentityMetadataRepository>(
        MongoIdentityMetadataRepository,
      );
    const identityId = new IdentityId(this.identity.toPrimitives().id);

    while (Date.now() < deadline) {
      const consumerErrors =
        MemoryMessageBusAdapter.errorMemoryMessages[
          RegisterIdentityWhenPublished.QUEUE_NAME
        ] || [];

      if (consumerErrors.length > 0) {
        throw new Error(consumerErrors.join('\n'));
      }

      const metadata = await metadataRepository.findByIdentityId(identityId);

      if (metadata.length > 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Published identity was not registered before timeout.');
  }

  @before()
  public async startKernel(): Promise<void> {
    this.identity = undefined;
    this.resetMemoryBus();

    if (!kernel) {
      kernel = new Kernel();
      kernel.environmentVariables('test');
      this.cleanupStorageFolder();

      await kernel.dependencyInjection();
      this.installTestLogger();
    }
  }

  @after()
  public cleanup(): void {
    kernel?.removeConsumers();
    this.resetMemoryBus();
    this.cleanupStorageFolder();
  }

  @when('the register identity when published consumer is running')
  public async theConsumerIsRunning(): Promise<void> {
    if (!kernel) {
      throw new Error('Kernel is not initialized.');
    }

    kernel.removeConsumers();
    kernel.addConsumers(RegisterIdentityWhenPublished);
    await kernel.runConsumers();
  }

  @when('the identity publication is announced')
  public async theIdentityPublicationIsAnnounced(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    const messageBus = Kernel.di.getService<MessageBus>(MessageBus);

    await messageBus.publish([
      new IdentityWasCreatedEvent(this.identity.toPrimitives().id),
    ]);
  }

  @given('a real identity has been published in network {string}')
  public async aRealIdentityHasBeenCreated(networkName: string): Promise<void> {
    const networkId = '123e4567-e89b-12d3-a456-426614174001';
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const creator = Kernel.di.getService<IdentityCreator>(IdentityCreator);

    await ipfs.registerNetwork(new IPFSNetworkConfig(networkId, networkName));
    this.identity = await creator.create(
      new IdentityCreateMessage('alice', 'Super-secret-password!', [networkId]),
    );
  }

  @given('the local identity registration metadata is missing')
  public async theLocalIdentityRegistrationMetadataIsMissing(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const metadataRepository =
      Kernel.di.getService<MongoIdentityMetadataRepository>(
        MongoIdentityMetadataRepository,
      );
    const [externalIdentifier] = await ipfs.getRecordCandidates(
      `pigeon-swarm_identity-${this.identity.toPrimitives().id}`,
    );

    if (!externalIdentifier) {
      throw new Error('Identity external identifier was not published.');
    }

    await metadataRepository.deleteByExternalIdentifier(
      new IPFSId(externalIdentifier),
    );
  }

  @then('the published identity should be registered locally')
  public async thePublishedIdentityShouldBeRegisteredLocally(): Promise<void> {
    await this.waitUntilQueueIsEmpty(RegisterIdentityWhenPublished.QUEUE_NAME);
    await this.waitUntilIdentityIsRegistered();

    expect(this.identity).to.not.equal(undefined);
    expect(
      MemoryMessageBusAdapter.errorMemoryMessages[
        RegisterIdentityWhenPublished.QUEUE_NAME
      ] || [],
    ).to.deep.equal([]);
  }
}
