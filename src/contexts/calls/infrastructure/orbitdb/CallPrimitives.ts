import { Call } from '@app/contexts/calls/domain/Call';

export type CallPrimitives = ReturnType<Call['toPrimitives']>;
