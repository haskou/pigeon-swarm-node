import { IdentityCandidate } from '../IdentityCandidate';
import { ProfileHandle } from '../value-objects/ProfileHandle';

interface HandleClaim {
  claimedAt: number;
  identityId: string;
  latest: IdentityCandidate;
}

/**
 * Earliest-signed-wins ownership of a profile handle. Among identities whose
 * latest version claims the handle, the owner is the one with the smallest
 * (claimedAt, identityId), where claimedAt is the minimum signed timestamp of
 * that identity's known versions claiming the handle. The result depends only
 * on the set of candidates, never on the order they are provided in.
 */
export default class IdentityHandleOwnershipDomainService {
  private compare(left: string, right: string): number {
    if (left < right) return -1;

    return left > right ? 1 : 0;
  }

  private latestOf(candidates: IdentityCandidate[]): IdentityCandidate {
    return [...candidates].sort(
      (left, right) =>
        right.getIdentity().toPrimitives().version -
          left.getIdentity().toPrimitives().version ||
        this.compare(
          left.getExternalIdentifier().valueOf(),
          right.getExternalIdentifier().valueOf(),
        ),
    )[0];
  }

  private groupByIdentity(
    candidates: IdentityCandidate[],
  ): Map<string, IdentityCandidate[]> {
    const groups = new Map<string, IdentityCandidate[]>();

    for (const candidate of candidates) {
      const identityId = candidate.getIdentity().toPrimitives().id;

      groups.set(identityId, [...(groups.get(identityId) ?? []), candidate]);
    }

    return groups;
  }

  private claimOf(
    identityId: string,
    versions: IdentityCandidate[],
    handle: ProfileHandle,
  ): HandleClaim | undefined {
    const latest = this.latestOf(versions);

    if (!latest.hasHandle(handle)) {
      return undefined;
    }

    const claimedAt = Math.min(
      ...versions
        .filter((version) => version.hasHandle(handle))
        .map((version) => version.getIdentity().toPrimitives().timestamp),
    );

    return { claimedAt, identityId, latest };
  }

  /** Latest candidate of every claimant, best claim first. */
  public rank(
    candidates: IdentityCandidate[],
    handle: ProfileHandle,
  ): IdentityCandidate[] {
    return [...this.groupByIdentity(candidates)]
      .map(([identityId, versions]) =>
        this.claimOf(identityId, versions, handle),
      )
      .filter((claim): claim is HandleClaim => claim !== undefined)
      .sort(
        (left, right) =>
          left.claimedAt - right.claimedAt ||
          this.compare(left.identityId, right.identityId),
      )
      .map(({ latest }) => latest);
  }

  public owner(
    candidates: IdentityCandidate[],
    handle: ProfileHandle,
  ): IdentityCandidate | undefined {
    return this.rank(candidates, handle)[0];
  }
}
