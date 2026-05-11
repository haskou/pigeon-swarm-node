import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PatchNotificationBody {
  @IsOptional()
  @IsString()
  public readonly keychainExternalIdentifier?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['accepted', 'declined'])
  public readonly state: 'accepted' | 'declined';
}
