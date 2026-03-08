import CustomHttpError from '../CustomHttpError';

export default class UserDoesNotExistError extends CustomHttpError {
  constructor() {
    super(
      401,
      401006,
      "Invalid token in HTTP Header 'Authorization: Bearer <token>' 14",
    );
  }
}
