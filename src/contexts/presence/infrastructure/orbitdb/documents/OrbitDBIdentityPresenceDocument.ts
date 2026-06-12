export type OrbitDBIdentityPresenceDocument = Record<string, unknown> & {
  customMessage?: string;
  id: string;
  identityId: string;
  lastActivityAt?: number;
  lastHeartbeatAt?: number;
  status: string;
  updatedAt: number;
};
