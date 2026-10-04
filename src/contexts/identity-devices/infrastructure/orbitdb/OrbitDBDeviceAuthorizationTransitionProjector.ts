import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { assert } from '@haskou/value-objects';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import OrbitDBDeviceAuthorizationDocumentFactory from './OrbitDBDeviceAuthorizationDocumentFactory';
import OrbitDBDeviceAuthorizationDocumentShape from './OrbitDBDeviceAuthorizationDocumentShape';
import OrbitDBDeviceAuthorizationReplayer from './OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';

export default class OrbitDBDeviceAuthorizationTransitionProjector {
  public constructor(
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly factory: OrbitDBDeviceAuthorizationDocumentFactory,
    private readonly replayer: OrbitDBDeviceAuthorizationReplayer,
    private readonly shape: OrbitDBDeviceAuthorizationDocumentShape,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
  ) {}

  private applyOverflowRecovery(
    suspended: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    assert(
      transition.isRecovery() &&
        suspended.getEpoch().isEqual(transition.getEpoch()) &&
        suspended.getRevision().isEqual(transition.getPreviousRevision()) &&
        transition.getRevision().immediatelyFollows(suspended.getRevision()),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.policy.applyRecoveryCheckpoint(suspended, transition);
  }

  public hasReplay(
    document: OrbitDBDeviceAuthorizationDocument,
    transition: DeviceAuthorizationTransition,
  ): boolean {
    const operationId = transition.getOperationId().valueOf();
    const pairingId = transition.isEnrollment()
      ? transition.getPairingId().valueOf()
      : undefined;
    const checkpoint = this.sources.effectiveCheckpoint(document);

    return Boolean(
      this.sources
        .effectiveHistory(document)
        .some(
          (record) =>
            record.transition.operationId === operationId ||
            (pairingId !== undefined &&
              record.transition.pairingId === pairingId),
        ) || checkpoint?.transition.transition.operationId === operationId,
    );
  }

  public authorizationAfter(
    stored: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    return stored.overflow
      ? this.applyOverflowRecovery(
          DeviceAuthorization.fromPrimitives(stored.authorization),
          transition,
        )
      : this.policy.apply(
          this.replayer.rebuild(
            stored.checkpoint
              ? this.replayer.authorizationFromCheckpoint(
                  genesis,
                  stored.checkpoint,
                )
              : genesis,
            stored.history,
          ).authorization,
          transition,
        );
  }

  public documentAfterTransition(
    stored: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): OrbitDBDeviceAuthorizationDocument {
    const transitionRecord = { transition: transition.toPrimitives() };

    if (transition.isRecovery()) {
      const checkpoint = this.sources.effectiveCheckpoint(stored);

      return this.factory.toDocument(genesis, [], {
        authorization: authorization.toPrimitives(),
        lineage: checkpoint
          ? [...checkpoint.lineage, checkpoint.transition]
          : [],
        transition: transitionRecord,
      });
    }

    const source: OrbitDBDeviceAuthorizationSource = {
      ...(stored.checkpoint ? { checkpoint: stored.checkpoint } : {}),
      history: [...stored.history, transitionRecord],
    };
    const sources = this.replayer.sourcesAtPreferredCheckpoint(
      genesis,
      this.sources.canonicalSources([
        ...this.sources.documentSources(stored),
        source,
      ]),
    );
    const projection = this.replayer.replaySources(genesis, sources);

    return this.shape.hasBoundedProjection(projection.replay, sources)
      ? this.factory.documentFromReplay(
          genesis,
          projection.replay,
          sources,
          projection.checkpoint,
        )
      : this.factory.overflowDocument(
          genesis,
          sources,
          this.factory.toDocument(genesis, source.history, source.checkpoint),
        );
  }
}
