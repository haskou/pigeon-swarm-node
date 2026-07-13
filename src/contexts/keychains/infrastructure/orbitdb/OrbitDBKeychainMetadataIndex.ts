import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import KeychainMetadataIndex from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataIndex';
import { KeychainMetadataRecord } from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBKeychainMetadataDocument } from './documents/OrbitDBKeychainMetadataDocument';

export default class OrbitDBKeychainMetadataIndex extends KeychainMetadataIndex {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] | undefined {
    const value = document[attribute];

    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : undefined;
  }

  private ownerIdentityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id')
    );
  }

  private keychainFrom(
    document: Record<string, unknown>,
    ownerIdentityId: string,
  ): Keychain | undefined {
    const encryptedPayload = this.stringValue(document, 'encryptedPayload');
    const signature = this.stringValue(document, 'signature');
    const timestamp = this.numberValue(document, 'timestamp');

    if (!encryptedPayload || !signature || timestamp === undefined) {
      return undefined;
    }

    return Keychain.fromPrimitives({
      encryptedPayload,
      ownerIdentityId,
      previousKeychainExternalIdentifier: this.stringValue(
        document,
        'previousCid',
      ),
      signature,
      timestamp,
      version: this.numberValue(document, 'version') || 0,
    });
  }

  private toRecord(
    document: Record<string, unknown>,
  ): KeychainMetadataRecord | undefined {
    const cid = this.stringValue(document, 'cid');
    const ownerIdentityId = this.ownerIdentityIdFrom(document);

    if (!cid || !ownerIdentityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      keychain: this.keychainFrom(document, ownerIdentityId),
      networkIds: this.stringArrayValue(document, 'networkIds'),
      ownerIdentityId,
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
    };
  }

  private toStorageDocument(
    record: KeychainMetadataRecord,
  ): OrbitDBKeychainMetadataDocument {
    const primitives = record.keychain?.toPrimitives();

    return {
      cid: record.cid,
      encryptedPayload: primitives?.encryptedPayload,
      id: record.cid,
      networkIds: record.networkIds,
      ownerIdentityId: record.ownerIdentityId,
      previousCid:
        record.previousCid || primitives?.previousKeychainExternalIdentifier,
      receivedAt: record.receivedAt,
      signature: primitives?.signature,
      timestamp: primitives?.timestamp,
      version: record.version,
    };
  }

  private sortByFreshness(
    documents: KeychainMetadataRecord[],
  ): KeychainMetadataRecord[] {
    return [...documents].sort(
      (left, right) =>
        right.version - left.version || right.receivedAt - left.receivedAt,
    );
  }

  private ownerHeadKey(ownerIdentityId: string): string {
    return `keychain:${ownerIdentityId}`;
  }

  private cidHeadKey(cid: string): string {
    return `keychain-cid:${cid}`;
  }

  private async findHead(
    key: string,
  ): Promise<KeychainMetadataRecord | undefined> {
    const document = await this.registry.findHead(key);

    return document ? this.toRecord(document) : undefined;
  }

  private deduplicate(
    records: KeychainMetadataRecord[],
  ): KeychainMetadataRecord[] {
    const deduplicated = new Map<string, KeychainMetadataRecord>();

    for (const record of records) {
      deduplicated.set(`${record.ownerIdentityId}:${record.cid}`, record);
    }

    return [...deduplicated.values()];
  }

  private findCachedCidRecordsByOwner(
    ownerIdentityId: IdentityId,
  ): KeychainMetadataRecord[] {
    return this.registry
      .findCachedHeadsByPrefix('keychain-cid:')
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is KeychainMetadataRecord =>
          document !== undefined &&
          ownerIdentityId.isEqual(new IdentityId(document.ownerIdentityId)),
      );
  }

  private async putHeads(
    document: OrbitDBKeychainMetadataDocument,
  ): Promise<void> {
    await this.registry.putHead(this.ownerHeadKey(document.ownerIdentityId), {
      ...document,
    });
    await this.registry.putHead(this.cidHeadKey(document.cid), {
      ...document,
    });
  }

  public findAll(): Promise<KeychainMetadataRecord[]> {
    const records = [
      ...this.registry.findCachedHeadsByPrefix('keychain:'),
      ...this.registry.findCachedHeadsByPrefix('keychain-cid:'),
    ]
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is KeychainMetadataRecord =>
          document !== undefined,
      );

    return Promise.resolve(this.sortByFreshness(this.deduplicate(records)));
  }

  public async findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<KeychainMetadataRecord | undefined> {
    const cid = externalIdentifier.valueOf();
    const head = await this.findHead(this.cidHeadKey(cid));

    if (head) {
      return head;
    }

    return this.registry
      .findCachedHeadsByPrefix('keychain:')
      .map((document) => this.toRecord(document))
      .find((document) => document?.cid === cid);
  }

  public async findByOwnerIdentityId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainMetadataRecord[]> {
    const head = await this.findHead(
      this.ownerHeadKey(ownerIdentityId.valueOf()),
    );
    const cachedRecords = this.deduplicate([
      ...(head ? [head] : []),
      ...this.findCachedCidRecordsByOwner(ownerIdentityId),
    ]);

    return this.sortByFreshness(cachedRecords);
  }

  public async save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
    networkIds: NetworkId[] = [],
  ): Promise<void> {
    const primitives = keychain.toPrimitives();
    const document: OrbitDBKeychainMetadataDocument = {
      cid: externalIdentifier.valueOf(),
      encryptedPayload: primitives.encryptedPayload,
      id: externalIdentifier.valueOf(),
      networkIds: networkIds.map((networkId) => networkId.valueOf()),
      ownerIdentityId: primitives.ownerIdentityId,
      previousCid: primitives.previousKeychainExternalIdentifier,
      receivedAt: Date.now(),
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };

    await this.putHeads(document);
    await this.registry.putDocument('keychains', document);
  }

  public projectReplicatedDocument(document: Record<string, unknown>): void {
    const cid = this.stringValue(document, 'cid');
    const ownerIdentityId = this.ownerIdentityIdFrom(document);

    if (!cid || !ownerIdentityId) {
      return;
    }

    this.registry.cacheHeadLocally(
      this.ownerHeadKey(ownerIdentityId),
      document,
      this.stringArrayValue(document, 'networkIds') ?? [],
    );
  }
}
