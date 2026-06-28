module.exports = {
  getActiveSessions: jest.fn(() => Promise.resolve([])),
  startCallSession: jest.fn(),
  markBridged: jest.fn(),
  endCallSession: jest.fn(),
  getGlobalDailyStats: jest.fn(() => Promise.resolve({})),
  getAvailabilityCount: jest.fn(() => Promise.resolve([])),
};
