import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class PostCommunityInviteBody {
  @IsOptional()
  @IsNumber()
  public readonly expiresAt?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly maxUses?: number;
}
