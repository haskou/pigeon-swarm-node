import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class CommunityRoleBody {
  @IsString()
  public readonly name: string;

  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly permissions: string[];
}
