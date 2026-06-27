const MIDPOINT_BASE_URL = process.env.MIDPOINT_BASE_URL;
const MIDPOINT_USER = process.env.MIDPOINT_USER;
const MIDPOINT_PASSWORD = process.env.MIDPOINT_PASSWORD;

const ROLE_OIDS = {
  AgenteCallCenter: process.env.AGENTE_ROLE_OID,
  Supervisor: process.env.SUPERVISOR_ROLE_OID,
  Admin: process.env.ADMIN_ROLE_OID,
};

function basicAuthHeader() {
  const token = Buffer.from(`${MIDPOINT_USER}:${MIDPOINT_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

async function createUserInMidpoint({ username, fullName, password, role }) {
  const roleOid = ROLE_OIDS[role];
  if (!roleOid) throw new Error(`Rol desconocido: ${role}`);

  const xml = `<user xmlns='http://midpoint.evolveum.com/xml/ns/public/common/common-3'
      xmlns:t='http://prism.evolveum.com/xml/ns/public/types-3'>
  <name>${escapeXml(username)}</name>
  <fullName>${escapeXml(fullName || username)}</fullName>
  <credentials>
    <password>
      <value>
        <t:clearValue>${escapeXml(password)}</t:clearValue>
      </value>
    </password>
  </credentials>
  <assignment>
    <targetRef oid="${roleOid}" type="RoleType"/>
  </assignment>
</user>`;

  const res = await fetch(`${MIDPOINT_BASE_URL}/ws/rest/users`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/xml",
      Accept: "application/json",
    },
    body: xml,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    let message = text.slice(0, 500);
    try {
      const json = JSON.parse(text);
      function findDeepestMessage(obj) {
        if (!obj) return null;
        if (Array.isArray(obj.partialResults) && obj.partialResults.length > 0) {
          for (let i = obj.partialResults.length - 1; i >= 0; i--) {
            const deep = findDeepestMessage(obj.partialResults[i]);
            if (deep) return deep;
          }
        }
        return obj.message || null;
      }
      message = findDeepestMessage(json.object) || message;
    } catch (e) {
      // si no es JSON valido, dejamos el texto crudo recortado
    }
    throw new Error(`midPoint respondio ${res.status}: ${message}`);
  }
  return { status: res.status };
}

module.exports = { createUserInMidpoint };
