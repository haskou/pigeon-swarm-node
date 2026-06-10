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

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence | undefined> {
    const [document] = await this.registry.queryDocuments(
      'presence',
      (candidate) => candidate.id === identityId.valueOf(),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    const identityIdValues = identityIds.map((identityId) =>
      identityId.valueOf(),
    );
    const documents = await this.registry.queryDocuments(
      'presence',
      (document) => identityIdValues.includes(String(document.id)),
    );

    return documents
      .filter((document): document is OrbitDBIdentityPresenceDocument =>
        this.isDocument(document),
      )
      .map((document) => this.toDomain(document));
  }

  public async findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]> {
    const documents = await this.registry.queryDocuments(
      'presence',
      (document) =>
        (typeof document.lastHeartbeatAt === 'number' &&
          document.lastHeartbeatAt <= threshold.valueOf()) ||
        ['available', 'away'].includes(String(document.status)),
    );

    return documents
      .filter((document): document is OrbitDBIdentityPresenceDocument =>
        this.isDocument(document),
      )
      .map((document) => this.toDomain(document));
  }

  public async save(presence: IdentityPresence): Promise<void> {
    await this.registry.putDocument('presence', this.toDocument(presence));
  }
}
