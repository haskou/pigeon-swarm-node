export type IdentityPresenceWasUpdatedAttributes = {
  customMessage?: string;
  identityId: string;
  lastActivityAt?: number;
  lastHeartbeatAt?: number;
  networkIds: string[];
  status: string;
  updatedAt: number;
};
