import { IsString } from 'class-validator';

export class PostCallSealedEntryBody {
  @IsString()
  public readonly envelope: string;

  @IsString()
  public readonly recipientDeviceCredential: string;
}
