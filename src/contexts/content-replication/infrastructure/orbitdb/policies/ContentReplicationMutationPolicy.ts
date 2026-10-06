import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import PublicMutationVerifier, {
  PublicMutationExpectation,
} from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { maxContentSizeBytes } from '../../../application/publish-content/ContentUploadLimits';
import { ContentReplication } from '../../../domain/ContentReplication';
import { ContentReplicationLimits } from '../../../domain/ContentReplicationLimits';
import { ContentReplicationContext } from '../../../domain/value-objects/ContentReplicationContext';

/**
 * A replication registration is a request by its owner that the network hold a
 * CID for them. It is only honoured inside the owner's own networks, within a
 * per-identity budget, and only the owner can withdraw it.
 */
export default class ContentReplicationMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'cid', 'networkId', 'ownerIdentityId'],
    ['sizeBytes'],
    'content_replication',
    { putStrings: ['context'] },
  );

  /** Proofs already verified while counting a budget, keyed by their digest. */
  private readonly verifiedDigests = new Set<string>();

  public readonly collection = 'contentReplication';

  public limits = ContentReplicationLimits.fromEnvironment();

  public readonly scopeType = 'content_replication';

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly identityRepository: IdentityRepository,
    private readonly verifier: PublicMutationVerifier,
  ) {
    super();
  }

  private assertBounds(record: Record<string, unknown>): void {
    const sizeBytes = record.sizeBytes as number;

    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > maxContentSizeBytes ||
      !ContentReplicationContext.isKnown(record.context as string)
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private async assertOwnNetwork(
    record: Record<string, unknown>,
  ): Promise<void> {
    try {
      const identity = await this.identityRepository.findById(
        new IdentityId(record.ownerIdentityId as string),
      );

      if (
        identity
          .getNetworkIds()
          .some((networkId) => networkId.valueOf() === record.networkId)
      ) {
        return;
      }
    } catch {
      // An unknown owner is indistinguishable from a forged one.
    }

    throw new InvalidPublicMutationError();
  }

  private async isGenuine(record: Record<string, unknown>): Promise<boolean> {
    const proof = PublicMutationRecord.proofOf(record);

    if (!proof || record.removed === true) return false;

    try {
      const expectation = this.expectationOf(record);

      if (this.verifiedDigests.has(proof.digest())) return true;

      await this.verifier.verify(proof, {
        ...expectation,
        payload: PublicMutationRecord.payloadOf(record),
      });
      this.verifiedDigests.add(proof.digest());

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Admission depends only on the set of the owner's genuine records, ordered
   * by id, so every node reaches the same verdict whatever order they arrived in.
   */
  private async assertWithinBudget(
    record: Record<string, unknown>,
  ): Promise<void> {
    const owner = record.ownerIdentityId;
    const stored = await this.registry.queryUnadmittedDocuments(
      this.collection,
      (document) =>
        document.ownerIdentityId === owner &&
        document.networkId === record.networkId &&
        document.id !== record.id,
      [record.networkId as string],
    );
    const genuine = (
      await Promise.all(
        stored.map(async (document) =>
          (await this.isGenuine(document)) ? document : undefined,
        ),
      )
    ).filter((document): document is Record<string, unknown> => !!document);
    const earlier = genuine.filter(
      (document) => (document.id as string) < (record.id as string),
    );
    const usedBytes = earlier.reduce(
      (total, document) => total + (document.sizeBytes as number),
      0,
    );

    if (
      earlier.length >= this.limits.maxRecords ||
      usedBytes + (record.sizeBytes as number) > this.limits.quotaBytes
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (
      record.id !==
      ContentReplication.idOf(
        record.networkId as string,
        record.cid as string,
      )
    ) {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: record.ownerIdentityId as string,
      recordId: record.id,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    _authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion) return;

    this.assertBounds(record);
    await this.assertOwnNetwork(record);
    await this.assertWithinBudget(record);
  }
}
