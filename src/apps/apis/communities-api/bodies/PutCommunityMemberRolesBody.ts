import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class PutCommunityMemberRolesBody {
  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly roleIds: string[];
}
