export type MongoIdentityPresenceDocument = {
  _id: string;
  customMessage?: string;
  identityId: string;
  lastActivityAt?: number;
  lastHeartbeatAt?: number;
  status: string;
  updatedAt: number;
};
