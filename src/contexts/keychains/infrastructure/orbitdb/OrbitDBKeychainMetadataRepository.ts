import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainMetadataRepository from '@app/contexts/keychains/domain/repositories/KeychainMetadataRepository';
import { KeychainMetadataRecord } from '@app/contexts/keychains/domain/repositories/types/KeychainMetadataRecord';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBKeychainMetadataDocument } from './documents/OrbitDBKeychainMetadataDocument';

// eslint-disable-next-line max-len
export default class OrbitDBKeychainMetadataRepository extends KeychainMetadataRepository {
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
    const ownerIdentityId =
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id');

    if (!cid || !ownerIdentityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      keychain: this.keychainFrom(document, ownerIdentityId),
      ownerIdentityId,
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
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

  private async putHead(
    document: OrbitDBKeychainMetadataDocument,
  ): Promise<void> {
    await Promise.all([
      this.registry.putHead(this.ownerHeadKey(document.ownerIdentityId), {
        ...document,
      }),
      this.registry.putHead(this.cidHeadKey(document.cid), { ...document }),
    ]);
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
    const records = this.deduplicate([
      ...(head ? [head] : []),
      ...this.findCachedCidRecordsByOwner(ownerIdentityId),
    ]);

    return this.sortByFreshness(records);
  }

  public async save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<void> {
    const primitives = keychain.toPrimitives();
    const document: OrbitDBKeychainMetadataDocument = {
      cid: externalIdentifier.valueOf(),
      encryptedPayload: primitives.encryptedPayload,
      id: externalIdentifier.valueOf(),
      ownerIdentityId: primitives.ownerIdentityId,
      previousCid: primitives.previousKeychainExternalIdentifier,
      receivedAt: Date.now(),
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };

    await this.registry.putDocument('keychains', document);
    await this.putHead(document);
  }
}
