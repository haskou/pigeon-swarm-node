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

  private toRecord(
    document: Record<string, unknown>,
  ): OrbitDBKeychainMetadataDocument | undefined {
    const cid = this.stringValue(document, 'cid');
    const ownerIdentityId =
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id');

    if (!cid || !ownerIdentityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      id: ownerIdentityId,
      ownerIdentityId,
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
    };
  }

  private async findDocuments(
    matcher: (document: OrbitDBKeychainMetadataDocument) => boolean,
  ): Promise<OrbitDBKeychainMetadataDocument[]> {
    const documents = await this.registry.queryDocuments(
      'keychains',
      (document) => {
        const record = this.toRecord(document);

        return record ? matcher(record) : false;
      },
    );

    return documents
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is OrbitDBKeychainMetadataDocument =>
          document !== undefined,
      )
      .sort(
        (left, right) =>
          right.version - left.version || right.receivedAt - left.receivedAt,
      );
  }

  public async findAll(): Promise<KeychainMetadataRecord[]> {
    return this.findDocuments(() => true);
  }

  public async findByOwnerIdentityId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainMetadataRecord[]> {
    return this.findDocuments((document) =>
      new IdentityId(document.ownerIdentityId).isEqual(ownerIdentityId),
    );
  }

  public async save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<void> {
    const primitives = keychain.toPrimitives();

    await this.registry.putDocument('keychains', {
      cid: externalIdentifier.valueOf(),
      id: primitives.ownerIdentityId,
      ownerIdentityId: primitives.ownerIdentityId,
      previousCid: primitives.previousKeychainExternalIdentifier,
      receivedAt: Date.now(),
      version: primitives.version,
    });
  }
}
