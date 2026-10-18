import { Call } from '../../domain/Call';

export class CallStartResult {
  constructor(
    public readonly call: Call,
    public readonly created: boolean,
  ) {}
}
