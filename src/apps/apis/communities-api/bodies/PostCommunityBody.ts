import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class PostCommunityBody {
  @IsOptional()
  @IsBoolean()
  public readonly autoJoinEnabled?: boolean;

  @IsOptional()
  @IsString()
  public readonly avatar?: string;

  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsOptional()
  @IsBoolean()
  public readonly discoverable?: boolean;

  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;

  @IsString()
  public readonly networkId: string;

  @IsOptional()
  @IsIn(['private', 'public'])
  public readonly visibility?: string;
}
