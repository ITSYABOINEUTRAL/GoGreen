const router = require('express').Router();
const { checkSorobanRPC } = require('../utils/stellar');
const db = require('../db/schema');
const cache = require('../cache');
const config = require('../config');

// Basic health check
router.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

// Comprehensive health check with external dependencies
router.get('/health/detailed', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check Soroban RPC health using shared client
    const sorobanHealth = await checkSorobanRPC();
    
    const overallResponseTime = Date.now() - startTime;
    const isHealthy = sorobanHealth.status === 'healthy';
    
    const response = {
      status: isHealthy ? 'ok' : 'degraded',
      responseTime: overallResponseTime,
      timestamp: new Date().toISOString(),
      version: 'v1',
      services: {
        soroban: sorobanHealth
      }
    };
    
    // Return 200 for healthy, 503 for unhealthy
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(response);
    
  } catch (error) {
    const overallResponseTime = Date.now() - startTime;
    res.status(503).json({
      status: 'error',
      responseTime: overallResponseTime,
      timestamp: new Date().toISOString(),
      version: 'v1',
      error: error.message,
      services: {
        soroban: {
          status: 'error',
          error: error.message
        }
      }
    });
  }
});

// Readiness probe — reports DB, cache and Stellar configuration state
router.get('/health/ready', async (req, res) => {
  const result = {
    database: { status: 'unknown' },
    cache: { status: 'unknown' },
    stellar: { status: 'unknown' },
  };

  // Database probe
  try {
    await db.query('SELECT 1');
    result.database.status = 'ready';
  } catch (e) {
    result.database.status = 'unavailable';
    result.database.error = e.message;
  }

  // Cache probe
  if (!config.redisUrl) {
    result.cache.status = 'disabled';
  } else if (cache.isReady()) {
    result.cache.status = 'ready';
  } else {
    result.cache.status = 'unavailable';
  }

  // Stellar / Soroban configuration probe
  const stellarConfigured = !!(
    config.stellarNetwork &&
    config.sorobanEscrowContractId
  );
  result.stellar.status = stellarConfigured ? 'configured' : 'missing';
  if (!stellarConfigured) {
    result.stellar.detail = 'SOROBAN_ESCROW_CONTRACT_ID or STELLAR_NETWORK not set';
  }

  // 503 when any required dependency is unavailable
  const isReady = result.database.status === 'ready';
  res.status(isReady ? 200 : 503).json(result);
});

module.exports = router;