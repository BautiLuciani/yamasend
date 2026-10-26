# Perfil del negocio

Sección **Perfil** del menú principal. Es la fuente de verdad de lo que la IA
sabe del negocio (la misma que usan los templates y el agente: "Datos de la
empresa"). Se completa de tres formas:

1. **A mano:** cuadros de texto y lista de productos editable.
2. **Solo, desde los chats:** un workflow de n8n investiga las conversaciones del
   dueño y llena las celdas **vacías**. Nunca pisa lo que el usuario escribió; si
   detecta algo distinto de lo ya cargado, lo ofrece como sugerencia ("Usar esto"
   / "Ignorar").
3. **Con el asistente o con archivos:** el diálogo y la importación (PDF, Excel
   `.xlsx`, Word `.docx`, CSV, imagen) devuelven una *propuesta* que se revisa y
   se aplica con un click.

## Piezas

| Pieza | Dónde |
|---|---|
| Sección del menú | `components/yamasend/Perfil.tsx` (ruteo en `AppShell.tsx`, ítem en `Sidebar.tsx` / `MobileDrawer.tsx`) |
| Editor de productos (compartido con Mi perfil) | `components/yamasend/ProductosEditor.tsx` |
| Tabla `yamas_send_perfil_negocio` + RPC `..._decidir` | `docs/perfil-negocio-migracion.sql` |
| Función `yamas_send_perfil_negocio_autocompletar` | `docs/perfil-negocio-autocompletar.sql` |
| Workflow n8n **YamaSend — Perfil del negocio (IA)** (`ZPhPbXx6WmgGqs6y`) | `yamasai.app.n8n.cloud`, webhook `yamasend-perfil-negocio` |
| Disparo automático | el worker "Análisis inicial" (`SLr3uZMKqJAVL8zt`) lo llama al terminar (nodo "Generar perfil del negocio") |
| Lectura, asistente y aplicar propuestas | `lib/actions/perfil_negocio.ts` |
| Importación de archivos | `lib/actions/perfil_importar.ts` |
| Fusión de productos (lógica pura) | `lib/perfil/fusion.ts` — prueba: `node --experimental-strip-types scripts/test-perfil-fusion.mts` |

## Análisis de los chats (n8n)

1. Webhook con `{ tenant_id, origen }`. El `tenant_id` sale de la sesión en el servidor.
2. **Reserva** la fila (`generando`) y un IF corta el flujo si no se reservó. No corre dos
   veces a la vez (se destraba a los 10 min) y las llamadas automáticas
   (`origen = analisis_inicial`) no regeneran un perfil de menos de 6 horas.
   Ojo: un Postgres `executeQuery` sin filas emite igual `{success:true}`, por eso la
   reserva devuelve un booleano (`SELECT EXISTS(...)`) y no se confía en "sin filas".
3. Toma de `yamas_send_mensajes_historico` los mensajes del dueño (priorizando los que
   traen cifras) y los de clientes que mencionan lugares.
4. Extrae por tandas con `gpt-4o-mini` (esquema JSON estricto, citas textuales) y
   consolida con `gpt-4o`.
5. Post-proceso: descarta citas genéricas y precios menores a 10, y acota la confianza.
6. Guarda `estado = listo` (o `error`; `sin_conversaciones` si hay menos de 8 mensajes útiles).
7. **Completa los datos de la empresa:** `yamas_send_perfil_negocio_autocompletar`.

### Qué vuelca al perfil

- Solo celdas **vacías** y solo con confianza >= 0.5.
- Productos: solo agrega los que no existen (match por nombre sin acentos ni
  mayúsculas), nunca modifica los cargados.
- Cada campo llenado queda como `aplicado` en `decisiones`, y la UI muestra
  "Completado desde tus chats".
- No toca cuentas que pertenecen a una organización (ahí los datos los administra la empresa).
- Es idempotente: correrla de nuevo no agrega nada.

## Asistente e importación

`conversarPerfilAction` devuelve una respuesta y, si corresponde, una `PropuestaPerfil`.
`importarArchivoPerfilAction` lee el archivo (PDF e imágenes directo a GPT-4o; Word,
Excel y CSV se convierten a texto en el servidor) y devuelve otra propuesta. Se aplican con
`aplicarPropuestaPerfilAction`, que lee los datos actuales en el servidor y guarda por
`actualizarDatosNegocioAction` (el mismo camino que el formulario). Si hay cambios sin
guardar en pantalla, la UI pide guardarlos antes para no pisarlos.

Límites: archivos de hasta 7 MB; de Word/Excel/CSV se leen ~60.000 caracteres; Excel `.xls` y
Word `.doc` (formatos viejos) no se soportan: hay que guardarlos como `.xlsx` / `.docx`.

Regla de fusión de productos: se matchea por nombre; un dato vacío nunca borra uno cargado;
lo nuevo va al final; máximo 200.

## Pendiente conocido

La pantalla Mi perfil > Datos de la empresa sigue usando el workflow "Analizar Catálogo
de Productos con IA" (`fDhyd3uUDyTIkM9O`) para su botón "Subir catálogo con IA". Ese
workflow está **inactivo** (el webhook responde 404). La sección Perfil ya no depende de él.
