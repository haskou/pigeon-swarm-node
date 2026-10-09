export interface OrbitDBMLSRecordDocument extends Record<string, unknown> {
  id: string;
  authorIdentityId: string;
  communityId: string;
  createdAt: number;
  epoch?: number;
  groupId: string;
  kind: string;
  payload: string;
  recipientIdentityId?: string;
}
