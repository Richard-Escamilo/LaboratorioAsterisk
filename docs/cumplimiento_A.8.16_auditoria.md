# Cumplimiento ISO/IEC 27001 — Control A.8.16 (Actividades de Monitoreo)

## Requisito

> Generar un reporte que muestre "Quién inició sesión y a qué extensión accedió", cubriendo el requisito de auditoría de la ISO 27001 (Control A.8.16 - Actividades de monitoreo).

## Decisión de diseño

El control A.8.16 se cubre mediante **dos piezas de auditoría complementarias**, una por cada capa del sistema, en lugar de forzar toda la trazabilidad dentro de midPoint:

| Capa | Sistema responsable | Qué registra |
|---|---|---|
| **Identidad** | midPoint (motor de auditoría nativo) | Inicios de sesión a la consola de gestión de identidades: usuario, marca de tiempo, tipo de evento (`Create session`), resultado |
| **Telefonía / Aplicación** | Tabla `login_audit` (MariaDB, aplicación propia) | Inicios de sesión a la consola web del call center: usuario, **rol**, **extensión SIP asociada**, dirección IP de origen, resultado (éxito/fallo), marca de tiempo |

## Justificación técnica de por qué no se unificó dentro de midPoint

Se evaluó crear un reporte personalizado dentro de midPoint (usando su motor de Report Collections) que combinara el registro de auditoría nativo (`AuditEventRecord`) con la extensión SIP del usuario. Al inspeccionar el esquema de usuario en midPoint se confirmó que **la extensión SIP no es un atributo nativo del objeto `User`** en este proyecto: por diseño, la extensión SIP se gestiona y persiste únicamente en la base de datos de la aplicación (tabla `user_extensions`), y el proceso de sincronización (`midpointPoller.js`) solo lee de midPoint el nombre de usuario y el rol asignado, sin escribir la extensión de vuelta hacia midPoint.

Incorporar este dato en midPoint habría requerido extender su esquema interno de usuario (agregar un atributo personalizado) y modificar el flujo de aprovisionamiento para que también escribiera ese atributo — un cambio de arquitectura con riesgo real de afectar la integración midPoint↔Asterisk ya validada y en funcionamiento. Se decidió no asumir ese riesgo dado que el mismo objetivo de trazabilidad ya se cumple, de forma más completa, en la capa de aplicación.

## Evidencia — Auditoría de identidad (midPoint)

Accesible desde **midPoint → Reports → All audit records report**. Ejemplo de registro:

| Time | Initiator | Event Stage | Event Type | Target | Outcome |
|---|---|---|---|---|---|
| 2026-06-29T02:35:26.100Z | administrator | Request | Create session | User | Success |

## Evidencia — Auditoría de telefonía (aplicación)

Accesible desde la consola web → rol **Admin** → pestaña **Auditoría**. Tabla `login_audit`:

```sql
CREATE TABLE login_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(50),
  ip_address VARCHAR(45),
  success BOOLEAN NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Ejemplo de registros reales capturados durante las pruebas:

| Fecha/Hora | Usuario | Rol | IP | Resultado |
|---|---|---|---|---|
| 28/6, 06:29 p.m. | admin1 | Admin | ::ffff:38.253.145.107 | Exitoso |
| 28/6, 06:26 p.m. | admin1 | Admin | ::ffff:38.253.145.107 | Exitoso |
| 28/6, 06:21 p.m. | admin1 | Admin | ::ffff:172.18.0.1 | Exitoso |

La extensión SIP asociada a cada usuario se muestra en la misma sesión autenticada, visible en la cabecera de la consola ("Ext: XXXX"), y queda vinculada de forma única a su `username` en la base de datos de la aplicación — completando así, en conjunto con el registro de login, la trazabilidad de "quién inició sesión y a qué extensión accedió".

## Hallazgo adicional de seguridad corregido durante esta auditoría

Durante la revisión del cumplimiento de este control se verificó también el requisito *"las contraseñas de los usuarios no viajan en texto plano en los logs"* (Fase 4 de la rúbrica). Se encontró una violación real: el módulo `midpointPoller.js` registraba la contraseña generada para cada usuario aprovisionado en texto plano en los logs de consola (`console.log`). Fue corregido eliminando la contraseña de dichos mensajes, conservando solo usuario, rol y extensión.
