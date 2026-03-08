import CustomHttpError from '../CustomHttpError';

export default class UserHasNoPermissionError extends CustomHttpError {
  constructor(username: string) {
    super(403, 403000, `User ${username} has no permission to read routes`);
  }
}
