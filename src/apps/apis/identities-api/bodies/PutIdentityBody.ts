import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class PutIdentityBody {
  @IsString()
  public readonly id: string;

  @IsObject()
  public readonly encryptedKeyPair: {
    encryptedPrivateKey: string;
    publicKey: string;
  };

  @IsString()
  public readonly encryptedMasterKey: string;

  @IsObject()
  public readonly masterKeyDerivation: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  public readonly networks: string[];

  @IsObject()
  public readonly profile: {
    banner?: string;
    biography?: string;
    handle?: string;
    name: string;
    picture?: string;
  };

  @IsNumber()
  public readonly timestamp: number;

  @IsString()
  public readonly signature: string;

  @IsNumber()
  public readonly version: number;

  @IsOptional()
  @IsString()
  public readonly previousIdentityExternalIdentifier?: string;
}
