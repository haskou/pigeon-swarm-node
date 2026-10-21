import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * A page of a device-authorization transition log, every entry exactly as its author signed it.
 */
export class DeviceAuthorizationTransitionDisclosure {
  private readonly recoveries: DeviceAuthorizationTransition[];
  private readonly concurrentRecoveries: DeviceAuthorizationTransition[];
  private readonly transitions: DeviceAuthorizationTransition[];

  public constructor(
    private readonly identityId: IdentityId,
    recoveries: DeviceAuthorizationTransition[],
    concurrentRecoveries: DeviceAuthorizationTransition[],
    transitions: DeviceAuthorizationTransition[],
    private readonly nextCursor?: DeviceAuthorizationRevision,
  ) {
    this.recoveries = [...recoveries];
    this.concurrentRecoveries = [...concurrentRecoveries];
    this.transitions = [...transitions];
  }

  /**
   * One page of entries above the cursor, whole revisions at a time in
   * ascending revision order, so a revision never splits across pages. The
   * first revision is always served, even when it alone exceeds the limit, so
   * a reader always advances. The next cursor is the last revision served, or
   * none when the log is exhausted.
   */
  public page(
    cursor: DeviceAuthorizationRevision,
    limit: number,
  ): DeviceAuthorizationTransitionDisclosure {
    const landsAfter = (transition: DeviceAuthorizationTransition): boolean =>
      transition.getRevision().isGreaterThan(cursor);
    const byRevision = (
      a: DeviceAuthorizationTransition,
      b: DeviceAuthorizationTransition,
    ): number => a.getRevision().compareTo(b.getRevision());
    const recoveries = this.recoveries.filter(landsAfter).sort(byRevision);
    const concurrentRecoveries = this.concurrentRecoveries
      .filter(landsAfter)
      .sort(byRevision);
    const transitions = this.transitions.filter(landsAfter).sort(byRevision);
    const revisions = [
      ...new Set(
        [...recoveries, ...concurrentRecoveries, ...transitions].map(
          (transition) => transition.getRevision().valueOf(),
        ),
      ),
    ].sort((a, b) => a - b);
    const countAt = (revision: number): number =>
      [...recoveries, ...concurrentRecoveries, ...transitions].filter(
        (transition) => transition.getRevision().valueOf() === revision,
      ).length;
    let served = 0;
    let lastRevision: number | undefined;

    for (const revision of revisions) {
      if (lastRevision !== undefined && served + countAt(revision) > limit) {
        break;
      }
      served += countAt(revision);
      lastRevision = revision;
    }
    const included = (transition: DeviceAuthorizationTransition): boolean =>
      lastRevision !== undefined &&
      transition.getRevision().valueOf() <= lastRevision;
    const hasMore =
      lastRevision !== undefined &&
      revisions[revisions.length - 1] > lastRevision;

    return new DeviceAuthorizationTransitionDisclosure(
      this.identityId,
      recoveries.filter(included),
      concurrentRecoveries.filter(included),
      transitions.filter(included),
      hasMore && lastRevision !== undefined
        ? new DeviceAuthorizationRevision(lastRevision)
        : undefined,
    );
  }

  /** The cursor of the next page, or none once the log is exhausted. */
  public getNextCursor(): DeviceAuthorizationRevision | undefined {
    return this.nextCursor;
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getRecoveries(): DeviceAuthorizationTransition[] {
    return [...this.recoveries];
  }

  public getConcurrentRecoveries(): DeviceAuthorizationTransition[] {
    return [...this.concurrentRecoveries];
  }

  public getTransitions(): DeviceAuthorizationTransition[] {
    return [...this.transitions];
  }
}
