import * as fsSync from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

import { PrivateKey, UUID } from '@haskou/value-objects';

import { HeliaIPFSParser } from '../../../src/contexts/shared/infrastructure/ipfs/helia/HeliaIPFSParser';
import { IPFSId } from '../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetworkConfig } from '../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Kernel } from '@haskou/ddd-kernel';

type IdentityResponseShape = {
  id?: string;
};

type ExternalIdentifierResponseShape = {
  keychainExternalIdentifier?: string;
};

export default class IPFSDefinition {
  private static scenarioCount: number = 0;

  private static readonly IDENTITY_ROUTING_KEY_PREFIX =
    'pigeon-swarm_identity-';

  private static readonly TEST_STORAGE_ROOT = path.join(
    Kernel.rootDirectory,
    'memory',
  );

  private storedIPFSCid: string | undefined;
  private scenarioSuffix: string = '';
  private readonly ipfsNetworkIdAliases: Record<string, string> = {};
  private registeredNetworkIds: string[] = [];

  private static nextScenarioSuffix(): string {
    IPFSDefinition.scenarioCount += 1;

    return `${IPFSDefinition.scenarioCount}`;
  }

  private resolveRegisteredIPFSNetworkId(networkAlias: string): string {
    const networkId = this.ipfsNetworkIdAliases[networkAlias];

    if (!networkId) {
      throw new Error(
        `IPFS network alias "${networkAlias}" is not registered in this scenario`,
      );
    }

    return networkId;
  }

  private extractIdentityId(responseData: unknown): string | undefined {
    if (typeof responseData !== 'object' || responseData === null) {
      return undefined;
    }

    return (responseData as IdentityResponseShape).id;
  }

  private isInMemoryStorageLocation(storagePath: string): boolean {
    return HeliaIPFSParser.isInMemoryStorageLocation(storagePath);
  }

  private getMemoryStorageRoot(): string {
    return path.resolve(IPFSDefinition.TEST_STORAGE_ROOT);
  }

  private resolveInMemoryCleanupPath(storagePath: string): string | undefined {
    const memoryRoot = this.getMemoryStorageRoot();

    if (storagePath === 'memory') {
      return memoryRoot;
    }

    const relativePath = storagePath.replace(/^memory\//, '');
    const resolvedPath = path.resolve(memoryRoot, relativePath);

    if (
      resolvedPath === memoryRoot ||
      resolvedPath.startsWith(`${memoryRoot}${path.sep}`)
    ) {
      return resolvedPath;
    }

    return undefined;
  }

  private isWhitelistedTestStorageLocation(storagePath: string): boolean {
    const resolvedStoragePath = path.resolve(storagePath);
    const resolvedWhitelistRoot = path.resolve(
      IPFSDefinition.TEST_STORAGE_ROOT,
    );

    return (
      resolvedStoragePath === resolvedWhitelistRoot ||
      resolvedStoragePath.startsWith(`${resolvedWhitelistRoot}${path.sep}`)
    );
  }

  public resetScenarioState(): void {
    this.storedIPFSCid = undefined;
    this.scenarioSuffix = IPFSDefinition.nextScenarioSuffix();
    this.registeredNetworkIds = [];

    Object.keys(this.ipfsNetworkIdAliases).forEach((alias) => {
      delete this.ipfsNetworkIdAliases[alias];
    });
  }

  public cleanupStorageFolder(storagePath?: string): void {
    if (!storagePath) {
      return;
    }

    if (this.isInMemoryStorageLocation(storagePath)) {
      const inMemoryCleanupPath = this.resolveInMemoryCleanupPath(storagePath);

      if (inMemoryCleanupPath && fsSync.existsSync(inMemoryCleanupPath)) {
        fsSync.rmSync(inMemoryCleanupPath, {
          force: true,
          recursive: true,
        });
      }

      return;
    }

    if (!this.isWhitelistedTestStorageLocation(storagePath)) {
      return;
    }

    if (fsSync.existsSync(storagePath)) {
      fsSync.rmSync(storagePath, {
        force: true,
        recursive: true,
      });
    }
  }

  private generateNetworkKey(): PrivateKey {
    const { privateKey } = generateKeyPairSync('ed25519');

    return new PrivateKey(
      privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    );
  }

  private shouldUseRealPrivateIPFS(): boolean {
    return process.env.PIGEON_API_TEST_REAL_IPFS === 'true';
  }

  private createNetworkConfig(
    networkId: string,
    networkName: string,
  ): IPFSNetworkConfig {
    return new IPFSNetworkConfig(
      networkId,
      networkName,
      this.shouldUseRealPrivateIPFS() ? this.generateNetworkKey() : undefined,
    );
  }

  public async registerTestNetwork(networkAlias: string): Promise<string> {
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const scenarioNetworkName = `${networkAlias}-${this.scenarioSuffix}`;
    const networkId = UUID.generate().toString();
    const networkConfig = this.createNetworkConfig(
      networkId,
      scenarioNetworkName,
    );

    await ipfs.registerNetwork(networkConfig);
    this.ipfsNetworkIdAliases[networkAlias] = networkId;
    this.registeredNetworkIds.push(networkId);

    return networkId;
  }

  public async registerTestNetworkWithId(
    networkId: string,
    networkName: string,
  ): Promise<string> {
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const scenarioNetworkName = `${networkName}-${this.scenarioSuffix}`;
    const networkConfig = this.createNetworkConfig(
      networkId,
      scenarioNetworkName,
    );

    await ipfs.registerNetwork(networkConfig);
    this.ipfsNetworkIdAliases[networkName] = networkId;
    this.registeredNetworkIds.push(networkId);

    return networkId;
  }

  public async storeJSONInNetwork(
    networkAlias: string,
    body: string,
  ): Promise<void> {
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const cid = await ipfs.addJSON(
      JSON.parse(body),
      this.resolveRegisteredIPFSNetworkId(networkAlias),
    );

    this.storedIPFSCid = cid.valueOf();
  }

  public async assertCreatedCID(expectedCid: string): Promise<void> {
    if (!this.storedIPFSCid) {
      throw new Error('No stored IPFS CID found in scenario context');
    }

    if (this.storedIPFSCid !== expectedCid) {
      throw new Error(
        `Stored CID mismatch. Expected: ${expectedCid}, Actual: ${this.storedIPFSCid}`,
      );
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const exists = await ipfs.stat(new IPFSId(expectedCid));

    if (!exists) {
      throw new Error(
        `CID ${expectedCid} was not found in registered networks`,
      );
    }
  }

  public async assertPinnedInIPFS(responseData: unknown): Promise<void> {
    const identityId = this.extractIdentityId(responseData);

    if (!identityId) {
      throw new Error(
        'Response does not contain an identity id to verify pinning',
      );
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const routingKey = `${IPFSDefinition.IDENTITY_ROUTING_KEY_PREFIX}${identityId}`;
    const cid = await ipfs.getRecord(routingKey);

    if (!cid) {
      throw new Error(`No routing record found for identity id ${identityId}`);
    }

    const exists = await ipfs.stat(new IPFSId(cid));

    if (!exists) {
      throw new Error(
        `Routing record exists for identity id ${identityId} but CID ${cid} is not available`,
      );
    }
  }

  public async assertKeychainExternalIdentifierExists(
    responseData: unknown,
  ): Promise<void> {
    if (typeof responseData !== 'object' || responseData === null) {
      throw new Error(
        'Response does not contain a keychain external identifier',
      );
    }

    const externalIdentifier = (responseData as ExternalIdentifierResponseShape)
      .keychainExternalIdentifier;

    if (!externalIdentifier) {
      throw new Error(
        'Response does not contain a keychain external identifier',
      );
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const exists = await ipfs.stat(new IPFSId(externalIdentifier));

    if (!exists) {
      throw new Error(
        `Keychain external identifier ${externalIdentifier} is not available`,
      );
    }
  }

  public async assertNothingPinnedInIPFS(responseData: unknown): Promise<void> {
    if (this.storedIPFSCid) {
      throw new Error(
        `Expected no pinned data in scenario but found CID ${this.storedIPFSCid}`,
      );
    }

    const identityId = this.extractIdentityId(responseData);

    if (!identityId) {
      return;
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const routingKey = `${IPFSDefinition.IDENTITY_ROUTING_KEY_PREFIX}${identityId}`;
    const cid = await ipfs.getRecord(routingKey);

    if (cid) {
      throw new Error(
        `Expected no pinned data for identity id ${identityId}, but found CID ${cid}`,
      );
    }
  }

  public async cleanupRegisteredNetworks(): Promise<void> {
    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const networkRegistry =
      Kernel.di.getService<IPFSNetworkRegistry>(IPFSNetworkRegistry);
    const networkIds = [
      ...new Set([
        ...this.registeredNetworkIds,
        ...networkRegistry.getAll().map((network) => network.getId()),
      ]),
    ];

    for (const networkId of networkIds) {
      await ipfs.removeNetwork(networkId);
    }
  }
}
