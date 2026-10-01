import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { IdentityProfileBody } from './IdentityProfileBody';

export class PutIdentityBody {
  @IsEmpty()
  public readonly encryptedKeyPair?: never;

  @IsEmpty()
  public readonly encryptedMasterKey?: never;

  @IsEmpty()
  public readonly encryptedPrivateKey?: never;

  @IsEmpty()
  public readonly masterKeyDerivation?: never;

  @IsString()
  public readonly id: string;

  @IsInt()
  @Min(0)
  public readonly authorizationRevision: number;

  @IsString()
  public readonly deviceCredential: string;

  @IsString()
  public readonly deviceCredentialCommitment: string;

  @IsString()
  public readonly recoveryAuthority: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  public readonly networks: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => IdentityProfileBody)
  public readonly profile: IdentityProfileBody;

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
