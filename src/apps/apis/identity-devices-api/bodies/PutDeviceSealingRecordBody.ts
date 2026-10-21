import { IsString } from 'class-validator';

export class PutDeviceSealingRecordBody {
  @IsString()
  public readonly deviceCredential: string;

  @IsString()
  public readonly sealingPublicKey: string;

  @IsString()
  public readonly signature: string;

  @IsString()
  public readonly utcDay: string;
}
