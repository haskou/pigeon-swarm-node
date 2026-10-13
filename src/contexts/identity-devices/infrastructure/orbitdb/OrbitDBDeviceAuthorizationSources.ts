import { DeviceAuthorizationCheckpointCandidate } from '@app/contexts/identity-devices/domain/DeviceAuthorizationCheckpointCandidate';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationContendingCheckpoint } from './documents/OrbitDBDeviceAuthorizationContendingCheckpoint';
import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';

export default class OrbitDBDeviceAuthorizationSources {
  public constructor(
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
  ) {}

  private sourceExtends(
    candidate: OrbitDBDeviceAuthorizationSource,
    prefix: OrbitDBDeviceAuthorizationSource,
  ): boolean {
    if (
      candidate.history.length <= prefix.history.length ||
      !isDeepStrictEqual(candidate.checkpoint, prefix.checkpoint)
    ) {
      return false;
    }

    return prefix.history.every((record, index) =>
      isDeepStrictEqual(record, candidate.history[index]),
    );
  }

  public uniqueTransitionRecords(
    histories: OrbitDBDeviceAuthorizationTransitionRecord[][],
  ): OrbitDBDeviceAuthorizationTransitionRecord[] {
    const uniqueRecords = new Map<
      string,
      OrbitDBDeviceAuthorizationTransitionRecord
    >();

    for (const history of histories) {
      for (const record of history) {
        uniqueRecords.set(this.canonicalizer.serialize(record), record);
      }
    }

    return [...uniqueRecords.values()].sort((left, right) => {
      const operationOrder = left.transition.operationId.localeCompare(
        right.transition.operationId,
      );

      return (
        operationOrder ||
        this.canonicalizer
          .serialize(left)
          .localeCompare(this.canonicalizer.serialize(right))
      );
    });
  }

  public documentSources(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationSource[] {
    return (
      document.overflow?.sources ??
      document.sources ?? [
        {
          ...(document.checkpoint ? { checkpoint: document.checkpoint } : {}),
          history: document.history,
        },
      ]
    );
  }

  public effectiveHistory(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationTransitionRecord[] {
    return this.uniqueTransitionRecords(
      this.documentSources(document).map((source) => source.history),
    );
  }

  public effectiveCheckpoint(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    return this.preferredSourceCheckpoint(this.documentSources(document));
  }

  /**
   * Maps source checkpoints to the domain checkpoint precedence. Recoveries
   * contending with the preferred one are kept as concurrent, so the caps
   * they carry still hold.
   */
  public preferredSourceCheckpoint(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    const precedence = this.policy.preferCheckpoint(
      sources
        .map((source) => source.checkpoint)
        .filter(
          (
            checkpoint,
          ): checkpoint is NonNullable<
            OrbitDBDeviceAuthorizationDocument['checkpoint']
          > => checkpoint !== undefined,
        )
        .map(
          ({
            authorization,
            concurrent,
            lineage,
            transition,
          }): DeviceAuthorizationCheckpointCandidate<OrbitDBDeviceAuthorizationContendingCheckpoint> => {
            const recovery = { authorization, lineage, transition };

            return {
              encoding: this.canonicalizer.serialize(recovery),
              payload: { concurrent: concurrent ?? [], recovery },
              revision: new DeviceAuthorizationRevision(authorization.revision),
              sharesLineageWith: (other) =>
                isDeepStrictEqual(other.payload.recovery.lineage, lineage),
            };
          },
        ),
    );

    if (!precedence) {
      return undefined;
    }

    const preferred = precedence.preferred.recovery;
    const concurrent = this.uniqueTransitionRecords(
      precedence.contenders.map(({ concurrent: lost, recovery }) => [
        recovery.transition,
        ...lost,
      ]),
    ).filter((record) => !isDeepStrictEqual(record, preferred.transition));

    return concurrent.length > 0 ? { ...preferred, concurrent } : preferred;
  }

  public canonicalSources(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const unique = new Map<string, OrbitDBDeviceAuthorizationSource>();

    for (const source of sources) {
      unique.set(this.canonicalizer.serialize(source), source);
    }

    const candidates = [...unique.values()];
    const retained = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) =>
            other !== candidate && this.sourceExtends(other, candidate),
        ),
    );

    return retained.sort((left, right) =>
      this.canonicalizer
        .serialize(left)
        .localeCompare(this.canonicalizer.serialize(right)),
    );
  }

  public mergeSourceEvidence(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationSource[] {
    return [
      ...this.documentSources(document),
      ...(document.overflow
        ? this.documentSources(document.overflow.frontier)
        : []),
    ];
  }
}
