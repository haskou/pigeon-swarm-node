import { HttpError } from 'routing-controllers';

export default class CustomHttpError extends HttpError {
  private readonly _code: number;
  constructor(httpCode: number, code: number, message: string) {
    super(httpCode, message);
    this._code = code;
    Object.setPrototypeOf(this, CustomHttpError.prototype);
  }

  public get code(): number {
    return this._code;
  }
}
