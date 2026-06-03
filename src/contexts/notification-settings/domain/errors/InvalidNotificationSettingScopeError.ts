export class InvalidNotificationSettingScopeError extends Error {
  constructor(message: string) {
    super(`Invalid notification setting scope: ${message}`);
  }
}
