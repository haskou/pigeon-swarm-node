export class InvalidNotificationSettingScopeTypeError extends Error {
  constructor(value: string) {
    super(`Invalid notification setting scope type: ${value}`);
  }
}
