require('./config'); // validate env vars before anything else
const { validateStellarConfig } = require('./utils/stellar-config');
validateStellarConfig(); // fail fast on missing Stellar/Soroban config
const app = require('./app');
const db = require('./db/schema');
const logger = require('./logger');
const { startJobs } = require('./jobs');
const cron = require('node-cron');
const { startSubscriptionJob } = require('./jobs/processSubscriptions');
const { startFailedEmailCleanupJob } = require('./jobs/cleanupFailedEmails');
const { startProductViewsAggJob } = require('./jobs/aggregateProductViews');
const { startFreshnessJob } = require('./jobs/processFreshnessAlerts');
const { startContractMonitor } = require('./jobs/contractMonitor');
const { startContractRegistrySync } = require('./jobs/contractRegistrySync');
const { startCreatorEarningsMonitor } = require('./jobs/creatorEarningsMonitor');
const { startPushSubscriptionCleanup } = require('./jobs/cleanupPushSubscriptions');
const { startExpiryJob } = require('./jobs/deactivateExpiredProducts');
const { startAnonymizeJob } = require('./jobs/anonymizeDeactivatedUsers');
const { startAuctionJob } = require('./jobs/auctionCron');
const { start: startPaymentConfirmationJob } = require('./jobs/confirmPayments');
const { createBackup } = require('./scripts/backup');

const PORT = process.env.PORT || 4000;
/** Bound for server.close(); must stay below PM2 kill_timeout (5000). */
const CLOSE_TIMEOUT_MS = 4000;

function installGracefulShutdown(server) {
  const shutdown = (signal) => {
    logger.info(`Received ${signal}, closing HTTP server`);
    const force = setTimeout(() => {
      logger.error('Forced exit after close timeout');
      process.exit(1);
    }, CLOSE_TIMEOUT_MS);
    force.unref?.();
    server.close(() => {
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  await db.ready;
  const server = app.listen(PORT, () => {
    logger.info(`Backend running on http://localhost:${PORT}`);
    if (typeof app.locals.startBackgroundJobs === 'function') {
      app.locals.startBackgroundJobs();
    } else {
      startJobs();
    }
    startSubscriptionJob();
    startFailedEmailCleanupJob();
    startProductViewsAggJob();
    startFreshnessJob();
    startContractMonitor();
    startContractRegistrySync();
    startCreatorEarningsMonitor();
    startPushSubscriptionCleanup();
    startAnonymizeJob();
    startExpiryJob();
    startAuctionJob();
    startPaymentConfirmationJob();

    cron.schedule('0 0 * * *', async () => {
      logger.info('Starting scheduled daily backup');
      try {
        await createBackup();
        logger.info('Daily backup completed successfully');
      } catch (error) {
        logger.error('Daily backup failed:', { error: error.message });
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('Daily backup cron job scheduled at midnight UTC');
  });

  installGracefulShutdown(server);
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('Backend startup failed:', { error: error.message });
    process.exitCode = 1;
  });
}

module.exports = { start, CLOSE_TIMEOUT_MS, installGracefulShutdown };
