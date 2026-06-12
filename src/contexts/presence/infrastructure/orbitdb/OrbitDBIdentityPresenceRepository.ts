import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { PresenceStatus } from '../../domain/value-objects/PresenceStatus';
import { OrbitDBIdentityPresenceDocument } from './documents/OrbitDBIdentityPresenceDocument';

// eslint-disable-next-line max-len
export default class OrbitDBIdentityPresenceRepository extends IdentityPresenceRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private hasRequiredPresenceFields(
    document: Record<string, unknown>,
  ): boolean {
    return (
      typeof document.id === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.status === 'string' &&
      typeof document.updatedAt === 'number'
    );
  }

  private hasOptionalPresenceFields(
    document: Record<string, unknown>,
  ): boolean {
    return (
      (document.customMessage === undefined ||
        typeof document.customMessage === 'string') &&
      (document.lastActivityAt === undefined ||
        typeof document.lastActivityAt === 'number') &&
      (document.lastHeartbeatAt === undefined ||
        typeof document.lastHeartbeatAt === 'number')
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBIdentityPresenceDocument {
    return (
      this.hasRequiredPresenceFields(document) &&
      this.hasOptionalPresenceFields(document)
    );
  }

  private toDocument(
    presence: IdentityPresence,
  ): OrbitDBIdentityPresenceDocument {
    const primitives = presence.toPrimitives();

    return {
      customMessage: primitives.customMessage,
      id: primitives.identityId,
      identityId: primitives.identityId,
      lastActivityAt: primitives.lastActivityAt,
      lastHeartbeatAt: primitives.lastHeartbeatAt,
      status: primitives.status,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(
    document: OrbitDBIdentityPresenceDocument,
  ): IdentityPresence {
    return IdentityPresence.fromPrimitives({
      customMessage: document.customMessage,
      identityId: document.identityId,
      lastActivityAt: document.lastActivityAt,
      lastHeartbeatAt: document.lastHeartbeatAt,
      status: PresenceStatus.fromPrimitives(document.status).valueOf(),
      updatedAt: document.updatedAt,
    });
  }

  private headKey(identityId: string): string {
    return `presence:${identityId}`;
  }

  private async findHead(
    identityId: IdentityId,
  ): Promise<OrbitDBIdentityPresenceDocument | undefined> {
    const document = await this.registry.findHead(
      this.headKey(identityId.valueOf()),
    );

    return document && this.isDocument(document) ? document : undefined;
  }

  private async putHead(
    document: OrbitDBIdentityPresenceDocument,
    networkIds: string[] = [],
  ): Promise<void> {
    await this.registry.putHead(
      this.headKey(document.identityId),
      { ...document },
      networkIds,
    );
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence | undefined> {
    const head = await this.findHead(identityId);

    if (head) {
      return this.toDomain(head);
    }

    return undefined;
  }

  public async findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    const headDocuments = await Promise.all(
      identityIds.map((identityId) => this.findHead(identityId)),
    );
    const presences = headDocuments
      .filter(
        (document): document is OrbitDBIdentityPresenceDocument =>
          document !== undefined,
      )
      .map((document) => this.toDomain(document));
    const existingIdentityIds = new Set(
      presences.map((presence) => presence.getIdentityId().valueOf()),
    );
    const missingIdentityIds = identityIds.filter(
      (identityId) => !existingIdentityIds.has(identityId.valueOf()),
    );

    if (missingIdentityIds.length === 0) {
      return presences;
    }

    void missingIdentityIds;

    return presences;
  }

  public findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]> {
    const documents = this.registry.findCachedHeadsByPrefix('presence:');

    return Promise.resolve(
      documents
        .filter(
          (document): document is OrbitDBIdentityPresenceDocument =>
            this.isDocument(document) &&
            ((typeof document.lastHeartbeatAt === 'number' &&
              document.lastHeartbeatAt <= threshold.valueOf()) ||
              ['available', 'away'].includes(String(document.status))),
        )
        .map((document) => this.toDomain(document)),
    );
  }

  public async save(
    presence: IdentityPresence,
    networkIds: string[] = [],
  ): Promise<void> {
    const document = this.toDocument(presence);

    await this.registry.putDocument('presence', document, networkIds);
    await this.putHead(document, networkIds);
  }
}
