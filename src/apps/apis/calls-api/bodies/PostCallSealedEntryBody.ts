import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { IsString, MaxLength } from 'class-validator';

export class PostCallSealedEntryBody {
  @IsString()
  @MaxLength(CallSignal.MAX_ENVELOPE_LENGTH)
  public readonly envelope: string;

  @IsString()
  @MaxLength(CallSignal.MAX_CREDENTIAL_LENGTH)
  public readonly recipientDeviceCredential: string;
}
