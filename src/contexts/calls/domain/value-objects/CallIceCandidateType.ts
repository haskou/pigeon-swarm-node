import { Enum } from '@haskou/value-objects';

const candidateTypes = {
  HOST: 'host',
  PRFLX: 'prflx',
  RELAY: 'relay',
  SRFLX: 'srflx',
} as const;

export class CallIceCandidateType extends Enum<string> {
  public static fromPrimitives(value: string): CallIceCandidateType {
    return new CallIceCandidateType(value);
  }

  public getValues(): string[] {
    return Object.values(candidateTypes);
  }

  public isRelay(): boolean {
    return this.isEqual(new CallIceCandidateType(candidateTypes.RELAY));
  }
}
