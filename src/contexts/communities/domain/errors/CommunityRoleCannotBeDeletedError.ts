export class CommunityRoleCannotBeDeletedError extends Error {
  constructor() {
    super('Built-in community roles cannot be deleted');
  }
}
