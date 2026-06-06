export interface CommunityModerationLogTargetResource {
  id: string;
  type:
    | 'channel'
    | 'community'
    | 'invite'
    | 'member'
    | 'membership_request'
    | 'message'
    | 'role';
}
