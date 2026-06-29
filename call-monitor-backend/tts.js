const { execFile } = require("child_process");
const path = require("path");

const CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR || "/asterisk-config";
const SOUNDS_DIR = path.join(CONFIG_DIR, "sounds");
const TEMP_WAV = "/tmp/parqueo_raw.wav";
const FINAL_WAV = path.join(SOUNDS_DIR, "parqueo_mensaje.wav");

function sanitizeText(text) {
  return text
    .slice(0, 300)
    .replace(/[^\p{L}\p{N}\s.,;:!?¡¿'-]/gu, "");
}

function generateParkingMessage(rawText) {
  const text = sanitizeText(rawText);
  return new Promise((resolve, reject) => {
    execFile("espeak-ng", ["-v", "es", "-w", TEMP_WAV, text], (err) => {
      if (err) return reject(new Error("Error generando audio: " + err.message));
      execFile("sox", [TEMP_WAV, "-r", "8000", "-c", "1", "-b", "16", FINAL_WAV], (err2) => {
        if (err2) return reject(new Error("Error convirtiendo audio: " + err2.message));
        resolve({ path: FINAL_WAV });
      });
    });
  });
}

module.exports = { generateParkingMessage };
