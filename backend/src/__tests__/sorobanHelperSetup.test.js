'use strict';

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execSync: jest.fn(),
}));

// Mock @stellar/stellar-sdk so the helper can be loaded without the real SDK
jest.mock('@stellar/stellar-sdk', () => {
  const mockServer = { loadAccount: jest.fn(), submitTransaction: jest.fn() };
  return {
    Horizon: { Server: jest.fn(() => mockServer) },
    SorobanRpc: { Server: jest.fn(() => mockServer) },
    Keypair: { random: jest.fn(() => ({ publicKey: () => 'G_FAKE', secret: () => 'S_FAKE' })) },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    TransactionBuilder: jest.fn(),
    BASE_FEE: '100',
    Asset: { native: jest.fn() },
    Operation: { payment: jest.fn() },
  };
});

const { spawnSync, execSync } = require('child_process');
const soroban = require('./helpers/soroban');

describe('setupSandbox: no-op when container is already running', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure a fresh module-level state before each test
  });

  it('does not call spawnSync when _isSandboxRunning() returns true', async () => {
    // Stub execSync to simulate a running container
    execSync.mockReturnValue('true\n');

    await soroban.setupSandbox();

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('leaves _sandboxStartedByUs false when container was already running', async () => {
    execSync.mockReturnValue('true\n');

    await soroban.setupSandbox();

    expect(soroban._sandboxStartedByUs).toBe(false);
  });

  it('teardownSandbox does not call docker stop when _sandboxStartedByUs is false', async () => {
    execSync.mockReturnValue('true\n');

    await soroban.setupSandbox();
    // Clear mock call history so we can check teardown in isolation
    execSync.mockClear();

    await soroban.teardownSandbox();

    const dockerStopCalls = execSync.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('docker stop')
    );
    expect(dockerStopCalls).toHaveLength(0);
  });
});
