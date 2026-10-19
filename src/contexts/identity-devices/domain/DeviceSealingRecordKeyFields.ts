import { DeviceSealingRecordFields } from '@app/contexts/identity-devices/domain/DeviceSealingRecordFields';

export type DeviceSealingRecordKeyFields = Pick<
  DeviceSealingRecordFields,
  'deviceCredential' | 'identityId' | 'utcDay'
>;
