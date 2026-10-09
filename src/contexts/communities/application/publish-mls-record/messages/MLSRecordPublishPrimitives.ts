export interface MLSRecordPublishPrimitives {
  authorIdentityId: string;
  communityId: string;
  createdAt: number;
  epoch?: number;
  groupId: string;
  kind: string;
  mutation: unknown;
  payload: string;
  recipientIdentityId?: string;
}
