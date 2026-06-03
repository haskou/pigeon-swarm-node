export class InvalidNotificationLevelError extends Error {
  constructor(value: string) {
    super(`Invalid notification level: ${value}`);
  }
}
