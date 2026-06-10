import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityMetadataRepository from '@app/contexts/identities/domain/repositories/IdentityMetadataRepository';
import { IdentityMetadataRecord } from '@app/contexts/identities/domain/repositories/types/IdentityMetadataRecord';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBIdentityMetadataDocument } from './documents/OrbitDBIdentityMetadataDocument';

// eslint-disable-next-line max-len
export default class OrbitDBIdentityMetadataRepository extends IdentityMetadataRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
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

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'identityId') ||
      this.stringValue(document, 'id')
    );
  }

  private networkIdsFrom(
    document: Record<string, unknown>,
  ): string[] | undefined {
    const networkId = this.stringValue(document, 'networkId');

    if (this.isStringArray(document.networkIds)) {
      return document.networkIds;
    }

    return networkId ? [networkId] : undefined;
  }

  private toRecord(
    document: Record<string, unknown>,
  ): OrbitDBIdentityMetadataDocument | undefined {
    const cid = this.stringValue(document, 'cid');
    const identityId = this.identityIdFrom(document);

    if (!cid || !identityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      handle: this.stringValue(document, 'handle'),
      id: identityId,
      identityId,
      networkId: this.stringValue(document, 'networkId'),
      networkIds: this.networkIdsFrom(document),
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
    };
  }

  private async findDocuments(
    matcher: (document: OrbitDBIdentityMetadataDocument) => boolean,
  ): Promise<OrbitDBIdentityMetadataDocument[]> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) => {
        const record = this.toRecord(document);

        return record ? matcher(record) : false;
      },
    );

    return documents
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is OrbitDBIdentityMetadataDocument =>
          document !== undefined,
      )
      .sort(
        (left, right) =>
          right.version - left.version || right.receivedAt - left.receivedAt,
      );
  }

  public async findAll(): Promise<IdentityMetadataRecord[]> {
    return this.findDocuments(() => true);
  }

  public async findByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityMetadataRecord[]> {
    return this.findDocuments(
      (document) => document.handle === handle.valueOf(),
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    return this.findDocuments((document) =>
      new IdentityId(document.identityId).isEqual(identityId),
    );
  }

  public async findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.networkIds?.includes(networkId.valueOf()) ||
        document.networkId === networkId.valueOf(),
    );
    const latestDocuments = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      if (!latestDocuments.has(document.identityId)) {
        latestDocuments.set(document.identityId, document);
      }
    }

    return [...latestDocuments.values()];
  }

  public async save(
    identity: Identity,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const primitives = identity.toPrimitives();

    await this.registry.putDocument('identities', {
      cid: externalIdentifier.valueOf(),
      handle: primitives.profile.handle,
      id: primitives.id,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      receivedAt: Date.now(),
      version: primitives.version,
    });
  }

  public async deleteByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const documents = await this.findDocuments(
      (document) => document.cid === externalIdentifier.valueOf(),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('identities', {
          ...document,
          deleted: true,
        }),
      ),
    );
  }
}
