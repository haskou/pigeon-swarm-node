import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';

export default class OrbitDBDeviceAuthorizationSources {
  public constructor(
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
   * The checkpoint of the highest recovery, ties broken by its canonical
   * form. Every other recovery at that revision on the same lineage lost it:
   * it is kept as concurrent, so the caps it carries still hold.
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
      )
      .map(({ authorization, concurrent, lineage, transition }) => ({
        concurrent: concurrent ?? [],
        recovery: { authorization, lineage, transition },
      }))
      .sort(
        (left, right) =>
          right.recovery.authorization.revision -
            left.recovery.authorization.revision ||
          this.canonicalizer
            .serialize(left.recovery)
            .localeCompare(this.canonicalizer.serialize(right.recovery)),
      );
    const preferred = checkpoints[0]?.recovery;

    if (!preferred) {
      return undefined;
    }

    const concurrent = this.uniqueTransitionRecords(
      checkpoints
        .filter(
          ({ recovery }) =>
            recovery.authorization.revision ===
              preferred.authorization.revision &&
            isDeepStrictEqual(recovery.lineage, preferred.lineage),
        )
        .map(({ concurrent: lost, recovery }) => [
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
