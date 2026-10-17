/** What a startup purge of non-canonical identity ids changed, as counts only. */
export interface NonCanonicalIdentityIdsPurge {
  ownerCleared: boolean;
  removedEntries: number;
  ownListNonCanonicalEntries: number;
}
