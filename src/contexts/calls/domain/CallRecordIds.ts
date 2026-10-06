/** Record ids of the signed call events: they are derived, never chosen. */
export class CallRecordIds {
  public static start(callId: string): string {
    return `call:${callId}`;
  }

  public static participant(callId: string, identityId: string): string {
    return `call-participant:${callId}:${identityId}`;
  }

  public static end(callId: string): string {
    return `call-end:${callId}`;
  }
}
