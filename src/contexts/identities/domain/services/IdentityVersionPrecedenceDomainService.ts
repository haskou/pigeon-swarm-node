export interface IdentityVersionCandidate {
  cid: string;
  identityId: string;
  version: number;
}

/**
 * Decides which stored versions of an identity supersede the others.
 */
export default class IdentityVersionPrecedenceDomainService {
  /**
   * Deduplicates by identity and cid, newest version first, ties broken by cid.
   */
  public newestFirst<T extends IdentityVersionCandidate>(documents: T[]): T[] {
    const deduplicated = new Map<string, T>();

    for (const document of documents) {
      deduplicated.set(`${document.identityId}:${document.cid}`, document);
    }

    return [...deduplicated.values()].sort((left, right) => {
      if (left.version !== right.version) {
        return right.version - left.version;
      }

      if (left.cid === right.cid) return 0;

      return left.cid < right.cid ? -1 : 1;
    });
  }

  /**
   * The newest version of each identity.
   */
  public latestPerIdentity<T extends IdentityVersionCandidate>(
    documents: T[],
  ): T[] {
    const latest = new Map<string, T>();

    for (const document of this.newestFirst(documents)) {
      if (!latest.has(document.identityId)) {
        latest.set(document.identityId, document);
      }
    }

    return [...latest.values()];
  }
}
