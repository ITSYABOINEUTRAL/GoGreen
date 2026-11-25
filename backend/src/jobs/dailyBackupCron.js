'use strict';

/**
 * Daily backup at 00:00 UTC. Scheduled only in the jobs leader (RUN_JOBS=true), so API-only
 * instances do not each run a backup against the same database file (#247).
 */

const cron = require('node-cron');
const logger = require('../logger');
const { jobsEnabled } = require('./index');

/**
 * @param {{ env?: NodeJS.ProcessEnv, createBackup?: () => Promise<unknown> }} [opts]
 * @returns {boolean} true when the backup cron was scheduled
 */
function startDailyBackupCron({ env = process.env, createBackup } = {}) {
  if (!jobsEnabled(env)) return false;

  const backup = createBackup || require('../../scripts/backup').createBackup;
  cron.schedule('0 0 * * *', async () => {
    logger.info('Starting scheduled daily backup');
    try {
      await backup();
      logger.info('Daily backup completed successfully');
    } catch (error) {
      logger.error('Daily backup failed:', { error: error.message });
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  logger.info('Daily backup cron job scheduled at midnight UTC');
  return true;
}

module.exports = { startDailyBackupCron };
