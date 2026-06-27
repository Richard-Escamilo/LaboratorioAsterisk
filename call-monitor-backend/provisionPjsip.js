const fs = require("fs");
const path = require("path");

const CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR || "/asterisk-config";
const PJSIP_LIVE = path.join(CONFIG_DIR, "pjsip.conf");
const PJSIP_TEMPLATE = path.join(CONFIG_DIR, "pjsip.conf.template");

function extensionExists(extension) {
  const content = fs.readFileSync(PJSIP_TEMPLATE, "utf8");
  return content.includes(`[${extension}](webrtc-endpoint-base)`) ||
         content.includes(`[${extension}](endpoint-base)`);
}

function buildBlock(extension, password) {
  return `\n[${extension}](webrtc-endpoint-base)\nauth=auth${extension}\naors=${extension}\n\n[auth${extension}](auth-base)\nusername=${extension}\npassword=${password}\n\n[${extension}](aor-base)\n`;
}

function appendExtension(extension, password) {
  if (extensionExists(extension)) {
    throw new Error(`La extension ${extension} ya existe`);
  }
  const block = buildBlock(extension, password);
  fs.appendFileSync(PJSIP_TEMPLATE, block);
  fs.appendFileSync(PJSIP_LIVE, block);
}

module.exports = { appendExtension, extensionExists };

function updateExtensionPassword(extension, newPassword) {
  for (const file of [PJSIP_LIVE, PJSIP_TEMPLATE]) {
    const content = fs.readFileSync(file, "utf8");
    const re = new RegExp(`(\\[auth${extension}\\]\\([^)]*\\)\\nusername=${extension}\\npassword=)[^\\n]*`);
    if (!re.test(content)) continue;
    const updated = content.replace(re, `$1${newPassword}`);
    fs.writeFileSync(file, updated);
  }
}

module.exports.updateExtensionPassword = updateExtensionPassword;
