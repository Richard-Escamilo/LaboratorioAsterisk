# Laboratorio de Integración de Sistemas — Infraestructura Unificada de Comunicaciones y Gestión de Identidad

Prototipo funcional de una plataforma de call center que integra una central telefónica de código abierto (**Asterisk**) con un sistema de gestión de identidades (**midPoint**), orquestados mediante contenedores Docker, bajo estándares de calidad **ISO/IEC 25010** y seguridad **ISO/IEC 27001**.

El sistema modela el escenario de una empresa de telecomunicaciones del sector financiero que necesita modernizar su plataforma de atención al cliente, unificando autenticación, telefonía, monitoreo y auditoría en una sola solución basada en microservicios.

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Características principales](#características-principales)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos previos](#requisitos-previos)
- [Instalación y despliegue](#instalación-y-despliegue)
- [Variables de entorno](#variables-de-entorno)
- [Uso por rol](#uso-por-rol)
- [Seguridad](#seguridad)
- [Monitoreo y observabilidad](#monitoreo-y-observabilidad)
- [Testing](#testing)
- [Calidad de código](#calidad-de-código)
- [Historias de usuario](#historias-de-usuario)
- [Documentación adicional](#documentación-adicional)
- [Mejoras futuras](#mejoras-futuras)

## Arquitectura

El flujo principal del sistema sigue el patrón **Registro de usuario → midPoint → Asterisk → Softphone**: un administrador crea un usuario desde la consola web, midPoint lo registra como fuente de identidad junto con su rol asignado, un proceso de sincronización (poller) detecta el nuevo usuario y provisiona automáticamente su extensión SIP en Asterisk, y finalmente el agente puede autenticarse con esas credenciales desde su softphone (web o tradicional).

```
Consola web (Admin) → Backend Node.js (API + AMI + poller) → midPoint (identidad) → Asterisk (PBX) → Softphone (WebRTC o SIP)
                                          ↓
                          Bases de datos (MariaDB + PostgreSQL)
```

Ver diagrama completo de arquitectura, puertos y flujo de datos en [`docs/diagrama_arquitectura.svg`](docs/diagrama_arquitectura.svg).

## Características principales

**Telefonía y comunicaciones**
- Softphone web (WebRTC) y soporte para softphones tradicionales (Zoiper, SIP sobre TLS)
- Grabación automática de llamadas, con reproducción desde el panel de Admin
- Widget flotante de llamada entrante/saliente, visible desde cualquier pestaña
- Parqueo de llamadas con mensaje de voz generado dinámicamente (texto a voz)
- Shaper de codec adaptativo: ajusta automáticamente la calidad de audio (ulaw → gsm) según la carga de llamadas activas en tiempo real

**Gestión de identidad y roles**
- midPoint como fuente de verdad para usuarios y roles (Agente, Supervisor, Admin)
- Aprovisionamiento automático de extensiones SIP en Asterisk vía API REST + AMI
- Panel de administración para crear/editar usuarios, sincronizado en tiempo real con midPoint y Asterisk

**Dashboards por rol**
- **Agente**: histórico de llamadas propias, métricas de hoy, gráficos por hora/día, tasa de atención
- **Supervisor**: vista del equipo, estado en línea/en llamada de cada agente, ranking
- **Admin**: métricas globales, ranking de agentes, disponibilidad, gestión de usuarios, grabaciones, auditoría

**Monitoreo de infraestructura**
- Métricas de negocio (llamadas activas, TMO, tasa de atención) vía Prometheus + Grafana
- Métricas de sistema (CPU, RAM, disco, red) vía node-exporter
- Métricas por contenedor Docker vía cAdvisor
- Script de prueba de carga para simular llamadas concurrentes y observar el comportamiento del sistema bajo estrés

**Seguridad**
- TLS obligatorio en señalización SIP (puerto 5061) para todas las extensiones
- Auditoría de inicio de sesión (usuario, rol, IP, resultado) — cumplimiento ISO 27001 control A.8.16
- Rate limiting contra fuerza bruta en el login
- Headers de seguridad HTTP (CSP, HSTS, X-Frame-Options, etc.) vía `helmet`
- Generación de contraseñas con `crypto.randomBytes` (criptográficamente seguras)
- Validación de formato en datos antes de construir URLs hacia servicios externos
- Análisis estático de código con SonarCloud (Quality Gate: Passed)
- Análisis de vulnerabilidades en imágenes Docker con Trivy
- Pruebas de penetración básicas documentadas (ver `docs/pentesting_basico.md`)

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Telefonía (PBX) | Asterisk 20 |
| Gestión de identidad | midPoint 4.x |
| Backend | Node.js + Express |
| Frontend | HTML/CSS/JS vanilla + JsSIP + Chart.js (servidos localmente, sin CDN externo) |
| Bases de datos | MariaDB 10.6 (aplicación), PostgreSQL 15 (midPoint) |
| Monitoreo | Prometheus, Grafana, node-exporter, cAdvisor |
| Testing | Jest (unitarias + integración) |
| Calidad de código | SonarCloud |
| Análisis de vulnerabilidades | Trivy |
| Orquestación | Docker + Docker Compose |
| Texto a voz | espeak-ng + sox |

## Estructura del repositorio

```
LaboratorioAsterisk/
├── docker-compose.yml
├── .env.example
├── sonar-project.properties
├── asterisk/
│   ├── render-and-start.sh
│   └── config/                  # pjsip.conf, extensions.conf, res_parking.conf, keys/, sounds/
├── call-monitor-backend/
│   ├── index.js                 # servidor Express + endpoints REST
│   ├── amiClient.js             # cliente AMI (Asterisk Manager Interface)
│   ├── db.js                    # acceso a MariaDB
│   ├── shaper.js                # shaper de codec adaptativo
│   ├── tts.js                   # generación de mensajes de voz
│   ├── midpointAdmin.js         # integración REST con midPoint
│   ├── midpointPoller.js        # sincronización periódica midPoint → Asterisk
│   ├── metrics.js               # métricas Prometheus
│   └── __tests__/               # pruebas unitarias e integración
├── webrtc-client/
│   ├── index.html
│   ├── vendor/                  # jssip y chart.js servidos localmente (con SRI)
│   └── *.js                     # módulos por funcionalidad (auth, softphone, dashboards, etc.)
├── db/init/                      # esquema SQL inicial
├── prometheus/
├── grafana/provisioning/
├── trivy-reports/                # reportes de análisis de vulnerabilidades
└── docs/                         # documentación de cumplimiento y seguridad
```

## Requisitos previos

- Docker y Docker Compose
- Un servidor con IP pública (para que los softphones puedan conectarse) o entorno de red accesible
- Puertos abiertos: 22 (SSH), 3000 (Grafana), 4000 (backend), 5061 (SIP/TLS), 8080 (midPoint), 8089 (WSS), 8443 (consola web), 9090 (Prometheus), 9100 (node-exporter), 8085 (cAdvisor)

## Instalación y despliegue

```bash
git clone https://github.com/Richard-Escamilo/LaboratorioAsterisk.git
cd LaboratorioAsterisk
cp .env.example .env
# Editar .env con los valores correspondientes (ver siguiente sección)
docker compose up -d --build
```

La consola web debe iniciarse manualmente (no está dentro de Docker Compose, ya que actúa como servidor estático con TLS propio):

```bash
cd webrtc-client
nohup python3 serve_https.py > server.log 2>&1 &
```

Acceso:
- Consola web: `https://<tu-ip>:8443`
- midPoint: `http://<tu-ip>:8080/midpoint`
- Grafana: `http://<tu-ip>:3000`
- Prometheus: `http://<tu-ip>:9090`

## Variables de entorno

Ver `.env.example` para la lista completa. Las más relevantes:

```
PUBLIC_IP=                  # IP pública del servidor
DB_NAME=, DB_USER=, DB_PASSWORD=, DB_ROOT_PASSWORD=
PG_PASSWORD=
AMI_PASSWORD=
MIDPOINT_BASE_URL=, MIDPOINT_USER=, MIDPOINT_PASSWORD=
AGENTE_ROLE_OID=, SUPERVISOR_ROLE_OID=, ADMIN_ROLE_OID=
JWT_SECRET=
FRONTEND_ORIGIN=            # origen permitido para CORS
GRAFANA_PASSWORD=
```

## Uso por rol

| Rol | Acceso a | Funciones principales |
|---|---|---|
| Agente | Dashboard, Teléfono, Histórico | Recibir/realizar llamadas, ver sus métricas, aparcar/recoger llamadas |
| Supervisor | + Mi equipo | Ver estado y métricas de los agentes a su cargo |
| Admin | + Usuarios, Grabaciones, Parqueo, Auditoría | Gestión completa de usuarios, configuración del mensaje de parqueo, auditoría de accesos |

### Historia de usuario de referencia
> *"Como agente, quiero autenticarme con mi usuario sincronizado desde midPoint para recibir llamadas en mi extensión asignada."*

Ver listado completo en [Historias de usuario](#historias-de-usuario).

## Seguridad

Resumen del cumplimiento ISO 27001 implementado:

| Control | Implementación |
|---|---|
| Cifrado de comunicaciones | TLS en señalización SIP (puerto 5061); WSS + DTLS-SRTP en WebRTC |
| Autenticación centralizada | midPoint como fuente única de identidad y roles |
| Auditoría (A.8.16) | Tabla `login_audit` con usuario, rol, IP y resultado; ver `docs/cumplimiento_A.8.16_auditoria.md` |
| Gestión de contraseñas | Hash con bcrypt; generación con `crypto.randomBytes`; nunca en texto plano en logs |
| Protección ante fuerza bruta | Rate limiting (10 intentos / 5 min) en login |
| Cabeceras de seguridad | `helmet` en backend; headers manuales en consola web |
| Análisis de vulnerabilidades | Trivy sobre las 7 imágenes del proyecto — ver `docs/analisis_vulnerabilidades_docker.md` |
| Pruebas de penetración | nmap, fuerza bruta, inyección SQL — ver `docs/pentesting_basico.md` |

## Monitoreo y observabilidad

Dashboards de Grafana incluidos (auto-provisionados):
- **Call Center — Métricas en vivo**: llamadas activas, totales del día, contestadas, TMO, agentes en línea
- **Infraestructura — CPU/RAM/Disco/Red**: métricas del servidor y por contenedor
- **Shaper de Codec**: tier actual (FULL/MIXED/DOWNGRADED), codec activo, llamadas activas reales

## Testing

```bash
cd call-monitor-backend
npm install
npm test                  # pruebas unitarias (mocks de DB/AMI)
npm run test:integration  # pruebas contra el sistema real corriendo (requiere Docker Compose activo)
```

- **17 pruebas unitarias**: lógica del shaper de codec y del poller de midPoint
- **7 pruebas de integración**: login, autorización por rol, métricas, salud del sistema

## Calidad de código

Análisis continuo con **SonarCloud**: [ver proyecto](https://sonarcloud.io/project/overview?id=Richard-Escamilo_LaboratorioAsterisk)

- Quality Gate: **Passed**
- 8 hallazgos de seguridad identificados y corregidos (CORS, generación de contraseñas, usuario no-root en contenedores, sanitización de comandos, Subresource Integrity, validación de URLs, archivos temporales predecibles, TLS débil)

## Historias de usuario

- Como **agente**, quiero autenticarme con mi usuario sincronizado desde midPoint para recibir llamadas en mi extensión asignada.
- Como **agente**, quiero aparcar una llamada para que cualquier compañero disponible pueda recogerla.
- Como **supervisor**, quiero ver en tiempo real qué agentes de mi equipo están en línea o en llamada.
- Como **administrador**, quiero crear usuarios desde una sola consola y que su extensión SIP se aprovisione automáticamente.
- Como **administrador**, quiero auditar quién inició sesión, desde qué IP y con qué resultado, para cumplir con los requisitos de trazabilidad de ISO 27001.
- Como **administrador**, quiero ver el consumo de recursos del sistema en tiempo real para anticipar problemas de capacidad.

## Documentación adicional

| Documento | Contenido |
|---|---|
| `docs/cumplimiento_A.8.16_auditoria.md` | Justificación del cumplimiento del control de auditoría ISO 27001 |
| `docs/analisis_vulnerabilidades_docker.md` | Resultados del escaneo Trivy en las 7 imágenes del proyecto |
| `docs/pentesting_basico.md` | Pruebas de penetración realizadas y correcciones aplicadas |
| `docs/diagrama_arquitectura.svg` | Diagrama de arquitectura, puertos y flujo de datos |
| `trivy-reports/` | Reportes detallados CVE por CVE de cada imagen |

## Mejoras futuras

- Reporte de auditoría nativo desde midPoint vinculando sesión + extensión SIP (requiere extender el esquema de usuario de midPoint)
- Restricción por IP de los puertos de administración (Grafana, Prometheus, midPoint) a una lista de confianza
- Cifrado de audio (SRTP) interoperable entre extensiones WebRTC y SIP tradicionales
- Migración a imágenes base más recientes para Asterisk y PostgreSQL (reducir vulnerabilidades heredadas del sistema operativo)

