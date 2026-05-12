import { IsOptional, IsString } from 'class-validator';

export class PatchCommunityBody {
  @IsOptional()
  @IsString()
  public readonly avatar?: string;

  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;
}
