CREATE TABLE IF NOT EXISTS user_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  extension VARCHAR(16) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL DEFAULT 'agente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel_id VARCHAR(128) NOT NULL UNIQUE,
  caller_ext VARCHAR(32),
  callee_ext VARCHAR(32),
  status VARCHAR(16) DEFAULT 'ringing',
  started_at DATETIME,
  bridged_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS call_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel_id VARCHAR(128),
  caller_ext VARCHAR(32),
  callee_ext VARCHAR(32),
  started_at DATETIME,
  bridged_at DATETIME NULL,
  ended_at DATETIME,
  hangup_cause VARCHAR(64)
);

INSERT INTO user_extensions (username, extension, role) VALUES
  ('richard', '1001', 'agente'),
  ('companero2', '1002', 'agente');
