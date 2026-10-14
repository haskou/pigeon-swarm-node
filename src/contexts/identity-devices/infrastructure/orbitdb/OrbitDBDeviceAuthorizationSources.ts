import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { isDeepStrictEqual } from 'node:util';

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
   * Maps source checkpoints to the domain checkpoint precedence. Every
   * recovery a source checkpoint records off the preferred lineage, at any
   * revision, lost to it: the domain policy keeps those whose caps must still
   * hold as concurrent, so a heal never drops a cap only a losing side carried.
   */
  public preferredSourceCheckpoint(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    const checkpoints = sources
      .map((source) => source.checkpoint)
      .filter(
        (
          checkpoint,
        ): checkpoint is NonNullable<
          OrbitDBDeviceAuthorizationDocument['checkpoint']
        > => checkpoint !== undefined,
      );
    const preferred = this.policy.preferCheckpoint(
      checkpoints.map(({ authorization, lineage, transition }) => {
        const recovery = { authorization, lineage, transition };

        return {
          encoding: this.canonicalizer.serialize(recovery),
          payload: recovery,
          revision: new DeviceAuthorizationRevision(authorization.revision),
        };
      }),
    );

    if (!preferred) {
      return undefined;
    }

    const preferredPath = new Set(
      [...preferred.lineage, preferred.transition].map((record) =>
        this.canonicalizer.serialize(record),
      ),
    );
    const concurrent = this.policy.heldLostRecoveries(
      DeviceAuthorizationTransition.fromPrimitives(
        preferred.transition.transition,
      ),
      this.uniqueTransitionRecords(
        checkpoints.map(({ concurrent: lost, lineage, transition }) => [
          ...lineage,
          transition,
          ...(lost ?? []),
        ]),
      ).flatMap((record) => {
        const encoding = this.canonicalizer.serialize(record);

        return preferredPath.has(encoding)
          ? []
          : [
              {
                encoding,
                payload: record,
                transition: DeviceAuthorizationTransition.fromPrimitives(
                  record.transition,
                ),
              },
            ];
      }),
    );

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
