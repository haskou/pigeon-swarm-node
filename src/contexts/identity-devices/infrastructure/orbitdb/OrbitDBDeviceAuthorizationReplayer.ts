import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationCandidate } from '@app/contexts/identity-devices/domain/DeviceAuthorizationCandidate';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceCompromiseCaps } from '@app/contexts/identity-devices/domain/DeviceCompromiseCaps';
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

type RecordCandidate =
  DeviceAuthorizationCandidate<OrbitDBDeviceAuthorizationTransitionRecord>;

export default class OrbitDBDeviceAuthorizationReplayer {
  public constructor(
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly canonicalizer: OrbitDBDeviceAuthorizationCanonicalizer,
    private readonly sources: OrbitDBDeviceAuthorizationSources,
  ) {}

  private candidatesOf(
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): RecordCandidate[] {
    const candidates: RecordCandidate[] = [];

    for (const record of history) {
      const transition = this.parsedTransitionOf(record);

      if (transition) {
        candidates.push({
          encoding: this.canonicalizer.serialize(record),
          payload: record,
          transition,
        });
      }
    }

    return candidates;
  }

  private parsedTransitionOf(
    record: OrbitDBDeviceAuthorizationTransitionRecord,
  ): DeviceAuthorizationTransition | undefined {
    try {
      return this.transitionFromRecord(record);
    } catch {
      // A malformed record never enters the replay. A transition the policy
      // rejects is excluded by its explicit application outcome instead.
      return undefined;
    }
  }

  /**
   * Every state from the replay base (the genesis, or the recovery checkpoint)
   * to the head, in ascending revision order, plus the compromise caps in
   * effect at the head. The checkpoint's carried caps merge with every
   * compromised revocation and carried recovery replayed on top.
   */
  private statesOf(
    genesis: DeviceAuthorization,
    checkpoint: OrbitDBDeviceAuthorizationDocument['checkpoint'],
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): {
    compromiseCaps: DeviceCompromiseCaps;
    states: DeviceAuthorization[];
  } {
    const base = checkpoint
      ? this.checkpointState(genesis, checkpoint)
      : {
          authorization: genesis,
          compromiseCaps: DeviceCompromiseCaps.none(),
        };
    const replay = this.policy.replay(
      base.authorization,
      this.candidatesOf(history),
    );

    return {
      compromiseCaps: replay.accepted.reduce(
        (caps, { transition }) => caps.withCompromise(transition),
        base.compromiseCaps,
      ),
      states: [base.authorization, ...replay.checkpoints],
    };
  }

  private compromiseCapsOfSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): DeviceCompromiseCaps {
    const checkpoint = this.sources.preferredSourceCheckpoint(sources);
    const checkpointRevision = checkpoint?.authorization.revision ?? 0;
    const history = this.sources
      .uniqueTransitionRecords(sources.map((source) => source.history))
      .filter(
        (record) => record.transition.previousRevision >= checkpointRevision,
      );

    return this.statesOf(genesis, checkpoint, history).compromiseCaps;
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
    const replay = this.policy.replay(genesis, this.candidatesOf(history));

    return {
      authorization: replay.authorization,
      history: replay.accepted.map(({ payload }) => payload),
    };
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
        this.compromiseCapsOf(genesis, document),
      );
    }

    const { compromiseCaps, states } = this.statesOf(
      genesis,
      document.checkpoint,
      document.history,
    );

    return new DeviceAuthorizationTimeline(states, compromiseCaps);
  }

  /**
   * The compromise caps in effect at a document's head.
   */
  public compromiseCapsOf(
    genesis: DeviceAuthorization,
    document: OrbitDBDeviceAuthorizationDocument,
  ): DeviceCompromiseCaps {
    if (document.overflow) {
      return this.compromiseCapsOfSources(
        genesis,
        this.sources.documentSources(document),
      );
    }

    return this.statesOf(genesis, document.checkpoint, document.history)
      .compromiseCaps;
  }

  /**
   * The replay base of a recovery checkpoint: the authorization it recovered
   * to and the compromise caps it carries forward. The whole lineage must
   * replay, and the stored authorization must match what it replays to.
   */
  public checkpointState(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): {
    authorization: DeviceAuthorization;
    compromiseCaps: DeviceCompromiseCaps;
  } {
    const recoveries = [...checkpoint.lineage, checkpoint.transition].map(
      (record) => {
        const transition = this.transitionFromRecord(record);

        assert(
          transition !== undefined,
          new InvalidDeviceAuthorizationTransitionError(),
        );

        return transition;
      },
    );
    const state = this.policy.replayRecoveryLineage(genesis, recoveries);

    assert(
      isDeepStrictEqual(
        checkpoint.authorization,
        state.authorization.toPrimitives(),
      ),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return state;
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
