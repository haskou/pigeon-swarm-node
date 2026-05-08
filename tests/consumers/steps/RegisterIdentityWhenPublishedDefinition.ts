import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import IdentityCreator from '@app/contexts/identities/application/create/IdentityCreator';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import Kernel from '@app/Kernel';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import { setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from 'chai';
import { after, before, binding, given, then } from 'cucumber-tsflow';
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

  @given('the register identity when published consumer is running')
  public async theConsumerIsRunning(): Promise<void> {
    if (!kernel) {
      throw new Error('Kernel is not initialized.');
    }

    kernel.removeConsumers();
    kernel.addConsumers(RegisterIdentityWhenPublished);
    await kernel.runConsumers();
  }

  @given('a real identity has been created in network {string}')
  public async aRealIdentityHasBeenCreated(networkName: string): Promise<void> {
    const networkId = '123e4567-e89b-12d3-a456-426614174001';
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const creator = Kernel.di.getService<IdentityCreator>(IdentityCreator);

    await ipfs.registerNetwork(new IPFSNetworkConfig(networkId, networkName));
    this.identity = await creator.create(
      new IdentityCreateMessage('alice', 'super-secret-password', [networkId]),
    );
  }

  @then(
    'the register identity when published consumer should finish successfully',
  )
  public async theConsumerShouldFinishSuccessfully(): Promise<void> {
    await this.waitUntilQueueIsEmpty(RegisterIdentityWhenPublished.QUEUE_NAME);

    expect(this.identity).to.not.equal(undefined);
    expect(
      MemoryMessageBusAdapter.errorMemoryMessages[
        RegisterIdentityWhenPublished.QUEUE_NAME
      ] || [],
    ).to.deep.equal([]);
  }
}
