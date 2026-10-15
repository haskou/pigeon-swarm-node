export interface NodeBlockSourceResource {
  appliedCount: number;
  autoApply: boolean;
  lastFetchedAt: number | null;
  lastFetchOutcome: string | null;
  origin: string;
  ownerIdentityId: string;
  pendingCount: number;
  version: number | null;
}
