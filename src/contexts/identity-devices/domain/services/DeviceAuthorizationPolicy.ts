import { Timestamp, assert } from '@haskou/value-objects';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationApplication } from '../DeviceAuthorizationApplication';
import { DeviceAuthorizationCandidate } from '../DeviceAuthorizationCandidate';
import { DeviceAuthorizationReplayResult } from '../DeviceAuthorizationReplayResult';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';
import { DeviceCompromiseCaps } from '../DeviceCompromiseCaps';
import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationEpoch } from '../value-objects/DeviceAuthorizationEpoch';
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
      group.candidates.sort((left, right) => {
        const operationOrder = left.transition
          .getOperationId()
          .compareTo(right.transition.getOperationId());

        return operationOrder || left.encoding.localeCompare(right.encoding);
      });
    }

    return groups;
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
   */
  public replayRecoveryLineage(
    genesis: DeviceAuthorization,
    recoveries: DeviceAuthorizationTransition[],
  ): {
    authorization: DeviceAuthorization;
    compromiseCaps: DeviceCompromiseCaps;
  } {
    let authorization = genesis;
    let compromiseCaps = DeviceCompromiseCaps.none();

    for (const recovery of recoveries) {
      authorization = this.applyRecoveryCheckpoint(authorization, recovery);

      const carried = DeviceCompromiseCaps.carriedBy(recovery);

      assert(
        compromiseCaps.isNotLoosenedBy(carried),
        new InvalidDeviceAuthorizationTransitionError(),
      );
      compromiseCaps = carried;
    }

    return { authorization, compromiseCaps };
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
}
