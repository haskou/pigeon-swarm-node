import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { assert } from '@haskou/value-objects';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationReplay } from './documents/OrbitDBDeviceAuthorizationReplay';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';

export default class OrbitDBDeviceAuthorizationReplayer {
  public constructor(
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
  ) {}

  private transitionRecordsByRevision(
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): Map<number, OrbitDBDeviceAuthorizationTransitionRecord[]> {
    const recordsByRevision = new Map<
      number,
      OrbitDBDeviceAuthorizationTransitionRecord[]
    >();

    for (const record of history) {
      const revision = record.transition.previousRevision;
      const records = recordsByRevision.get(revision) ?? [];

      records.push(record);
      recordsByRevision.set(revision, records);
    }

    for (const records of recordsByRevision.values()) {
      records.sort((left, right) => {
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

    return recordsByRevision;
  }

  private concurrentAuthorizations(
    authorization: DeviceAuthorization,
    candidates: Array<{
      authorization: DeviceAuthorization;
      transition: DeviceAuthorizationTransition;
    }>,
  ): DeviceAuthorization[] {
    const recoveries = candidates.filter(({ transition }) =>
      transition.isRecovery(),
    );

    if (recoveries.length > 0) {
      return [recoveries[0].authorization];
    }

    const revocations = candidates.filter(({ transition }) =>
      transition.isRevocation(),
    );

    if (revocations.length > 0) {
      return [
        authorization.revokeConcurrently(
          revocations.map(({ transition }) => transition.getTargetCredential()),
        ),
      ];
    }

    return [
      authorization.enrollConcurrently(
        candidates.map(({ transition }) => transition.getTargetCredential()),
      ),
    ];
  }

  private compactEquivalentCandidates(
    candidates: Array<{
      authorization: DeviceAuthorization;
      record: OrbitDBDeviceAuthorizationTransitionRecord;
      transition: DeviceAuthorizationTransition;
    }>,
  ): Array<{
    authorization: DeviceAuthorization;
    record: OrbitDBDeviceAuthorizationTransitionRecord;
    transition: DeviceAuthorizationTransition;
  }> {
    const candidatesByEffect = new Map<string, (typeof candidates)[number]>();

    for (const candidate of candidates) {
      const effect = this.canonicalizer.serialize({
        operation: candidate.transition.getOperation().valueOf(),
        previousRevision: candidate.transition.getPreviousRevision().valueOf(),
        targetCredential: candidate.transition.getTargetCredential().valueOf(),
      });
      const current = candidatesByEffect.get(effect);

      if (
        !current ||
        this.canonicalizer.serialize(candidate.record) <
          this.canonicalizer.serialize(current.record)
      ) {
        candidatesByEffect.set(effect, candidate);
      }
    }

    return [...candidatesByEffect.values()];
  }

  private replayFrom(
    authorization: DeviceAuthorization,
    recordsByRevision: Map<
      number,
      OrbitDBDeviceAuthorizationTransitionRecord[]
    >,
    states?: DeviceAuthorization[],
  ): OrbitDBDeviceAuthorizationReplay {
    const records =
      recordsByRevision.get(authorization.getRevision().valueOf()) ?? [];
    const candidates: Array<{
      authorization: DeviceAuthorization;
      record: OrbitDBDeviceAuthorizationTransitionRecord;
      transition: DeviceAuthorizationTransition;
    }> = [];

    for (const record of records) {
      try {
        const transition = this.transitionFromRecord(record);

        if (transition) {
          candidates.push({
            authorization: this.policy.apply(authorization, transition),
            record,
            transition,
          });
        }
      } catch {
        continue;
      }
    }

    const compactedCandidates = this.compactEquivalentCandidates(candidates);

    if (compactedCandidates.length === 0) {
      return { authorization, history: [] };
    }

    const [checkpoint] = this.concurrentAuthorizations(
      authorization,
      compactedCandidates,
    );

    assert(
      checkpoint !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );
    states?.push(checkpoint);
    const replay = this.replayFrom(checkpoint, recordsByRevision, states);

    return {
      authorization: replay.authorization,
      history: [
        ...compactedCandidates.map(({ record }) => record),
        ...replay.history,
      ],
    };
  }

  public transitionFromRecord(
    record: OrbitDBDeviceAuthorizationTransitionRecord,
  ): DeviceAuthorizationTransition | undefined {
    const transition = DeviceAuthorizationTransition.fromPrimitives(
      record.transition,
    );

    return this.canonicalizer.serialize(transition.toPrimitives()) ===
      this.canonicalizer.serialize(record.transition)
      ? transition
      : undefined;
  }

  public rebuild(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): OrbitDBDeviceAuthorizationReplay {
    const recordsByRevision = this.transitionRecordsByRevision(history);

    return this.replayFrom(genesis, recordsByRevision);
  }

  /**
   * Every state of the replay, from `base` (the genesis or a recovery
   * checkpoint) to the head, in ascending revision order.
   */
  public statesOf(
    base: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): DeviceAuthorization[] {
    const states = [base];

    this.replayFrom(base, this.transitionRecordsByRevision(history), states);

    return states;
  }

  public authorizationFromCheckpoint(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): DeviceAuthorization {
    const authorization = [...checkpoint.lineage, checkpoint.transition].reduce(
      (current, record) => {
        const transition = this.transitionFromRecord(record);

        assert(
          transition !== undefined && transition.isRecovery(),
          new InvalidDeviceAuthorizationTransitionError(),
        );

        return this.policy.applyRecoveryCheckpoint(current, transition);
      },
      genesis,
    );

    assert(
      isDeepStrictEqual(checkpoint.authorization, authorization.toPrimitives()),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return authorization;
  }

  public sourceReplay(
    genesis: DeviceAuthorization,
    source: OrbitDBDeviceAuthorizationSource,
  ): OrbitDBDeviceAuthorizationReplay {
    return this.rebuild(
      source.checkpoint
        ? this.authorizationFromCheckpoint(genesis, source.checkpoint)
        : genesis,
      source.history,
    );
  }

  public replaySources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): {
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'];
    replay: OrbitDBDeviceAuthorizationReplay;
  } {
    const checkpoint = this.sources.preferredSourceCheckpoint(sources);
    const checkpointRevision = checkpoint?.authorization.revision ?? 0;
    const history = this.sources
      .uniqueTransitionRecords(sources.map((source) => source.history))
      .filter(
        (record) => record.transition.previousRevision >= checkpointRevision,
      );

    return {
      ...(checkpoint ? { checkpoint } : {}),
      replay: this.rebuild(
        checkpoint
          ? this.authorizationFromCheckpoint(genesis, checkpoint)
          : genesis,
        history,
      ),
    };
  }

  public sourcesAtPreferredCheckpoint(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const checkpoint = this.sources.preferredSourceCheckpoint(sources);

    if (!checkpoint) {
      return this.sources.canonicalSources(sources);
    }

    const authorization = this.authorizationFromCheckpoint(genesis, checkpoint);

    return this.sources.canonicalSources(
      sources.map((source) => ({
        checkpoint,
        history: isDeepStrictEqual(source.checkpoint, checkpoint)
          ? this.rebuild(authorization, source.history).history
          : [],
      })),
    );
  }
}
