const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR || "/asterisk-config";
const SOUNDS_DIR = path.join(CONFIG_DIR, "sounds");
const FINAL_WAV = path.join(SOUNDS_DIR, "parqueo_mensaje.wav");

function sanitizeText(text) {
  return text
    .slice(0, 300)
    .replace(/[^\p{L}\p{N}\s.,;:!?¡¿'-]/gu, "");
}

function generateParkingMessage(rawText) {
  const text = sanitizeText(rawText);
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const tempWav = path.join("/tmp", `parqueo_raw_${uniqueId}.wav`);

  return new Promise((resolve, reject) => {
    execFile("/usr/bin/espeak-ng", ["-v", "es", "-w", tempWav, text], (err) => {
      if (err) {
        fs.unlink(tempWav, () => {});
        return reject(new Error("Error generando audio: " + err.message));
      }
      execFile("/usr/bin/sox", [tempWav, "-r", "8000", "-c", "1", "-b", "16", FINAL_WAV], (err2) => {
        fs.unlink(tempWav, () => {});
        if (err2) return reject(new Error("Error convirtiendo audio: " + err2.message));
        resolve({ path: FINAL_WAV });
      });
    });
  });
}

module.exports = { generateParkingMessage };
