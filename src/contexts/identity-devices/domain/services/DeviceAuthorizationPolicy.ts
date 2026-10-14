import { Timestamp, assert } from '@haskou/value-objects';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationApplication } from '../DeviceAuthorizationApplication';
import { DeviceAuthorizationCandidate } from '../DeviceAuthorizationCandidate';
import { DeviceAuthorizationOverflowBound } from '../DeviceAuthorizationOverflowBound';
import { DeviceAuthorizationRecoveryState } from '../DeviceAuthorizationRecoveryState';
import { DeviceAuthorizationReplayResult } from '../DeviceAuthorizationReplayResult';
import { DeviceAuthorizationSourceCandidate } from '../DeviceAuthorizationSourceCandidate';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';
import { DeviceCompromiseCaps } from '../DeviceCompromiseCaps';
import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationEpoch } from '../value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationRevision } from '../value-objects/DeviceAuthorizationRevision';
import { RevisionGroup } from './RevisionGroup';

interface Admitted<T> {
  authorization: DeviceAuthorization;
  candidate: DeviceAuthorizationCandidate<T>;
}

export default class DeviceAuthorizationPolicy {
  private verifyCommon(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): void {
    assert(
      authorization.getIdentityId().isEqual(transition.getIdentityId()) &&
        authorization.getEpoch().isEqual(transition.getEpoch()),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    assert(
      authorization.getRevision().isEqual(transition.getPreviousRevision()) &&
        transition
          .getRevision()
          .immediatelyFollows(authorization.getRevision()),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private verifyTargetProof(transition: DeviceAuthorizationTransition): void {
    assert(
      transition
        .getTargetCredential()
        .isValidSignature(
          transition.getProofOfPossessionPayload(),
          transition.getProofOfPossession(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private verifyDeviceAuthor(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): void {
    const author = transition.getAuthorCredential();

    assert(
      authorization.isAuthorized(author) &&
        author.isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private enroll(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyDeviceAuthor(authorization, transition);
    this.verifyTargetProof(transition);
    transition.requirePairingId();
    transition.requirePairingExpiration();

    return authorization.enroll(transition.getTargetCredential());
  }

  private revoke(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyDeviceAuthor(authorization, transition);

    return authorization.revoke(
      transition.getTargetCredential(),
      transition.getCompromisedSince(),
    );
  }

  private recover(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyTargetProof(transition);
    assert(
      authorization
        .getRecoveryAuthority()
        .isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return authorization.recover(
      transition.getTargetCredential(),
      DeviceAuthorizationEpoch.fromRecovery(transition.getOperationId()),
    );
  }

  /**
   * One recovery of a lineage: it must apply to the previous state and keep
   * every cap that state carried at least as tight.
   */
  private recoverLineage(
    previous: DeviceAuthorizationRecoveryState,
    recovery: DeviceAuthorizationTransition,
  ): DeviceAuthorizationRecoveryState {
    const authorization = this.applyRecoveryCheckpoint(
      previous.authorization,
      recovery,
    );
    const carried = DeviceCompromiseCaps.carriedBy(recovery);

    assert(
      previous.compromiseCaps.isNotLoosenedBy(carried),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return { authorization, compromiseCaps: carried };
  }

  /**
   * The state a lost recovery recovered from: the one state, on the lineage
   * or a lost recovery replayed before it, in the epoch it is signed in. Its
   * own epoch must be new, so one recovery is never replayed twice.
   */
  private lostRecoveryBase(
    states: DeviceAuthorizationRecoveryState[],
    lost: DeviceAuthorizationTransition,
  ): DeviceAuthorizationRecoveryState {
    const recoveredEpoch = DeviceAuthorizationEpoch.fromRecovery(
      lost.getOperationId(),
    );
    const [base, ...ambiguous] = states.filter(({ authorization }) =>
      authorization.getEpoch().isEqual(lost.getEpoch()),
    );

    assert(
      base !== undefined &&
        ambiguous.length === 0 &&
        !states.some(({ authorization }) =>
          authorization.getEpoch().isEqual(recoveredEpoch),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return base;
  }

  private groupByRevision<T>(
    candidates: DeviceAuthorizationCandidate<T>[],
  ): RevisionGroup<T>[] {
    const groups: RevisionGroup<T>[] = [];

    for (const candidate of candidates) {
      const revision = candidate.transition.getPreviousRevision();
      const group = groups.find((existing) =>
        existing.revision.isEqual(revision),
      );

      if (group) {
        group.candidates.push(candidate);
      } else {
        groups.push({ candidates: [candidate], revision });
      }
    }

    for (const group of groups) {
      group.candidates.sort((left, right) => this.replayOrder(left, right));
    }

    return groups;
  }

  /**
   * Candidates at one revision replay by operation id. Equal operation ids
   * fall back to the canonical encoding: the protocol tie-break, the only
   * order every replica derives from the record itself. It decides which
   * recovery is admitted first, so it MUST stay byte-identical across nodes.
   */
  private replayOrder<T>(
    left: DeviceAuthorizationCandidate<T>,
    right: DeviceAuthorizationCandidate<T>,
  ): number {
    const operationOrder = left.transition
      .getOperationId()
      .compareTo(right.transition.getOperationId());

    return operationOrder || left.encoding.localeCompare(right.encoding);
  }

  /**
   * Replicated sources take precedence by the highest revision they reach;
   * sources reaching one revision fall back to their canonical encoding.
   */
  private precedenceOrder<T>(
    left: DeviceAuthorizationSourceCandidate<T>,
    right: DeviceAuthorizationSourceCandidate<T>,
  ): number {
    return (
      right.revision.compareTo(left.revision) ||
      left.encoding.localeCompare(right.encoding)
    );
  }

  /**
   * An overflow witness is measured by its sources while the history they
   * replay to fits the bound, and by its projection once it does not.
   */
  private fitsOverflowMeasure<T>(
    bound: DeviceAuthorizationOverflowBound<T>,
    completeHistoryFits: boolean,
    sources: T[],
  ): boolean {
    return completeHistoryFits
      ? bound.fitsSources(sources)
      : bound.fitsProjection(sources);
  }

  private admittedAt<T>(
    authorization: DeviceAuthorization,
    groups: RevisionGroup<T>[],
  ): Admitted<T>[] {
    const admitted: Admitted<T>[] = [];

    const group = groups.find((existing) =>
      existing.revision.isEqual(authorization.getRevision()),
    );
    const candidates = group?.candidates ?? [];

    for (const candidate of candidates) {
      const application = this.tryApply(authorization, candidate.transition);

      if (application.applied) {
        admitted.push({ authorization: application.authorization, candidate });
      }
    }

    return admitted;
  }

  private compactEquivalent<T>(admitted: Admitted<T>[]): Admitted<T>[] {
    const compacted: Admitted<T>[] = [];

    for (const entry of admitted) {
      const index = compacted.findIndex(({ candidate }) =>
        candidate.transition.hasSameEffectAs(entry.candidate.transition),
      );

      if (index === -1) {
        compacted.push(entry);
      } else if (
        entry.candidate.encoding < compacted[index].candidate.encoding
      ) {
        compacted[index] = entry;
      }
    }

    return compacted;
  }

  private checkpointOf<T>(
    authorization: DeviceAuthorization,
    admitted: Admitted<T>[],
  ): DeviceAuthorization {
    const recovery = admitted.find(({ candidate }) =>
      candidate.transition.isRecovery(),
    );

    if (recovery) {
      return recovery.authorization;
    }

    const revocations = admitted.filter(({ candidate }) =>
      candidate.transition.isRevocation(),
    );

    if (revocations.length > 0) {
      return authorization.revokeConcurrently(
        revocations.map(({ candidate }) =>
          candidate.transition.getTargetCredential(),
        ),
      );
    }

    return authorization.enrollConcurrently(
      admitted.map(({ candidate }) =>
        candidate.transition.getTargetCredential(),
      ),
    );
  }

  public verifyFirstAcceptance(
    transition: DeviceAuthorizationTransition,
    acceptedAt: Timestamp,
  ): void {
    if (!transition.isEnrollment()) {
      return;
    }

    assert(
      !transition.requirePairingExpiration().isExpiredAt(acceptedAt),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  /**
   * A transition is never accepted twice: it is rejected when it replays any
   * transition already recorded for the identity.
   */
  public verifyNotReplayed(
    transition: DeviceAuthorizationTransition,
    recorded: DeviceAuthorizationTransition[],
  ): void {
    assert(
      !recorded.some((existing) => transition.replays(existing)),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  public applyRecoveryCheckpoint(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    assert(
      transition.isRecovery() &&
        authorization.getIdentityId().isEqual(transition.getIdentityId()) &&
        authorization.getEpoch().isEqual(transition.getEpoch()) &&
        transition
          .getPreviousRevision()
          .isGreaterOrEqualThan(authorization.getRevision()),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    this.verifyTargetProof(transition);
    assert(
      authorization
        .getRecoveryAuthority()
        .isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return authorization.recoverAt(
      transition.getRevision(),
      transition.getTargetCredential(),
      DeviceAuthorizationEpoch.fromRecovery(transition.getOperationId()),
    );
  }

  /**
   * The replay base of a recovery lineage: the authorization the lineage ends
   * at and the compromise caps it carries. Every recovery must apply, and a
   * later recovery may tighten or add caps but never drop or loosen one an
   * earlier recovery carried, so no checkpoint re-admits a capped credential.
   * A concurrent recovery lost the checkpoint to the last one, at its revision
   * or an earlier one: it must apply to the state it recovered from, on the
   * lineage or another lost recovery, and its carried caps still hold, so a
   * heal never drops a cap only the losing side carried.
   */
  public replayRecoveryLineage(
    genesis: DeviceAuthorization,
    recoveries: DeviceAuthorizationTransition[],
    concurrent: DeviceAuthorizationTransition[] = [],
  ): DeviceAuthorizationRecoveryState {
    let head: DeviceAuthorizationRecoveryState = {
      authorization: genesis,
      compromiseCaps: DeviceCompromiseCaps.none(),
    };
    const states = [head];

    for (const recovery of recoveries) {
      head = this.recoverLineage(head, recovery);
      states.push(head);
    }

    const last = recoveries.at(-1);
    let { compromiseCaps } = head;

    for (const lost of [...concurrent].sort((left, right) =>
      left.getRevision().compareTo(right.getRevision()),
    )) {
      assert(
        last !== undefined &&
          !lost.getRevision().isGreaterThan(last.getRevision()),
        new InvalidDeviceAuthorizationTransitionError(),
      );
      states.push(
        this.recoverLineage(this.lostRecoveryBase(states, lost), lost),
      );
      compromiseCaps = compromiseCaps.withCompromise(lost);
    }

    return { authorization: head.authorization, compromiseCaps };
  }

  public apply(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyCommon(authorization, transition);

    if (transition.isEnrollment()) {
      return this.enroll(authorization, transition);
    }

    if (transition.isRevocation()) {
      return this.revoke(authorization, transition);
    }

    assert(
      transition.isRecovery(),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.recover(authorization, transition);
  }

  /**
   * A transition the policy rejects is inapplicable at this state. It is an
   * explicit outcome, so the replay can exclude it instead of failing.
   */
  public tryApply(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorizationApplication {
    try {
      return {
        applied: true,
        authorization: this.apply(authorization, transition),
      };
    } catch {
      return { applied: false };
    }
  }

  /**
   * Replays candidates from a base. At each revision the admitted candidates
   * are compacted by effect and one checkpoint is taken: a recovery first,
   * then concurrent revocations, otherwise concurrent enrollments.
   */
  public replay<T>(
    base: DeviceAuthorization,
    candidates: DeviceAuthorizationCandidate<T>[],
  ): DeviceAuthorizationReplayResult<T> {
    const groups = this.groupByRevision(candidates);
    const accepted: DeviceAuthorizationCandidate<T>[] = [];
    const checkpoints: DeviceAuthorization[] = [];
    let authorization = base;
    let admitted = this.admittedAt(authorization, groups);

    while (admitted.length > 0) {
      const compacted = this.compactEquivalent(admitted);
      const checkpoint = this.checkpointOf(authorization, compacted);

      assert(
        checkpoint.getRevision().isGreaterThan(authorization.getRevision()),
        new InvalidDeviceAuthorizationTransitionError(),
      );

      accepted.push(...compacted.map(({ candidate }) => candidate));
      checkpoints.push(checkpoint);
      authorization = checkpoint;
      admitted = this.admittedAt(authorization, groups);
    }

    return { accepted, authorization, checkpoints };
  }

  /**
   * The preferred recovery checkpoint is the one at the highest revision,
   * ties broken by canonical encoding.
   */
  public preferCheckpoint<T>(
    candidates: DeviceAuthorizationSourceCandidate<T>[],
  ): T | undefined {
    const [preferred] = [...candidates].sort((left, right) =>
      this.precedenceOrder(left, right),
    );

    return preferred?.payload;
  }

  /**
   * The recoveries that lost the checkpoint to `winner` and still hold: each
   * one carrying a cap the winner does not carry at least as tight, and every
   * lost recovery such a one recovered from, so its replay base stays on the
   * record. A lost recovery whose every cap the winner carries adds nothing;
   * dropping it keeps repeated heals from piling up losers. Kept in the order
   * given.
   */
  public heldLostRecoveries<T>(
    winner: DeviceAuthorizationTransition,
    lost: DeviceAuthorizationCandidate<T>[],
  ): T[] {
    const winnerCaps = DeviceCompromiseCaps.carriedBy(winner);
    const held = new Set(
      lost.filter(
        ({ transition }) =>
          !DeviceCompromiseCaps.carriedBy(transition).isNotLoosenedBy(
            winnerCaps,
          ),
      ),
    );

    // A Set iteration also visits the entries added while it runs, so this
    // walks every held recovery back through the lost ones it recovered from.
    for (const { transition: recovered } of held) {
      for (const candidate of lost) {
        if (
          recovered
            .getEpoch()
            .isEqual(
              DeviceAuthorizationEpoch.fromRecovery(
                candidate.transition.getOperationId(),
              ),
            )
        ) {
          held.add(candidate);
        }
      }
    }

    return lost
      .filter((candidate) => held.has(candidate))
      .map(({ payload }) => payload);
  }

  /**
   * The frontier of replicated sources is the source reaching the highest
   * revision, ties broken by canonical encoding.
   */
  public preferFrontier<T>(
    candidates: DeviceAuthorizationSourceCandidate<T>[],
  ): T {
    const [frontier] = [...candidates].sort((left, right) =>
      this.precedenceOrder(left, right),
    );

    assert(
      frontier !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return frontier.payload;
  }

  /**
   * The witness of an overflow is the shortest prefix of the ordered sources
   * exceeding the bound. Sources within the bound witness no overflow.
   */
  public minimalOverflowWitness<T>(
    sources: T[],
    bound: DeviceAuthorizationOverflowBound<T>,
  ): T[] {
    const completeHistoryFits = bound.fitsReplayedHistory(sources);

    for (let length = 1; length <= sources.length; length += 1) {
      const witness = sources.slice(0, length);

      if (!this.fitsOverflowMeasure(bound, completeHistoryFits, witness)) {
        return witness;
      }
    }

    assert(false, new InvalidDeviceAuthorizationTransitionError());
  }

  /**
   * An overflow is admitted only for a minimal witness: non-empty, exceeding
   * the bound, and fitting it without its last source.
   */
  public isMinimalOverflowWitness<T>(
    sources: T[],
    bound: DeviceAuthorizationOverflowBound<T>,
  ): boolean {
    if (sources.length === 0) {
      return false;
    }

    const completeHistoryFits = bound.fitsReplayedHistory(sources);

    return (
      !(completeHistoryFits && bound.fitsSources(sources)) &&
      this.fitsOverflowMeasure(bound, completeHistoryFits, sources.slice(0, -1))
    );
  }

  /**
   * An overflow suspends the authorization replayed from its witness: every
   * credential is dropped and recovery is required past the latest revision
   * known from the witness or the frontier.
   */
  public suspendAtOverflow(
    replayed: DeviceAuthorization,
    frontierRevision: DeviceAuthorizationRevision,
  ): DeviceAuthorization {
    const replayedRevision = replayed.getRevision();
    const latestRevision = replayedRevision.isGreaterThan(frontierRevision)
      ? replayedRevision
      : frontierRevision;

    return replayed.requireRecoveryAt(latestRevision.next());
  }
}
