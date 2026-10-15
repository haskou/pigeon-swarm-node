import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostNodeBlockSourceApprovalBody {
  @IsInt()
  public readonly version!: number;

  @IsBoolean()
  public readonly all!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly blockedIdentityIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly blockedNodePeerIds?: string[];
}
