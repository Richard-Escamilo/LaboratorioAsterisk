module.exports = {
  appendExtension: jest.fn(),
  extensionExists: jest.fn(() => false),
  updateExtensionPassword: jest.fn(),
  setCodecAllow: jest.fn(),
};
