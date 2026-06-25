# Infraestructura Unificada de Comunicaciones y Gestión de Identidad

Prototipo que integra **Asterisk (PBX/VoIP + WebRTC)** con **midPoint (IAM)**, orquestado con
Docker, desplegado en un VPS con IP pública (AWS EC2), bajo estándares ISO/IEC 25010 e ISO 27001.

## Estado actual del proyecto

- ✅ Fase 1 (Planificación): repo, historias de usuario, docker-compose base.
- 🔄 Fase 2 (Diseño/Infra): Asterisk + midPoint + MariaDB corriendo en EC2. SIP/UDP funcionando
  entre extensiones. Pendiente: WebRTC (navegador) y panel de monitoreo de llamadas en tiempo real.

## Arquitectura
Softphones (Zoiper) / Navegadores (WebRTC)

│  SIP/UDP, WSS

┌──────────────▼──────────────────────┐

│   EC2 (Ubuntu) - IP pública          │

│  ┌────────────────────────────────┐  │

│  │ asterisk (andrius/asterisk:20) │  │  network_mode: host

│  │  PJSIP · AMI · WebRTC          │  │  (evita doble NAT -> audio OK)

│  └───────────┬────────────────────┘  │

│  ┌───────────▼────────────────────┐  │

│  │ call-monitor-backend (Node.js) │  │  escucha AMI, guarda en MariaDB

│  └───────────┬────────────────────┘  │

│  ┌───────────▼────────────────────┐  │

│  │ midpoint + db (MariaDB)        │  │  IAM, roles, repositorio

│  └────────────────────────────────┘  │

└───────────────────────────────────────┘
## Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| PBX/Telefonía | Asterisk 20 (imagen `andrius/asterisk`) | Enrutamiento SIP, WebRTC, AMI |
| Gestión de Identidad | midPoint (Evolveum) | IAM: RBAC, sincronización |
| Persistencia | MariaDB 10.6 | Repositorio midPoint + historial de llamadas |
| Monitoreo de llamadas | Node.js + AMI + Socket.io | "Quién llama a quién" en tiempo real |

## Cómo levantar el entorno

```bash
cp .env.example .env   # completar credenciales y la IP pública del servidor
docker compose up -d
```

## Estructura del repositorio
LaboratorioAsterisk/

├── docker-compose.yml

├── .env (no se sube, ver .gitignore)

├── asterisk/

│   ├── render-and-start.sh        # genera configs desde .template con envsubst

│   └── config/

│       ├── pjsip.conf.template    # SIP/WebRTC + corrección NAT (external_media_address)

│       ├── http.conf.template     # WSS para WebRTC

│       ├── manager.conf.template  # AMI (consumido por call-monitor-backend)

│       ├── rtp.conf.template      # rango RTP + STUN

│       ├── extensions.conf        # dialplan

│       ├── logger.conf / modules.conf

│       └── keys/                  # certificado TLS autofirmado (no se sube)

├── call-monitor-backend/          # Node.js: AMI -> MariaDB -> Socket.io

├── db/init/                       # esquema SQL (call_sessions, call_history, user_extensions)

└── docs/

└── user-stories.md
## Problema resuelto: audio sin sonido (NAT)

Causa: en Docker con red `bridge`, Asterisk anunciaba su IP interna en el SDP y el audio (RTP)
nunca llegaba al cliente externo. Solución aplicada:
- `network_mode: host` en el contenedor de Asterisk (sin doble NAT).
- `external_media_address` / `external_signaling_address` = IP pública real del servidor.
- Rango RTP completo publicado y coincidente entre Docker y `rtp.conf`.

## Próximos pasos

- Cliente WebRTC (navegador) para llamadas sin instalar softphone.
- Validar y exponer el panel de monitoreo de llamadas en tiempo real.
- Integración midPoint → Asterisk (provisión automática de extensiones por rol).

## Estándares aplicados

- ISO/IEC 25010: Fiabilidad, Seguridad, Mantenibilidad.
- ISO/IEC 27001: A.9.4.3 (gestión de secretos vía `.env`), A.13.1.1 (segmentación de red,
  AMI restringido a IPs internas), A.10.1 (TLS/WSS cifrado).
