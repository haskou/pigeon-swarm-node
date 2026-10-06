import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import { ContentReplicationMaintenanceResult } from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintenanceResult';
import { Log } from '@app/shared/infrastructure/logs/Log';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentReplicationMaintenanceScheduler', () => {
  let logger: MockProxy<Log>;
  let maintainer: MockProxy<ContentReplicationMaintainer>;

  const result = (
    partial: Partial<ContentReplicationMaintenanceResult> = {},
  ): ContentReplicationMaintenanceResult => ({
    failedReplicas: 0,
    maintainedReplicas: 0,
    ...partial,
  });

  beforeEach(() => {
    logger = mock<Log>();
    maintainer = mock<ContentReplicationMaintainer>();
    new Kernel({ logger });
  });

  it('logs idle maintenance at debug level', async () => {
    maintainer.maintain.mockResolvedValue(result());

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.debug).toHaveBeenCalledWith(
      'Maintained content replication: maintained=0, failed=0',
    );
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs applied maintenance at info level', async () => {
    maintainer.maintain.mockResolvedValue(result({ maintainedReplicas: 1 }));

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.debug).toHaveBeenCalledWith(
      'Maintained content replication: maintained=1, failed=0',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs failed maintenance at warn level', async () => {
    maintainer.maintain.mockResolvedValue(result({ failedReplicas: 1 }));

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.warn).toHaveBeenCalledWith(
      'Maintained content replication: maintained=0, failed=1',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
