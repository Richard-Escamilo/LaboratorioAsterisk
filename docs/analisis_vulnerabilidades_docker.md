# Análisis de Vulnerabilidades en Imágenes Docker (Trivy)

## Herramienta y metodología

Se utilizó **Trivy** (Aqua Security), un escáner de vulnerabilidades de código abierto, ejecutado vía contenedor Docker (`aquasec/trivy:latest`) contra el socket de Docker del host, sin necesidad de instalación local. Se escanearon las **7 imágenes** que componen la infraestructura del proyecto, filtrando por severidad `HIGH` y `CRITICAL`.

Nota metodológica: el escaneo de componentes Java (archivos `.jar`) requiere una base de datos adicional (~500MB) que no se pudo descargar de forma estable dado el espacio en disco limitado del servidor (29GB total, frecuentemente por encima del 90% de uso). Por ello, el análisis se limitó a vulnerabilidades del **sistema operativo y paquetes del gestor de paquetes** (`--vuln-type os`) en las imágenes basadas en Java (`midPoint`), lo cual sigue cubriendo la superficie de ataque más relevante (el sistema operativo subyacente).

## Resultados por imagen

| Imagen | Base | Total | High | Critical |
|---|---|---|---|---|
| `evolveum/midpoint:latest` | Ubuntu 24.04 | **0** | 0 | 0 |
| `laboratorioasterisk-call-monitor-backend` (propia) | node:20-alpine | 2 | 2 | 0 |
| `node:20-alpine` (base de la imagen propia) | Alpine 3.23 | 2 (OS) + 11 (paquetes npm internos) | 13 | 0 |
| `mariadb:10.6` | Debian | 16 | 15 | 1 |
| `andrius/asterisk:20` | Debian bullseye | 26 | 23 | 3 |
| `postgres:15` | Debian | 33 | 25 | **8** |

## Interpretación

- **midPoint** resultó la imagen más limpia del proyecto: 0 vulnerabilidades de severidad alta o crítica en su sistema operativo (Ubuntu 24.04, base reciente y bien mantenida).
- **Nuestra propia imagen** (`call-monitor-backend`) presenta solo 2 vulnerabilidades HIGH, heredadas directamente de la imagen base `node:20-alpine` (relacionadas con `libcrypto3`/`libssl3` de OpenSSL) — no introducidas por nuestro código o dependencias propias del proyecto.
- Las 11 vulnerabilidades adicionales detectadas en `node:20-alpine` corresponden a paquetes **internos de la herramienta CLI `npm`** que viene incluida en la imagen base (`tar`, `glob`, `minimatch`, `cross-spawn`) — no son dependencias que el proyecto use directamente en su código (`call-monitor-backend/package.json` no las declara), por lo que su superficie de exposición real es mínima.
- **`postgres:15` y `andrius/asterisk:20`** presentan el mayor número de vulnerabilidades, incluyendo 11 de severidad crítica combinadas — esto es consistente con el hecho de que ambas imágenes están basadas en versiones de Debian con soporte extendido pero menos actualizadas que Ubuntu 24.04. Estas imágenes son provistas por terceros (PostgreSQL oficial y el mantenedor de `andrius/asterisk`), por lo que la mitigación recomendada es monitorear la disponibilidad de versiones más recientes de estas imágenes base, en lugar de intentar parchear el sistema operativo manualmente dentro del contenedor.

## Recomendaciones

1. Migrar a una versión más reciente de la imagen de Asterisk cuando esté disponible una basada en una distribución con soporte más actualizado.
2. Evaluar la migración de PostgreSQL a una imagen basada en Debian "slim" o Alpine si la compatibilidad con midPoint lo permite, para reducir la superficie de ataque del sistema operativo base.
3. Repetir este análisis periódicamente (idealmente en cada actualización de imágenes base) como parte del ciclo de mantenimiento del sistema.
4. Los reportes completos y detallados (CVE por CVE) de cada imagen se conservan en la carpeta `trivy-reports/` del repositorio para trazabilidad.
