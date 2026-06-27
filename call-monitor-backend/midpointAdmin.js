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

async function findUserOidByUsername(username) {
  const res = await fetch(`${MIDPOINT_BASE_URL}/ws/rest/users`, {
    headers: { Authorization: basicAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`midPoint respondio ${res.status} al buscar usuarios`);
  const data = await res.json();
  const users = (data.object && data.object.object) || [];
  const list = Array.isArray(users) ? users : [users];
  const found = list.find((u) => (typeof u.name === "string" ? u.name : u.name["#text"]) === username);
  if (!found) throw new Error(`Usuario "${username}" no encontrado en midPoint`);
  return found.oid;
}

async function updateUserInMidpoint({ username, oldRole, newRole, newPassword }) {
  const oid = await findUserOidByUsername(username);
  const deltas = [];

  if (newRole && newRole !== oldRole) {
    const oldOid = ROLE_OIDS[oldRole];
    const newOid = ROLE_OIDS[newRole];
    if (oldOid) {
      deltas.push(`<api:itemDelta>
        <api:modificationType>delete</api:modificationType>
        <api:path>assignment</api:path>
        <api:value><c:targetRef oid="${oldOid}" type="c:RoleType"/></api:value>
      </api:itemDelta>`);
    }
    if (newOid) {
      deltas.push(`<api:itemDelta>
        <api:modificationType>add</api:modificationType>
        <api:path>assignment</api:path>
        <api:value><c:targetRef oid="${newOid}" type="c:RoleType"/></api:value>
      </api:itemDelta>`);
    }
  }

  if (newPassword) {
    deltas.push(`<api:itemDelta>
      <api:modificationType>replace</api:modificationType>
      <api:path>credentials/password/value</api:path>
      <api:value><t:clearValue>${escapeXml(newPassword)}</t:clearValue></api:value>
    </api:itemDelta>`);
  }

  if (deltas.length === 0) return { status: "sin-cambios" };

  const xml = `<api:objectModification xmlns:api='http://midpoint.evolveum.com/xml/ns/public/common/api-types-3'
      xmlns:c='http://midpoint.evolveum.com/xml/ns/public/common/common-3'
      xmlns:t='http://prism.evolveum.com/xml/ns/public/types-3'>
    ${deltas.join("\n")}
  </api:objectModification>`;

  const res = await fetch(`${MIDPOINT_BASE_URL}/ws/rest/users/${oid}`, {
    method: "PATCH",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/xml", Accept: "application/json" },
    body: xml,
  });

  if (!res.ok) {
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
    } catch (e) {}
    throw new Error(`midPoint respondio ${res.status} al modificar: ${message}`);
  }
  return { status: "actualizado" };
}

module.exports.updateUserInMidpoint = updateUserInMidpoint;
