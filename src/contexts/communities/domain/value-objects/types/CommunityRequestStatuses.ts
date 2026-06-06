import { CommunityRequestStatusValue } from './CommunityRequestStatusValue';

export const communityRequestStatuses: Record<
  string,
  CommunityRequestStatusValue
> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
};
