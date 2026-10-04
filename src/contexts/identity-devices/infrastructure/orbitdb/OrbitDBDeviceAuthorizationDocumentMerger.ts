import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationReplay } from './documents/OrbitDBDeviceAuthorizationReplay';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import OrbitDBDeviceAuthorizationDocumentFactory from './OrbitDBDeviceAuthorizationDocumentFactory';
import OrbitDBDeviceAuthorizationDocumentShape from './OrbitDBDeviceAuthorizationDocumentShape';
import OrbitDBDeviceAuthorizationDocumentValidator from './OrbitDBDeviceAuthorizationDocumentValidator';
import OrbitDBDeviceAuthorizationGenesisMatcher from './OrbitDBDeviceAuthorizationGenesisMatcher';
import OrbitDBDeviceAuthorizationReplayer from './OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationRouting from './OrbitDBDeviceAuthorizationRouting';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';

export default class OrbitDBDeviceAuthorizationDocumentMerger {
  public constructor(
    private readonly factory: OrbitDBDeviceAuthorizationDocumentFactory,
    private readonly genesisMatcher: OrbitDBDeviceAuthorizationGenesisMatcher,
    private readonly replayer: OrbitDBDeviceAuthorizationReplayer,
    private readonly routing: OrbitDBDeviceAuthorizationRouting,
    private readonly shape: OrbitDBDeviceAuthorizationDocumentShape,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
    private readonly validator: OrbitDBDeviceAuthorizationDocumentValidator,
  ) {}

  private conflictsWithTrustedGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const trusted = this.routing.trustedGenesis(document.identityId);

    return Boolean(
      trusted &&
      !this.genesisMatcher.sameAuthorizationGenesis(
        document.genesis,
        trusted.toPrimitives(),
      ),
    );
  }

  private mergedReplay(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): {
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'];
    genesis: DeviceAuthorization;
    replay: OrbitDBDeviceAuthorizationReplay;
    sources: OrbitDBDeviceAuthorizationSource[];
  } {
    const genesis = DeviceAuthorization.fromPrimitives(left.genesis);
    const sources = this.replayer.sourcesAtPreferredCheckpoint(
      genesis,
      this.sources.canonicalSources([
        ...this.sources.mergeSourceEvidence(left),
        ...this.sources.mergeSourceEvidence(right),
      ]),
    );
    const { checkpoint, replay } = this.replayer.replaySources(
      genesis,
      sources,
    );

    return {
      ...(checkpoint ? { checkpoint } : {}),
      genesis,
      replay,
      sources,
    };
  }

  private mergeOverflow(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (!left.overflow && !right.overflow) {
      return undefined;
    }

    const recovery = this.supersedingRecovery(left, right);

    if (recovery) {
      return recovery;
    }

    const merged = this.mergedReplay(left, right);

    return this.factory.overflowDocument(
      merged.genesis,
      merged.sources,
      this.factory.frontierFromSources(merged.genesis, merged.sources),
    );
  }

  private supersedingRecovery(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (
      left.overflow &&
      !right.overflow &&
      this.recoverySupersedesOverflow(right, left)
    ) {
      return right;
    }

    if (
      right.overflow &&
      !left.overflow &&
      this.recoverySupersedesOverflow(left, right)
    ) {
      return left;
    }

    return undefined;
  }

  private recoverySupersedesOverflow(
    candidate: OrbitDBDeviceAuthorizationDocument,
    overflow: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const checkpoint = candidate.checkpoint;

    if (!checkpoint) {
      return false;
    }

    const checkpointRevision = new DeviceAuthorizationRevision(
      checkpoint.authorization.revision,
    );
    const overflowRevision = new DeviceAuthorizationRevision(
      overflow.authorization.revision,
    );

    return (
      checkpointRevision.isGreaterThan(overflowRevision) ||
      checkpointRevision.isEqual(overflowRevision)
    );
  }

  private trustedDocument(
    value: Record<string, unknown> | undefined,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (!value || !this.validator.isDocument(value)) {
      return undefined;
    }

    return this.conflictsWithTrustedGenesis(value) ? undefined : value;
  }

  public mergeRecords(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const acceptedCandidate = this.trustedDocument(candidate);

    if (!acceptedCandidate) {
      return current;
    }

    const acceptedCurrent = this.trustedDocument(current);

    if (!acceptedCurrent) {
      return acceptedCandidate;
    }

    if (!this.genesisMatcher.sameGenesis(acceptedCurrent, acceptedCandidate)) {
      return acceptedCurrent;
    }

    const overflow = this.mergeOverflow(acceptedCurrent, acceptedCandidate);

    if (overflow) {
      return overflow;
    }

    const merged = this.mergedReplay(acceptedCurrent, acceptedCandidate);
    const { checkpoint, genesis, replay, sources } = merged;

    return this.shape.hasBoundedProjection(replay, sources)
      ? this.factory.documentFromReplay(genesis, replay, sources, checkpoint)
      : this.factory.overflowDocument(
          genesis,
          sources,
          this.factory.frontierFromSources(genesis, sources),
        );
  }
}
