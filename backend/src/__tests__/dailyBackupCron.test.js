'use strict';

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const cron = require('node-cron');
const logger = require('../logger');
const { startDailyBackupCron } = require('../jobs/dailyBackupCron');

describe('startDailyBackupCron', () => {
  let createBackup;

  beforeEach(() => {
    jest.clearAllMocks();
    createBackup = jest.fn().mockResolvedValue(undefined);
  });

  it('schedules the backup once at 00:00 UTC when RUN_JOBS=true', () => {
    const scheduled = startDailyBackupCron({ env: { RUN_JOBS: 'true' }, createBackup });

    expect(scheduled).toBe(true);
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function), {
      scheduled: true,
      timezone: 'UTC',
    });
  });

  it('does not schedule anything when RUN_JOBS is unset or not "true"', () => {
    expect(startDailyBackupCron({ env: {}, createBackup })).toBe(false);
    expect(startDailyBackupCron({ env: { RUN_JOBS: 'false' }, createBackup })).toBe(false);

    expect(cron.schedule).not.toHaveBeenCalled();
  });

  it('runs the backup when the scheduled task fires', async () => {
    startDailyBackupCron({ env: { RUN_JOBS: 'true' }, createBackup });
    const task = cron.schedule.mock.calls[0][1];

    await task();

    expect(createBackup).toHaveBeenCalledTimes(1);
  });

  it('logs the error and does not throw when the backup fails', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const failing = jest.fn().mockRejectedValue(new Error('disk full'));
    startDailyBackupCron({ env: { RUN_JOBS: 'true' }, createBackup: failing });
    const task = cron.schedule.mock.calls[0][1];

    try {
      await expect(task()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Daily backup failed:', { error: 'disk full' });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
