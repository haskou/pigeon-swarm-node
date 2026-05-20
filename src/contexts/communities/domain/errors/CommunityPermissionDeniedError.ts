import { DomainError } from '@haskou/value-objects';

export class CommunityPermissionDeniedError extends DomainError {
  constructor(permission: string) {
    super(`Community permission denied: ${permission}`);
  }
}
