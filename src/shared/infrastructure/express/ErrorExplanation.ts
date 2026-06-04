import { ValidationError } from './ValidationError';

export type ErrorExplanation = {
  errors?: Array<ValidationError>;
};
