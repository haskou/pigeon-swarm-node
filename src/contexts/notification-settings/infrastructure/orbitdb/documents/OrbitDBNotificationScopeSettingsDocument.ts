import { OrbitDBNotificationSettingScopeDocument } from './OrbitDBNotificationSettingScopeDocument';

export type OrbitDBNotificationScopeSettingsDocument = Record<
  string,
  unknown
> & {
  hideMutedChannels: boolean;
  id: string;
  identityId: string;
  mobilePushEnabled: boolean;
  mutedUntil?: number | null;
  notificationLevel: string;
  removed?: boolean;
  scope: OrbitDBNotificationSettingScopeDocument;
  scopeKey: string;
  suppressEveryoneAndHere: boolean;
  suppressRoleMentions: boolean;
  updatedAt: number;
};
