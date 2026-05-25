import { IsInt, IsString } from 'class-validator';

export class EncryptedCommunityInviteKeyBody {
  @IsString()
  public readonly algorithm: string;

  @IsString()
  public readonly ciphertext: string;

  @IsString()
  public readonly nonce: string;

  @IsInt()
  public readonly version: number;
}
