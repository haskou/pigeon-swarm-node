import { IsInt, IsOptional, Min } from 'class-validator';

export class PostNodeRegistrationCodeBody {
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly maxUses?: number;

  @IsInt()
  public readonly expiresAt!: number;
}
