import { PresenceStatusValue } from './PresenceStatusValue';

export const presenceStatuses: Record<string, PresenceStatusValue> = {
  AVAILABLE: 'available',
  AWAY: 'away',
  BUSY: 'busy',
  CUSTOM: 'custom',
  DISCONNECTED: 'disconnected',
  INVISIBLE: 'invisible',
};
