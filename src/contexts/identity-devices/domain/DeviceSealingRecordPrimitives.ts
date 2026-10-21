import { DeviceSealingRecordFields } from '@app/contexts/identity-devices/domain/DeviceSealingRecordFields';

export type DeviceSealingRecordPrimitives = {
  record: DeviceSealingRecordFields;
  signature: string;
};
