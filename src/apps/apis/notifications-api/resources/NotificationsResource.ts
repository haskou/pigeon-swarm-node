import { NotificationResource } from './NotificationResource';

export type NotificationsResource = {
  results: NotificationResource[];
  nextCursor: string | null;
};
