# GymTrack

Aplicación web modular para que entrenadores asignen rutinas y planes nutricionales, y para que atletas registren entrenamientos, mediciones, check-ins y mensajes.

## Requisitos

- Node.js 20 o posterior.
- PostgreSQL instalado y en ejecución.
- npm.

## 1. Crear PostgreSQL en Windows

PostgreSQL es el programa que administra la base de datos. Una **base de datos** contiene **tablas**; cada tabla tiene columnas y filas. Las claves relacionan unas tablas con otras sin duplicar información.

Instala PostgreSQL con su herramienta gráfica pgAdmin. Durante la instalación te pedirá una contraseña para el usuario administrador `postgres`; guárdala. El puerto normal es `5432`.

Abre pgAdmin, conéctate al servidor local y abre **Query Tool** sobre la base `postgres`. Ejecuta estas instrucciones, reemplazando la contraseña:

```sql
CREATE USER gymtrack_app WITH PASSWORD 'una_clave_larga_y_privada';
CREATE DATABASE gymtrack OWNER gymtrack_app ENCODING 'UTF8';
```

También están guardadas como referencia en `database/setup.sql`. El usuario `gymtrack_app` es exclusivo para la aplicación; no conviene que Node.js utilice la cuenta administradora.

## 2. Configurar la aplicación

Instala las dependencias:

```powershell
npm.cmd install
```

Edita `.env` y coloca exactamente la misma contraseña usada al crear el usuario:

```dotenv
DATABASE_URL=postgresql://gymtrack_app:una_clave_larga_y_privada@localhost:5432/gymtrack
```

Si la contraseña contiene caracteres especiales como `@`, `:`, `/` o `#`, deben codificarse para una URL. Para comenzar, una contraseña larga con letras, números, guiones y guiones bajos evita esa dificultad.

También cambia `SESSION_SECRET` por una frase aleatoria de al menos 32 caracteres. `.env` está ignorado por Git y nunca debe publicarse.

## 3. Crear las tablas

No es necesario crear las tablas manualmente. Las migraciones son archivos SQL versionados que construyen la estructura en el orden correcto:

```powershell
npm.cmd run db:migrate
```

El comando registra cada archivo aplicado en `schema_migrations`, por lo que puede ejecutarse nuevamente sin duplicar tablas.

### Crear tu cuenta

No hay cuentas de demostración preparadas. Abre la aplicación, entra en **Crear una cuenta** y regístrate eligiendo el rol de entrenador o de atleta. Para probar los dos lados necesitarás una cuenta de cada tipo, y vincularlas con un código de invitación desde la pantalla de invitaciones del entrenador.

Existe un comando que siembra dos cuentas demo (`npm.cmd run db:seed`), pensado solo para una base local recién creada. **Se detiene por su cuenta si detecta que la conexión no es local**, para no mezclar usuarios falsos con los reales en la base publicada.

## 4. Iniciar el servidor

Durante el desarrollo:

```powershell
npm.cmd run dev
```

Abre `http://localhost:3000`. Para ejecución normal se utiliza `npm.cmd start`.

Puedes comprobar la conexión visitando `http://localhost:3000/api/health`. Una respuesta `{"status":"ok"}` confirma que Node.js y PostgreSQL se comunican correctamente.

## Cómo inspeccionar los datos

En pgAdmin, abre `Databases > gymtrack > Schemas > public > Tables`. Haz clic derecho en una tabla y selecciona **View/Edit Data > All Rows**.

También puedes usar Query Tool:

```sql
SELECT id, email, role, created_at FROM users;
SELECT * FROM trainer_athlete_links;
SELECT * FROM routines ORDER BY created_at DESC;
SELECT * FROM measurements ORDER BY measured_at DESC;
```

No edites la estructura manualmente una vez iniciado el proyecto. Para cambiar columnas o tablas se crea una nueva migración SQL, lo que conserva un historial reproducible.

## Respaldo y restauración

En pgAdmin, haz clic derecho sobre `gymtrack` y utiliza **Backup**. El formato Custom es práctico para restaurar posteriormente mediante **Restore**. Antes de actualizar una instalación con datos reales, realiza un respaldo.

## Organización

- `public`: páginas, estilos y JavaScript descargable por el navegador.
- `src`: servidor privado de Node.js, API, permisos y acceso a PostgreSQL.
- `database/migrations`: estructura SQL versionada.
- `database/seed.js`: datos de demostración.
- `storage`: archivos privados locales durante desarrollo.
- `tests`: pruebas automatizadas.

El navegador nunca recibe la contraseña de PostgreSQL ni ejecuta SQL. Todas las solicitudes pasan por la API, sus validaciones y sus comprobaciones de permisos.

## Correo electrónico

La aplicación envía dos correos: el de **confirmación de cuenta** y el de **recuperación de contraseña**. Desde la migración `005`, una cuenta recién creada no puede iniciar sesión hasta confirmar su dirección.

### En desarrollo no hace falta configurar nada

Con `MAIL_TRANSPORT=console` (el valor predeterminado) el correo **no se envía**: se escribe completo en la terminal, con su enlace. Basta con copiar el enlace desde ahí. Las pruebas automatizadas funcionan así y no necesitan credenciales.

### En producción (Brevo)

1. Crear una cuenta gratuita en Brevo.
2. En **Senders, Domains & Dedicated IPs**, añadir una dirección de remitente y confirmarla desde el correo que llega.
3. En **SMTP & API**, generar una clave de API.
4. En Render, configurar estas variables:

   | Variable | Valor |
   |---|---|
   | `MAIL_TRANSPORT` | `brevo` |
   | `MAIL_API_KEY` | La clave de API (secreta) |
   | `MAIL_FROM` | La dirección verificada en el paso 2 |
   | `MAIL_FROM_NAME` | `GymTrack` |
   | `APP_ORIGIN` | La URL pública real; **los enlaces del correo se construyen con ella** |

Sin dominio propio, los correos llegan con más frecuencia a la carpeta de correo no deseado.

### El día que exista un dominio propio: pasar a Resend

El transporte de Resend **ya está programado** en `src/services/mail.service.js`. Cuando tengas dominio:

1. Añade el dominio en Resend y copia los registros DNS que te da (DKIM y SPF) en tu registrador.
2. Espera la propagación y verifícalo en Resend.
3. Genera una clave de API.
4. En Render cambia solo tres valores: `MAIL_TRANSPORT=resend`, `MAIL_API_KEY` y `MAIL_FROM` con una dirección del dominio (por ejemplo `no-responder@tudominio.com`).

No hay que desplegar código ni ejecutar migraciones. Si además mueves la aplicación al dominio nuevo, actualiza `APP_ORIGIN`, porque los enlaces de los correos se construyen con esa variable.

> Si `MAIL_TRANSPORT` no se configura en producción, la aplicación **arranca igual** y avisa en el registro. Se prefirió eso a que un despliegue sin credenciales tumbara el sitio entero.

### Si alguien no recibe el correo

Mientras no exista un panel de administración, esta es la salida manual. Con acceso a la base de datos, confirma la cuenta a mano:

```sql
UPDATE users SET email_verified_at = NOW() WHERE email = 'persona@ejemplo.com';
```

## Seguridad antes de producción

- Usar HTTPS.
- Cambiar todas las claves de desarrollo.
- Utilizar almacenamiento privado externo para fotografías y adjuntos.
- Configurar respaldos automáticos.
- Revisar las obligaciones de privacidad y datos de salud del país donde se opere.
- Comprobar que no queden cuentas de prueba en la base antes de abrirla a personas reales.
- Ejecutar pruebas de autorización y recuperación ante fallos.
