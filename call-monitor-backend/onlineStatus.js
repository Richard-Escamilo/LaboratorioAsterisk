const status = new Map();

function setStatus(extension, isOnline) {
  status.set(String(extension), isOnline);
}

function isOnline(extension) {
  return status.get(String(extension)) || false;
}

module.exports = { setStatus, isOnline };
