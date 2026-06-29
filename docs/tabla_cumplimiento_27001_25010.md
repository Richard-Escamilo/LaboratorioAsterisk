# Análisis de Cumplimiento: Componentes vs. ISO 27001 / ISO 25010

Tabla de relación entre cada componente implementado del sistema, la cláusula de **ISO/IEC 27001:2022** (Anexo A) que cubre, y la característica de calidad de **ISO/IEC 25010** que demuestra.

| Componente | Cláusula ISO 27001 | Justificación | Característica ISO 25010 | Justificación |
|---|---|---|---|---|
| Redes internas de Docker (`lab-net`) | A.8.20 — Seguridad de redes | Los contenedores se comunican entre sí en una red bridge aislada, no expuesta directamente a Internet salvo los puertos explícitamente publicados | Seguridad — Confidencialidad | El tráfico entre servicios internos (BD, backend, Asterisk) no es accesible desde fuera del host |
| TLS en señalización SIP (puerto 5061) | A.8.24 — Uso de criptografía | Las credenciales y metadatos de las llamadas viajan cifrados entre softphones y Asterisk | Seguridad — Confidencialidad | Protege contra intercepción de tráfico SIP en tránsito |
| midPoint (gestión de identidad y roles) | A.5.15 — Control de acceso | Fuente única de verdad para usuarios y roles (Agente/Supervisor/Admin), aplicando control de acceso basado en roles (RBAC) | Funcionalidad — Completitud funcional | Centraliza la gestión de identidad en lugar de credenciales dispersas por sistema |
| Tabla `login_audit` (auditoría de login) | A.8.16 — Actividades de monitoreo | Registra usuario, rol, IP y resultado de cada intento de inicio de sesión | Seguridad — Auditabilidad | Permite reconstruir quién accedió al sistema, cuándo y con qué resultado |
| Rate limiting en `/api/login` | A.8.16 — Actividades de monitoreo | Limita a 10 intentos cada 5 minutos por IP, mitigando ataques de fuerza bruta detectados en las pruebas de penetración | Fiabilidad — Tolerancia a fallos | El sistema se mantiene disponible y protegido ante intentos de abuso del endpoint de autenticación |
| Hashing de contraseñas (bcrypt) + generación con `crypto.randomBytes` | A.8.24 — Uso de criptografía | Las contraseñas nunca se almacenan ni transmiten en texto plano; se generan con un generador criptográficamente seguro | Seguridad — Confidencialidad | Evita exposición de credenciales incluso ante una fuga de base de datos |
| Headers de seguridad HTTP (`helmet`, CSP, HSTS) | A.8.26 — Requisitos de seguridad de las aplicaciones | Cabeceras que mitigan XSS, clickjacking y fuerza la negociación HTTPS | Seguridad — Resistencia a ataques | Reduce la superficie de ataque del lado del cliente sin cambios en la lógica de negocio |
| Consultas parametrizadas (`mysql2`, prepared statements) | A.8.28 — Codificación segura | Verificado empíricamente en pentesting: payloads de inyección SQL fueron rechazados sin error | Seguridad — Integridad | Previene la manipulación no autorizada de datos vía inyección SQL |
| SonarCloud (análisis estático de código) | A.8.28 — Codificación segura | Detección automática de vulnerabilidades de código en cada análisis; Quality Gate aprobado | Mantenibilidad — Analizabilidad | Facilita identificar y corregir defectos de código de forma temprana y sistemática |
| Trivy (análisis de vulnerabilidades en imágenes Docker) | A.8.8 — Gestión de vulnerabilidades técnicas | Escaneo de las 7 imágenes del proyecto, identificando CVEs conocidos por severidad | Seguridad — Confidencialidad/Integridad | Permite priorizar la actualización de imágenes base con vulnerabilidades críticas |
| Usuario no-root en contenedor del backend | A.8.2 — Derechos de acceso privilegiados | El proceso de la aplicación corre con el usuario `node` (no root), limitando el impacto de una posible vulnerabilidad explotada | Seguridad — Confidencialidad | Reduce el alcance de un compromiso del contenedor al no tener privilegios de administrador |
| Pruebas unitarias e integración (Jest) | A.8.25 — Ciclo de vida de desarrollo seguro | 17 pruebas unitarias + 7 de integración validan reglas de negocio y comportamiento real del sistema antes de cada despliegue | Fiabilidad — Madurez | Reduce la probabilidad de defectos funcionales en producción |
| Prometheus + Grafana (monitoreo) | A.8.16 — Actividades de monitoreo | Visibilidad en tiempo real de métricas de negocio (llamadas, TMO) y de infraestructura (CPU, RAM, red) | Eficiencia de desempeño — Capacidad | Permite detectar cuellos de botella y anticipar saturación de recursos |
| Grabación de llamadas y CDR | A.8.16 — Actividades de monitoreo | Cada llamada queda registrada con duración, participantes y archivo de audio | Funcionalidad — Completitud funcional | Cubre el requisito de trazabilidad operativa de un call center |
| Volúmenes Docker persistentes (BD, grabaciones, configuración) | A.8.13 — Copias de seguridad de la información | Los datos de MariaDB, PostgreSQL y las grabaciones persisten fuera del ciclo de vida de los contenedores | Fiabilidad — Recuperabilidad | Los datos sobreviven a un reinicio o recreación de contenedores |
| Shaper de codec adaptativo | — (no aplica directamente a 27001) | — | Eficiencia de desempeño — Comportamiento temporal | El sistema ajusta automáticamente la calidad de audio según la carga, manteniendo capacidad de respuesta bajo estrés |
| Pruebas de carga (script `load-test.js`) | — (no aplica directamente a 27001) | — | Eficiencia de desempeño — Capacidad | Permite verificar empíricamente cuántas llamadas concurrentes soporta el servidor antes de degradar el servicio |

## Resumen por característica ISO 25010 cubierta

| Característica | Componentes que la demuestran |
|---|---|
| Funcionalidad | midPoint (RBAC), grabación de llamadas y CDR |
| Eficiencia de desempeño | Prometheus/Grafana, shaper de codec, pruebas de carga |
| Fiabilidad | Rate limiting, pruebas unitarias/integración, volúmenes persistentes |
| Seguridad | TLS, redes Docker, bcrypt, helmet, SonarCloud, Trivy, usuario no-root, prepared statements |
| Mantenibilidad | SonarCloud (Quality Gate Passed) |

## Resumen por cláusula ISO 27001 cubierta

| Cláusula | Descripción | Componentes |
|---|---|---|
| A.5.15 | Control de acceso | midPoint (RBAC) |
| A.8.2 | Derechos de acceso privilegiados | Usuario no-root en Docker |
| A.8.8 | Gestión de vulnerabilidades técnicas | Trivy |
| A.8.13 | Copias de seguridad de la información | Volúmenes persistentes |
| A.8.16 | Actividades de monitoreo | `login_audit`, rate limiting, Prometheus/Grafana, CDR |
| A.8.20 | Seguridad de redes | Red interna Docker |
| A.8.24 | Uso de criptografía | TLS en SIP, bcrypt, `crypto.randomBytes` |
| A.8.25 | Ciclo de vida de desarrollo seguro | Jest (unitarias + integración) |
| A.8.26 | Requisitos de seguridad de las aplicaciones | `helmet`, CSP, HSTS |
| A.8.28 | Codificación segura | Prepared statements, SonarCloud |
