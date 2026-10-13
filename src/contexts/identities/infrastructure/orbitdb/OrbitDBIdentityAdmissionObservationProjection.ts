import IdentityAdmissionObserver from '@app/contexts/identities/application/observe-admission/IdentityAdmissionObserver';
import { IdentityAdmissionObservationMessage } from '@app/contexts/identities/application/observe-admission/messages/IdentityAdmissionObservationMessage';
import { IdentityPrimitivesShape } from '@app/contexts/identities/domain/IdentityPrimitivesShape';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import OrbitDBIdentityMetadataIndex from './OrbitDBIdentityMetadataIndex';

/**
 * Feeds identity versions replicating in from other nodes to the admission
 * observer, so this node prices its own admissions from the network-wide rate.
 */
export default class OrbitDBIdentityAdmissionObservationProjection {
  private startPromise?: Promise<void>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly metadataIndex: OrbitDBIdentityMetadataIndex,
    private readonly observer: IdentityAdmissionObserver,
  ) {}

  /**
   * Checks the signed time before any signature or cid work: replayed history
   * and the startup bootstrap are stale, so they cost one comparison each.
   */
  private isFreshDocument(document: Record<string, unknown>): boolean {
    const { identity } = document;

    if (!IdentityPrimitivesShape.isIdentityPrimitives(identity)) return false;

    try {
      return IdentityAdmissionDifficulty.isFreshAdmission(
        new Timestamp(identity.timestamp),
        Timestamp.now(),
      );
    } catch {
      return false;
    }
  }

  private async observe(document: Record<string, unknown>): Promise<void> {
    if (!this.isFreshDocument(document)) return;

    const record = await this.metadataIndex.verifiedRecordOf(document);

    if (!record) return;

    const previous = record.previousCid
      ? this.metadataIndex.findRetainedVersion(
          new IdentityId(record.identityId),
          new IdentityExternalIdentifier(record.previousCid),
        )?.identity
      : undefined;

    await this.observer.observe(
      new IdentityAdmissionObservationMessage(
        record.identity,
        record.cid,
        record.networkIds.filter((networkId) =>
          this.registry.hostsNetwork(networkId),
        ),
        previous,
      ),
    );
  }

  public async start(): Promise<void> {
    this.startPromise ??= this.registry.onDocumentUpdated(
      'identities',
      (document) => this.observe(document),
    );

    await this.startPromise;
  }
}
