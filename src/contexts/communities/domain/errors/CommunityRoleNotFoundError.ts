export class CommunityRoleNotFoundError extends Error {
  constructor() {
    super('Community role not found');
  }
}
