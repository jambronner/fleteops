# FleteOps

**Software bilingüe de conciliación logística para revisar evidencia de envíos y decisiones operativas.** Creado originalmente para América Latina, FleteOps reúne rutas, pruebas de entrega, diferencias de cantidad y decisiones de aprobación en un solo espacio.

[Sitio web](https://fleteops.com) · [English](../README.md) · [Arquitectura](ARCHITECTURE.md) · [Configuración conectada](CONNECTED-SETUP.md) · [Credenciales](CONFIGURATION.md)

La aplicación predeterminada es una **demo con datos totalmente ficticios**, disponible en inglés y español. No necesita cuenta, base de datos, clave de API ni sesión de mensajería. Los cambios viven solo en la memoria del navegador y se pierden al recargar. El repositorio también incluye código reutilizable para una aplicación conectada; configurarla requiere infraestructura propia y trabajo de integración adicional.

## Inicio rápido

Usa Node.js **22.23.4** (consulta [`.nvmrc`](../.nvmrc)) y npm. Desde el directorio del repositorio:

```sh
nvm use
npm ci
npm run build
npm start
```

Si no utilizas nvm, instala la versión indicada con tu administrador de versiones. Abre **http://127.0.0.1:3000/demo** y elige **Español** en el selector de idioma. Para desarrollo, utiliza `npm run dev` en lugar de compilar e iniciar. Los scripts incluidos escuchan solo en la máquina local.

No hace falta un archivo `.env`. Deja `FLETEOPS_MODE` sin definir o usa `demo`. Solo el valor exacto `connected` habilita la aplicación conectada. No uses credenciales ni archivos de configuración de producción para esta demo.

## Probar el flujo

1. Selecciona `DEMO-001`. Falta evidencia de entrega, por lo que no se puede aprobar su preparación.
2. Elige la fuente demo aprobada y pulsa **Simular recibo**. Los datos de la ruta no cambian hasta pulsar **Aceptar evidencia demo**.
3. Revisa los requisitos y elige **Aprobar preparación** o **Retener ruta**. Ninguna acción ejecuta un pago.
4. Prueba una fuente sin aprobar o bloqueada: su ingreso queda retenido y la ruta no cambia. Puedes aprobar una fuente desde **Fuentes**.
5. En **Importar CSV demo**, usa las filas ficticias incluidas. Las referencias duplicadas o filas inválidas rechazan toda la importación.
6. Revisa **Actividad**, cambia de idioma o pulsa **Reiniciar demo**.

La demo acepta únicamente referencias `DEMO-` y cantidades enteras positivas: máximo 25 filas por importación y 50 rutas. Usa solo datos inventados. No sube archivos, envía mensajes, llama a servicios de IA ni guarda documentos o registros en una base de datos. El recibo es un ejemplo determinista, no una extracción real.

## Alcance

La demo muestra requisitos de evidencia, diferencias de cantidad, revisión humana, fuentes aprobadas/sin aprobar/bloqueadas, decisiones de preparación y un registro de acciones en memoria. La interfaz de la demo tiene controles y estados en inglés y español (`es-MX`).

El código conectado incluye PostgreSQL/Drizzle, identidad Supabase con membresías de aplicación, almacenamiento local o compatible con S3, adaptadores de Evolution API y WhatsApp oficial, recepción de correo, extracción Docling/OpenRouter y trabajos opcionales Inngest. Esas integraciones están deshabilitadas en la demo y requieren configuración y pruebas propias. No se proporciona un servicio alojado ni una certificación para producción.

La [guía de configuración conectada](CONNECTED-SETUP.md) explica las limitaciones actuales: no hay un instalador automático de infraestructura ni una utilidad para crear al primer administrador. La creación inicial de identidad, espacio y membresía debe revisarse expresamente. Las variables `OPENAI_*` están reservadas y no equivalen a un adaptador funcional.

## Desarrollo

```sh
npm run typecheck
npm run lint
npm test
npm run privacy:check
npm run build
npx playwright install chromium
npm run test:demo
```

No ejecutes migraciones para la demo. Las pruebas de integraciones reales requieren un entorno desechable separado y datos sintéticos. Consulta el [mapa del código y las verificaciones](DEVELOPMENT.md), la [guía de contribución](../CONTRIBUTING.md) y la [política de seguridad](../SECURITY.md).

## Licencia y recuperación

El código original de FleteOps se distribuye bajo la [licencia MIT](../LICENSE), que permite uso comercial con sus requisitos de aviso. Las dependencias y los servicios externos conservan sus propias licencias; consulta los [avisos de terceros](../THIRD_PARTY_NOTICES.md).

Evolution API es un servicio HTTP opcional que se configura por separado. La referencia revisada es la versión 2.3.7. Su [licencia](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/LICENSE) añade a Apache 2.0 condiciones de aviso visible para administradores y de marca en sus componentes de interfaz. No está incluido el servidor ni la interfaz de Evolution. Una conexión Evolution/Baileys y la plataforma oficial WhatsApp Business son opciones distintas.

Publicar código no autoriza detener un servicio ni eliminar información. Antes de retirar un despliegue, acuerda propiedad y retención de datos, conserva exportaciones cifradas fuera de Git y prueba una restauración aislada. El [procedimiento de recuperación y retiro](RECOVERY.md) separa esas decisiones de la publicación del repositorio.
