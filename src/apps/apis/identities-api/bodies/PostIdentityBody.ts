import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostIdentityBody {
  @IsOptional()
  @IsString()
  public readonly id?: string;

  @IsOptional()
  @IsString()
  public readonly name?: string;

  @IsOptional()
  @IsString()
  public readonly handle?: string;

  @IsOptional()
  @IsString()
  public readonly password?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  public readonly networks?: string[];

  @IsOptional()
  @IsObject()
  public readonly encryptedKeyPair?: {
    encryptedPrivateKey: string;
    publicKey: string;
  };

  @IsOptional()
  @IsObject()
  public readonly profile?: {
    biography?: string;
    handle?: string;
    name: string;
    picture?: string;
  };

  @IsOptional()
  @IsNumber()
  public readonly timestamp?: number;

  @IsOptional()
  @IsString()
  public readonly signature?: string;

  @IsOptional()
  @IsNumber()
  public readonly version?: number;

  @IsOptional()
  @IsString()
  public readonly previousIdentityExternalIdentifier?: string;
}
