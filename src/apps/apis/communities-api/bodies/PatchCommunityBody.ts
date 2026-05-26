import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PatchCommunityBody {
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
}
