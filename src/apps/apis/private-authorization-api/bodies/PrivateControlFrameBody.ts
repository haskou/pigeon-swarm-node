import { IsString, MaxLength } from 'class-validator';

export class PrivateControlFrameBody {
  @IsString()
  @MaxLength(1_398_102)
  public readonly encryptedMlsState: string;

  @IsString()
  @MaxLength(349_526)
  public readonly mlsMessage: string;

  @IsString()
  @MaxLength(262_144)
  public readonly signedTransitionJson: string;
}
