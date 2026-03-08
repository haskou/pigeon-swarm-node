import CustomHttpError from '../CustomHttpError';

export default class InvalidUsernameOrPasswordError extends CustomHttpError {
  constructor() {
    super(
      401,
      401003,
      'Invalid username or password in HTTP header' +
        "'Authorization: Basic base64(username:password)'",
    );
  }
}
