import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * Every device-authorization state this node can replay for one identity, from
 * the replay base (genesis or the latest recovery checkpoint) up to the head.
 * It answers whether a device was authorized at the revision a signed record
 * claims, instead of at the current head: a later revocation never reaches
 * back before its own revision, a revision above the head (not replicated yet)
 * is never trusted, and neither is one below the base (a recovery discards the
 * chain it replaced).
 */
export class DeviceAuthorizationTimeline {
  private readonly states: DeviceAuthorization[];

  public constructor(states: DeviceAuthorization[]) {
    this.states = [...states].sort(
      (left, right) =>
        left.getRevision().valueOf() - right.getRevision().valueOf(),
    );
  }

  /** Whether the head already reaches the claimed revision. */
  public hasReached(revision: DeviceAuthorizationRevision): boolean {
    const head = this.states.at(-1);

    return head !== undefined && !revision.isGreaterThan(head.getRevision());
  }

  public isAuthorizedAt(
    credential: DeviceCredential,
    revision: DeviceAuthorizationRevision,
  ): boolean {
    if (!this.hasReached(revision)) {
      return false;
    }

    const state = this.states.findLast(
      (candidate) => !candidate.getRevision().isGreaterThan(revision),
    );

    return state?.isAuthorized(credential) ?? false;
  }
}
