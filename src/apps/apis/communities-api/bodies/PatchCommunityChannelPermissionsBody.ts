import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class PatchCommunityChannelPermissionsBody {
  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly visibleRoleIds: string[];
}
