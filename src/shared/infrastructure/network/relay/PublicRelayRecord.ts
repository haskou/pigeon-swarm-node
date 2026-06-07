import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';

export class PublicRelayRecord {
  public constructor(
    private readonly payload: PublicRelayRecordPayload,
    private readonly signature: string,
  ) {}

  public toPrimitives() {
    return {
      ...this.payload,
      signature: this.signature,
    };
  }
}
