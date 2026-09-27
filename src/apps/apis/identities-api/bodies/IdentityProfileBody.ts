import { IsOptional, IsString } from 'class-validator';

export class IdentityProfileBody {
  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsOptional()
  @IsString()
  public readonly biography?: string;

  @IsOptional()
  @IsString()
  public readonly handle?: string;

  @IsString()
  public readonly name: string;

  @IsOptional()
  @IsString()
  public readonly picture?: string;
}
