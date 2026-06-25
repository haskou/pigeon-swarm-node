import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import { ContentReplicationMaintenanceResult } from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintenanceResult';
import Kernel from '@haskou/ddd-kernel';
import Log from '@app/shared/infrastructure/logs/Log';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentReplicationMaintenanceScheduler', () => {
  let logger: MockProxy<Log>;
  let maintainer: MockProxy<ContentReplicationMaintainer>;

  const result = (
    partial: Partial<ContentReplicationMaintenanceResult> = {},
  ): ContentReplicationMaintenanceResult => ({
    claimedReplicas: 0,
    failedClaims: 0,
    failedReleases: 0,
    releasedReplicas: 0,
    ...partial,
  });

  beforeEach(() => {
    logger = mock<Log>();
    maintainer = mock<ContentReplicationMaintainer>();
    (Kernel as unknown as { _logs: Log })._logs = logger;
  });

  it('logs idle maintenance at debug level', async () => {
    maintainer.maintain.mockResolvedValue(result());

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.debug).toHaveBeenCalledWith(
      'Maintained content replication: claimed=0, released=0, failedClaims=0, failedReleases=0',
    );
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs applied maintenance at info level', async () => {
    maintainer.maintain.mockResolvedValue(result({ claimedReplicas: 1 }));

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.info).toHaveBeenCalledWith(
      'Maintained content replication: claimed=1, released=0, failedClaims=0, failedReleases=0',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs failed maintenance at warn level', async () => {
    maintainer.maintain.mockResolvedValue(result({ failedClaims: 1 }));

    await new ContentReplicationMaintenanceScheduler(maintainer).execute();

    expect(logger.warn).toHaveBeenCalledWith(
      'Maintained content replication: claimed=0, released=0, failedClaims=1, failedReleases=0',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
