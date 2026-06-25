import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import IdentityMetadataIndex from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import Kernel from '@haskou/ddd-kernel';
import { setDefaultTimeout } from '@cucumber/cucumber';
import { KeyPair } from '@haskou/value-objects';
import { expect } from 'chai';
import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import * as fsSync from 'fs';
import path from 'path';

setDefaultTimeout(20_000);

let kernel: Kernel | null = null;

type TestLogger = {
  debug(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
};

@binding()
export default class RegisterIdentityWhenPublishedDefinition {
  private consumer: RegisterIdentityWhenPublished | undefined;

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

  private installTestLogger(): void {
    (
      Kernel as unknown as {
        _logs: TestLogger;
      }
    )._logs = {
      debug: () => undefined,
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    };
  }

  private async waitUntilIdentityIsRegistered(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    const deadline = Date.now() + 5000;
    const metadataIndex =
      Kernel.di.getService<IdentityMetadataIndex>(IdentityMetadataIndex);
    const identityId = new IdentityId(this.identity.toPrimitives().id);

    while (Date.now() < deadline) {
      const metadata = await metadataIndex.findByIdentityId(identityId);

      if (metadata.length > 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Published identity was not registered before timeout.');
  }

  @before()
  public async startKernel(): Promise<void> {
    this.consumer = undefined;
    this.identity = undefined;

    if (!kernel) {
      kernel = new Kernel();
      kernel.environmentVariables('test');
      this.cleanupStorageFolder();

      await kernel.dependencyInjection();
      this.installTestLogger();
      await kernel.runRuntimes(OrbitDBReplicatedStateRuntime);
    }
  }

  @after()
  public cleanup(): void {
    kernel?.removeConsumers();
    this.cleanupStorageFolder();
  }

  @when('the register identity when published consumer is running')
  public async theConsumerIsRunning(): Promise<void> {
    if (!kernel) {
      throw new Error('Kernel is not initialized.');
    }

    this.consumer = Kernel.di.getService<RegisterIdentityWhenPublished>(
      RegisterIdentityWhenPublished,
    );
  }

  @when('the identity publication is announced')
  public async theIdentityPublicationIsAnnounced(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    if (!this.consumer) {
      throw new Error('Register identity consumer is not initialized.');
    }

    await this.consumer.handler(
      new IdentityWasCreatedEvent(this.identity.toPrimitives().id),
    );
  }

  @given('a real identity has been published in network {string}')
  public async aRealIdentityHasBeenCreated(networkName: string): Promise<void> {
    const networkId = '123e4567-e89b-12d3-a456-426614174001';
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const publisher =
      Kernel.di.getService<IdentityPublisher>(IdentityPublisher);
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(
      'Super-secret-password1!',
    );
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const previousIdentityExternalIdentifier: string | undefined = undefined;
    const profile: {
      banner: string | undefined;
      biography: string | undefined;
      handle: string;
      name: string;
      picture: string | undefined;
    } = {
      banner: undefined,
      biography: undefined,
      handle: 'alice',
      name: 'alice',
      picture: undefined,
    };
    const signaturePayload = {
      encryptedKeyPair: encryptedKeyPair.toPrimitives(),
      encryptedMasterKey: 'v1.test.encrypted-master-key',
      id: identityId.valueOf(),
      masterKeyDerivation: {
        passkeyPrf: {
          algorithm: 'webauthn-prf',
          credentialId: 'test-credential-id',
          salt: 'test-salt',
          version: 1,
        },
      },
      networks: [networkId],
      previousIdentityExternalIdentifier,
      profile,
      timestamp: 1773848829055,
      version: 1,
    };

    await ipfs.registerNetwork(new IPFSNetworkConfig(networkId, networkName));
    this.identity = await publisher.publish(
      new IdentityPublishMessage({
        ...signaturePayload,
        signature: keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
      }),
    );
  }

  @given('the local identity registration metadata is missing')
  public async theLocalIdentityRegistrationMetadataIsMissing(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity is not initialized.');
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const metadataIndex =
      Kernel.di.getService<IdentityMetadataIndex>(IdentityMetadataIndex);
    const [externalIdentifier] = await ipfs.getRecordCandidates(
      `pigeon-swarm_identity-${this.identity.toPrimitives().id}`,
    );

    if (!externalIdentifier) {
      throw new Error('Identity external identifier was not published.');
    }

    await metadataIndex.deleteByExternalIdentifier(
      new IdentityExternalIdentifier(externalIdentifier),
    );
  }

  @then('the published identity should be registered locally')
  public async thePublishedIdentityShouldBeRegisteredLocally(): Promise<void> {
    await this.waitUntilIdentityIsRegistered();

    expect(this.identity).to.not.equal(undefined);
  }
}
