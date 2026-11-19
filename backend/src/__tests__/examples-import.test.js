'use strict';

jest.mock('../db/schema', () => ({ query: jest.fn() }));
jest.mock('../services/AutomaticOrderProcessor', () => jest.fn());
jest.mock('../services/WaitlistService', () => jest.fn());

const path = require('path');
const db = require('../db/schema');
const AutomaticOrderProcessor = require('../services/AutomaticOrderProcessor');
const WaitlistService = require('../services/WaitlistService');

const examplesDir = path.join(__dirname, '../examples');

// validation-demo.js is not included: it registers its describe() block when required,
// which would run its scenario matrix inside this test file.
describe('example scripts at import time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['automatic-order-usage.js', 'waitlist-usage.js'])(
    'requires %s without querying the db, constructing services or starting timers',
    (file) => {
      expect(() => require(path.join(examplesDir, file))).not.toThrow();

      expect(db.query).not.toHaveBeenCalled();
      expect(AutomaticOrderProcessor).not.toHaveBeenCalled();
      expect(WaitlistService).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    }
  );
});
