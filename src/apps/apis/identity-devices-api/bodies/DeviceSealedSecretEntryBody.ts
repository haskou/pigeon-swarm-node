import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class DeviceSealedSecretEntryBody {
  @IsString()
  @IsNotEmpty()
  public readonly recipientCredential: string;

  @IsString()
  @Matches(/^[A-Za-z0-9+/=.-]{1,4096}$/)
  public readonly sealedSecret: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
