# Tu Entrada — Control de acceso a eventos con QR

App para gestionar entradas virtuales por QR y validarlas en la puerta con la cámara
del celular. Dos roles: **admin** (crea eventos y carga invitados) y **validador**
(escanea QR en el ingreso).

## Stack
- React + Vite
- Supabase (Postgres + Auth + RLS)
- react-router-dom
- qrcode.react (generación de QR)
- html5-qrcode (lectura de QR con la cámara)
- Deploy sugerido: Vercel

---

## 1. Crear el backend en Supabase

1. Creá un proyecto nuevo en https://supabase.com (o usá uno existente).
2. Andá a **SQL Editor** → pegá el contenido completo de `supabase/schema.sql` → **Run**.
   Esto crea las tablas (`events`, `guests`, `profiles`, `scan_logs`), las políticas de
   seguridad (RLS) y la función `validar_entrada()` que hace el check-in.
3. Andá a **Authentication → Providers** y confirmá que **Email** esté habilitado.
   Recomendado: desactivar "Confirm email" en Authentication → Settings para que los
   usuarios que crees puedan loguearse al toque sin verificar casilla (son usuarios
   internos tuyos, no público general).
4. Creá tu primer usuario:
   - **Authentication → Users → Add user** (con email + password), o
   - Dejá que se registre desde el login de la app (queda como `validador` por defecto).
5. Convertilo en admin corriendo esto en el SQL Editor (una sola vez):
   ```sql
   update profiles set role = 'admin' where email = 'tu-email@dominio.com';
   ```
6. Anotá tu **Project URL** y **anon public key** (Settings → API). Los vas a necesitar
   en el paso 3.

### Cómo cargar validadores para el día del evento
Repetí el paso 4 (Authentication → Users → Add user) por cada persona que va a escanear
en la puerta. Por defecto quedan con rol `validador` — no hace falta el paso 5, ese es
solo para vos como admin.

---

## 2. Instalar y correr localmente

```bash
npm install
cp .env.example .env
```

Editá `.env` con tu URL y anon key de Supabase:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

```bash
npm run dev
```

Abrí `http://localhost:5173`, logueate con el usuario admin, y ya podés crear tu
primer evento.

> **Nota sobre la cámara:** los navegadores solo dan acceso a la cámara en `https://`
> o en `localhost`. En local funciona sin problema; en producción necesitás el sitio
> servido por HTTPS (Vercel lo da gratis).

---

## 3. Deploy a Vercel

```bash
npm i -g vercel   # si no lo tenés
vercel
```

O conectá el repo desde el dashboard de Vercel. En **Settings → Environment Variables**
cargá:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Y redeployá. Como es una SPA con rutas propias (`/entrada/:code`, `/scanner`, etc.),
asegurate de que Vercel esté sirviendo con rewrite a `index.html` — el framework preset
"Vite" de Vercel ya lo maneja automáticamente.

---

## 4. Cómo se usa el día del evento

**Vos (admin):**
1. Entrás a `/panel`, creás el evento (nombre, fecha, lugar).
2. Cargás cada invitado (nombre, tipo de entrada, teléfono opcional) — se genera un QR
   único al toque.
3. Por cada invitado podés: **Ver QR** (para mostrarlo en pantalla), **Copiar link**
   (para mandarlo por WhatsApp/mail vos mismo), o tocar **Enviar por WhatsApp** si
   cargaste el teléfono (abre WhatsApp Web/App con el link precargado).
   El link es del tipo `tudominio.com/entrada/<codigo>` — esa es la "entrada virtual":
   el invitado la abre en su celu y le queda guardada ahí, con su QR.

**El invitado:**
- Abre el link que le mandaste. Ve su credencial digital con nombre, tipo de entrada
  y el QR. No necesita imprimir nada ni tener cuenta.

**El validador en la puerta:**
1. Entra a `/scanner` con su usuario y contraseña (le creaste el usuario en el paso 1).
2. Toca **Activar cámara**, apunta al QR que el invitado muestra en su pantalla.
3. La app le dice al instante: **✅ Ingreso aprobado**, **⚠️ Entrada ya utilizada**,
   **⛔ Entrada anulada** o **❌ QR no válido** — con nombre y tipo de entrada.
4. Toca **Siguiente** y sigue escaneando. Podés tener varios validadores escaneando
   en simultáneo en distintas puertas: el check-in es atómico (no se duplican
   ingresos aunque escaneen el mismo QR dos veces a la vez).

**Vos, en el panel, en tiempo real:**
- Entrás al evento y ves el contador de ingresados/total actualizado.
- Podés exportar un CSV con el estado de todos los invitados.
- Podés **anular** una entrada (por ejemplo si un invitado avisó que no va) sin
  borrarla, o eliminarla directamente.

---

## Entradas genéricas (sin nombre)

Además de cargar invitados nominados, desde **+ Entradas genéricas** podés generar un
lote de N entradas de un tipo (ej: 50 "Generales") sin nombre real de invitado. Cada
una tiene su **propio QR único y trackeable** — se llaman "Invitado General #1", "#2",
etc. — y se validan y cuentan en las estadísticas exactamente igual que las nominadas
(cuántas ingresaron, cuántas faltan, quién/qué código ingresó y a qué hora).

Sirven para repartir físicamente (ej: imprimir y entregar en mano) o mandar por un
canal masivo cuando no necesitás saber el nombre exacto de cada persona.

Con **Imprimir QRs** (o **Imprimir esta lista** para exportar solo lo que tenés
filtrado) se abre una hoja lista para imprimir con el QR y código de cada entrada.

## Envío de entradas — Email y WhatsApp

Es "manual pero sin fricción": el botón **Email** abre tu cliente de correo con el
asunto y cuerpo ya redactados (necesita que el invitado tenga email cargado). El botón
**Enviar por WhatsApp** abre WhatsApp Web/App con el mensaje y el link de la entrada
ya escritos (necesita que el invitado tenga teléfono cargado). En ambos casos vos das
el toque final de "Enviar" — no se manda nada de forma automática ni requiere
configurar ninguna cuenta de email o API adicional.

## Estructura del proyecto

```
src/
  lib/
    supabaseClient.js   # cliente de Supabase
    AuthContext.jsx      # sesión + perfil (rol admin/validador)
  components/
    Layout.jsx           # topbar compartida
    ProtectedRoute.jsx   # protección de rutas por login/rol
  pages/
    Login.jsx
    Panel.jsx             # redirige admin→eventos, validador→scanner
    EventsList.jsx        # listado + alta de eventos (admin)
    EventDetail.jsx        # alta de invitados, QR, links, CSV (admin)
    Scanner.jsx             # cámara + validación (admin y validador)
    Ticket.jsx               # entrada virtual pública (/entrada/:code)
supabase/
  schema.sql            # tablas, RLS y función validar_entrada()
```

## Seguridad — cómo está pensado
- Cada invitado tiene un `code` aleatorio de 24 caracteres (no correlativo, no
  adivinable) que es lo único que viaja en el QR/link — nunca se expone el ID interno.
- El check-in corre en una función de Postgres (`validar_entrada`) con bloqueo de fila
  (`for update`), así dos validadores escaneando el mismo QR en simultáneo no generan
  dos ingresos.
- Cada intento de escaneo (aprobado, duplicado, inválido, anulado) queda registrado en
  `scan_logs` con quién y cuándo, para auditoría.
- Row Level Security en todas las tablas: solo admin puede crear/editar eventos e
  invitados; los validadores solo pueden hacer check-in.
