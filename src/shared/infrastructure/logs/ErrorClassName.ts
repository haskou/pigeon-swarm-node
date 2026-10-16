/**
 * Names a caught value for a log line without its message or stack.
 *
 * Exception messages can carry identity ids, record keys, addresses or
 * payload fragments, so application logs record only the error class.
 */
export function errorClassName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
