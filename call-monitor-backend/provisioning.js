const { appendExtension, extensionExists } = require("./provisionPjsip");
const db = require("./db");
const ami = require("./amiClient");

const NEEDS_EXTENSION = { AgenteCallCenter: true, Supervisor: true, Admin: false };

// Aprovisiona a un usuario con una contraseña YA CONOCIDA (texto plano).
// Si el rol necesita extension SIP, la crea de inmediato (sin esperar al poller).
async function provisionUserWithKnownPassword(username, password, role) {
  const exists = await db.userExtensionExists(username);
  if (exists) {
    return { skipped: true, reason: "El usuario ya tenia una extension/registro" };
  }

  if (NEEDS_EXTENSION[role]) {
    const extension = await db.getNextAvailableExtension();
    if (extensionExists(String(extension))) {
      throw new Error(`La extension ${extension} ya existe en Asterisk (colision)`);
    }
    appendExtension(String(extension), password);
    await db.addUserExtensionWithPassword(username, String(extension), role, password);
    await ami.reloadPjsip();
    await new Promise((r) => setTimeout(r, 1500));
    return { extension };
  } else {
    await db.addUserExtensionWithPassword(username, null, role, password);
    return { extension: null };
  }
}

module.exports = { provisionUserWithKnownPassword };
