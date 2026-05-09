import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class PostKeychainBody {
  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsOptional()
  @IsString()
  public readonly previousKeychainExternalIdentifier?: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;

  @IsInt()
  public readonly timestamp: number;

  @IsInt()
  @Min(1)
  public readonly version: number;
}
