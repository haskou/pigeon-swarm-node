export class MLSRecordDocumentId {
  public static of(communityId: string, recordId: string): string {
    return `community:${communityId}:mls:${recordId}`;
  }
}
