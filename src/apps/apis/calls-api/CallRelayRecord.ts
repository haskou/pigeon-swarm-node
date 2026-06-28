import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';

export class CallRelayRecord {
  public constructor(
    private readonly payload: Omit<CallRelayRecordPrimitives, 'signature'>,
    private readonly signature: string,
  ) {}

  public toPrimitives(): CallRelayRecordPrimitives {
    return {
      ...this.payload,
      signature: this.signature,
    };
  }
}
