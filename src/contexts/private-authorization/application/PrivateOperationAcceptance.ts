import { PrivateAuthorizationScope } from '../domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '../domain/PrivateControlOperation';

export interface PrivateOperationAcceptance {
  clearPendingOperationIds: string[];
  outbox: {
    eventName: string;
    id: string;
    payload: Record<string, unknown>;
  };
  projection: Record<string, unknown>;
  protectedMlsState?: string;
  receipt: PrivateControlOperation;
  replayMarkerId: string;
  reservation?: {
    authorDeviceKey: string;
    childHeadHash: string;
    operationId: string;
    parentHeadHash: string;
  };
  scope: PrivateAuthorizationScope;
}
