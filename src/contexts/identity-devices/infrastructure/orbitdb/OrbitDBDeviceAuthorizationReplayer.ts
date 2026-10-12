import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
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
        compromisedSince: candidate.transition.getCompromisedSince()?.valueOf(),
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

  /**
   * Every state from the replay base (the genesis, or the recovery checkpoint)
   * to the head, in ascending revision order, plus the revision each
   * compromised credential is capped at. The checkpoint's carried caps merge
   * with every compromised revocation and carried recovery replayed on top.
   */
  private statesOf(
    genesis: DeviceAuthorization,
    checkpoint: OrbitDBDeviceAuthorizationDocument['checkpoint'],
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): {
    compromisedSince: Map<string, number>;
    states: DeviceAuthorization[];
  } {
    const base = checkpoint
      ? this.checkpointState(genesis, checkpoint)
      : {
          authorization: genesis,
          compromisedSince: new Map<string, number>(),
        };
    const states = [base.authorization];
    const replay = this.replayFrom(
      base.authorization,
      this.transitionRecordsByRevision(history),
      states,
    );
    const { compromisedSince } = base;
    const cap = (credential: string, since: number): void => {
      compromisedSince.set(
        credential,
        Math.min(
          since,
          compromisedSince.get(credential) ?? Number.POSITIVE_INFINITY,
        ),
      );
    };

    for (const { transition } of replay.history) {
      for (const entry of transition.compromisedCredentials ?? []) {
        cap(entry.credential, entry.compromisedSince);
      }

      if (
        transition.operation === 'revoke' &&
        transition.compromisedSince !== undefined
      ) {
        cap(transition.targetCredential, transition.compromisedSince);
      }
    }

    return { compromisedSince, states };
  }

  private compromisedSinceOfSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): ReadonlyMap<string, number> {
    const checkpoint = this.sources.preferredSourceCheckpoint(sources);
    const checkpointRevision = checkpoint?.authorization.revision ?? 0;
    const history = this.sources
      .uniqueTransitionRecords(sources.map((source) => source.history))
      .filter(
        (record) => record.transition.previousRevision >= checkpointRevision,
      );

    return this.statesOf(genesis, checkpoint, history).compromisedSince;
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
   * The timeline of one document: every state from its replay base to the
   * head, with the caps in effect at the head. An overflowed document keeps
   * only its suspended state, so its caps come from its witness sources.
   */
  public timelineOf(
    genesis: DeviceAuthorization,
    document: OrbitDBDeviceAuthorizationDocument,
  ): DeviceAuthorizationTimeline {
    if (document.overflow) {
      return new DeviceAuthorizationTimeline(
        [DeviceAuthorization.fromPrimitives(document.authorization)],
        this.compromisedSinceOf(genesis, document),
      );
    }

    const { compromisedSince, states } = this.statesOf(
      genesis,
      document.checkpoint,
      document.history,
    );

    return new DeviceAuthorizationTimeline(states, compromisedSince);
  }

  /**
   * The caps in effect at a document's head, keyed by compromised credential.
   */
  public compromisedSinceOf(
    genesis: DeviceAuthorization,
    document: OrbitDBDeviceAuthorizationDocument,
  ): ReadonlyMap<string, number> {
    if (document.overflow) {
      return this.compromisedSinceOfSources(
        genesis,
        this.sources.documentSources(document),
      );
    }

    return this.statesOf(genesis, document.checkpoint, document.history)
      .compromisedSince;
  }

  /**
   * The replay base of a recovery checkpoint: the authorization it recovered
   * to and the compromised caps it carries forward. Every recovery in the
   * lineage must replay, and a later recovery may only tighten or add caps,
   * so no checkpoint can re-admit a credential an earlier one capped.
   */
  public checkpointState(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): {
    authorization: DeviceAuthorization;
    compromisedSince: Map<string, number>;
  } {
    let authorization = genesis;
    let compromisedSince = new Map<string, number>();

    for (const record of [...checkpoint.lineage, checkpoint.transition]) {
      const transition = this.transitionFromRecord(record);

      assert(
        transition !== undefined && transition.isRecovery(),
        new InvalidDeviceAuthorizationTransitionError(),
      );

      authorization = this.policy.applyRecoveryCheckpoint(
        authorization,
        transition,
      );

      const carried = new Map(
        transition
          .getCompromisedCredentials()
          .map((entry): [string, number] => [
            entry.credential.valueOf(),
            entry.compromisedSince.valueOf(),
          ]),
      );

      for (const [credential, since] of compromisedSince) {
        assert(
          (carried.get(credential) ?? Number.POSITIVE_INFINITY) <= since,
          new InvalidDeviceAuthorizationTransitionError(),
        );
      }

      compromisedSince = carried;
    }

    assert(
      isDeepStrictEqual(checkpoint.authorization, authorization.toPrimitives()),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return { authorization, compromisedSince };
  }

  public authorizationFromCheckpoint(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): DeviceAuthorization {
    return this.checkpointState(genesis, checkpoint).authorization;
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
