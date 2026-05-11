import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class PatchNotificationBody {
  @IsOptional()
  @IsBoolean()
  public readonly archive?: boolean;

  @IsOptional()
  @IsString()
  public readonly keychainExternalIdentifier?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'accepted', 'declined'])
  public readonly state?: 'pending' | 'accepted' | 'declined';

  @IsOptional()
  @IsString()
  @IsIn(['read', 'unread'])
  public readonly status?: 'read' | 'unread';
}
