import { Response } from 'express';

export type ErrorResponseHandler = (
  error: Error,
  response: Response,
) => boolean;
