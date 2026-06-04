export type ValidationError = {
  property: string;
  value: string;
  constraints: string[];
  children: ValidationError[];
};
