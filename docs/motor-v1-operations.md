# Motor V1 — Guía operativa

## Arquitectura (resumen)

Pipeline de decisión + ejecución comercial: WHO/WHAT/WHEN → Plan → Approval1
humana → materializar → Draft → Approval2 humana → execution intent →
autorización económica humana (`motor_congelar_actor_economico`) → reserva +
dispatch atómico (`motor.reservar_y_preparar_dispatches_intent`) → worker →
provider → reconciliación económica.

## Worker topology

- **P2** (`YamaSend — Motor Execution Worker`, activo): procesa jobs **sin**
  dispatch asociado — el camino fake/legacy.
- **P4** (`YamaSend — Motor Dispatch Worker (P4)`, inactive por diseño):
  procesa exclusivamente jobs que **ya tienen** un dispatch (creado
  atómicamente). Dos modos:
  - **Cron** (schedule, inactive hasta habilitación comercial deliberada).
  - **MANUAL_SINGLE_JOB** (Form Trigger, claim dirigido por `job_id` exacto):
    herramienta operativa de tipo *break-glass / controlled operation*, no
    un camino de usuario normal.

`execution_dispatches` es la frontera estructural de ownership: un job nace
sin dispatch (P2) o con dispatch (P4), nunca ambos, y ningún mecanismo
cambia esa condición después de creado.

## Habilitar/deshabilitar YCloud (provider real)

- `motor.providers_permitidos` (`ycloud=true/false`) y `motor.canales.activo`
  del canal productivo son los dos flags que gobiernan si el pipeline puede
  llegar al nodo HTTP. Ambos deben estar en `true` simultáneamente para que
  un envío real sea posible; cualquiera en `false` lo bloquea.
- El nodo HTTP revalida el flag **dos veces**: una vez en el guard general
  (`Guard: provider habilitado`) y otra vez inmediatamente antes del HTTP
  (`Kill-switch inmediato YCloud`).

## Kill switch (ante incidente)

Apagar inmediatamente:
```sql
update motor.providers_permitidos set habilitado=false where provider='ycloud';
update motor.canales set activo=false where id='<canal productivo>';
```
Mantener el schedule de P4 inactive. Ninguna acción adicional detiene un
envío en curso más rápido que estos dos flags.

## AMBIGUOUS — regla absoluta

Un resultado `AMBIGUOUS` (timeout, 5xx, conexión perdida, 200 sin wamid, 200
con error embebido) **nunca** se reintenta automáticamente. El crédito
permanece reservado hasta reconciliación manual explícita. No existe ningún
mecanismo de retry en el pipeline.

## Manual single job

Uso: reclamar y continuar exactamente un job ya preparado atómicamente
(típicamente cuando el Cron de P4 sigue inactive por decisión de negocio).
Requiere el `job_id` exacto; cualquier formato inválido aborta sin tocar el
claim genérico. Nunca selecciona otro job.

## Economics

- `ACCEPTED` → consume el crédito (`usados += n`, `reservados -= n`).
- `REJECTED` → libera el crédito (`reservados -= n`, sin tocar `usados`).
- `AMBIGUOUS` → el crédito permanece reservado, sin liquidar.

Protegido contra doble efecto por `economic_verdict IS NULL` en el filtro de
liquidación, y contra saldo negativo por `GREATEST(...,0)`.

## Known limitations (deuda para V1.1/V2)

- **Delivery webhook**: Motor V1 certifica `ACCEPTED` (aceptación del
  provider), no un ciclo de vida de entrega formal (`SENT/DELIVERED/READ`).
  Diferido a V1.1 — ninguna lógica actual depende de delivery real.
- **Credencial YCloud multi-tenant**: la credencial de n8n es estática y
  hoy corresponde a un único tenant productivo. No existe un guard
  estructural de código que ate la credencial al canal/tenant antes del
  HTTP — la protección actual es que no existe ningún otro job real en el
  sistema con `provider=ycloud`. Bloqueante para multi-tenant real, no para
  el cierre funcional de V1 single-tenant.
- **Throughput P4**: procesa un job por tick (a diferencia de P2, que
  desenrolla varios) — adecuado para el volumen actual, revisar si escala.
- **ECIRCUITBREAKER infra**: episodios ocasionales de "too many
  authentication failures" en la conexión Postgres de n8n, siempre en el
  paso de claim (antes de cualquier mutación de negocio o HTTP), se
  autorrecuperan en 1-2 ciclos. Sin evidencia de pérdida de datos ni
  duplicación. Clasificado como infraestructura transitoria no bloqueante.
- **Camino de reserva en la UI productiva (`lib/actions/motor.ts`)**: sigue
  usando `motor_reservar_creditos_intent` (el contrato original, sin
  dispatch atómico) en vez de `motor.reservar_y_preparar_dispatches_intent`.
  Hoy sin riesgo operacional porque ningún componente productivo real
  (`MotorRecomendaciones.tsx`) está conectado a ninguna ruta del dashboard
  — Motor V1 completo sigue sin flujo de producción real invocándolo. Debe
  corregirse (lógica condicional por provider, preservando el camino fake
  intacto) antes de conectar Motor V1 a cualquier ruta real del dashboard.

## First real send (metadata, sin secretos)

- Fecha: 2026-09-19
- Resultado: `ACCEPTED`
- 1 llamada HTTP, 1 dispatch, 1 crédito consumido
- `wamid` presente y persistido
- Confirmación manual de recepción por el usuario autorizante
