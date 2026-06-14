import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export class PublicRelayRecord {
  public constructor(
    private readonly payload: PublicRelayRecordPayload,
    private readonly signature: string,
  ) {}

  public toPrimitives(): PublicRelayRecordPrimitives {
    return {
      ...this.payload,
      signature: this.signature,
    };
  }
}
