import { IsBase64, IsOptional, IsString, Matches } from 'class-validator';

export class PostPublicImageBody {
  @IsString()
  @Matches(/^image\/[a-zA-Z0-9.+-]+$/)
  public readonly contentType: string;

  @IsString()
  @IsBase64()
  public readonly data: string;

  @IsOptional()
  @IsString()
  public readonly filename?: string;
}
