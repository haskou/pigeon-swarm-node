export interface MLSRecordIdContent {
  epoch?: number;
  groupId: string;
  kind: string;
  payload: string;
  recipientIdentityId?: string;
}
