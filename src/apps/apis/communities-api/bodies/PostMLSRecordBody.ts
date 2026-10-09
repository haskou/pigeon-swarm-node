import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PostMLSRecordBody {
  @IsInt()
  @Min(0)
  public createdAt!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  public epoch?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public groupId!: string;

  @IsIn(['commit', 'key_package', 'welcome'])
  public kind!: string;

  @IsObject()
  public mutation!: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  @MaxLength(262_144)
  public payload!: string;

  @IsOptional()
  @IsString()
  public recipientIdentityId?: string;
}
