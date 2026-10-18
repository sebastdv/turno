# turno

Reservas en línea para una barbería, con abono pagado por Wompi. La barbería de ejemplo, **Filo
Barbería**, es ficticia.

**Para clientes**
- Reservar en cuatro pasos: servicio, barbero (o "el primero libre"), día y hora. El estado vive en
  la URL, así que funciona sin JavaScript y el botón atrás hace lo esperado.
- Pagar un abono que se descuenta en la barbería. Mientras se paga, el horario queda apartado 15
  minutos.
- Ver sus turnos como un tiquete con código, y cancelar: con 3 horas o más de anticipación se
  devuelve el abono.

**Para la barbería** (`/admin`)
- Agenda del día con una columna por barbero, horas cerradas y bloqueos, y totales: abonos
  recibidos y lo que falta cobrar.
- Marcar asistencia (atendido / no asistió), cancelar turnos y llevar los abonos por devolver.
- Editar servicios, barberos, horario semanal por tramos (`09:00-13:00, 14:00-19:00`) y bloqueos.

## Lo interesante

- **Sin reservas dobles, garantizado por Postgres.** Una restricción de exclusión con `btree_gist`
  impide dos turnos activos cruzados del mismo barbero, aunque dos personas confirmen el mismo
  horario en el mismo instante. La aplicación además revalida la disponibilidad dentro de la
  transacción; con "el primero libre" prueba cada barbero en su propio savepoint.
- **Pagos que no se pueden falsificar.** El checkout de Wompi lleva firma de integridad hecha en el
  servidor; los eventos se aceptan solo con el checksum correcto, se procesan una vez por
  (transacción, estado), y nunca confirman un monto o una moneda distintos al abono.
- **El caso feo, resuelto.** Si alguien paga después de que su apartado venció y otra persona tomó
  el horario, la restricción lo detecta al reactivar el turno: queda cancelado con el abono
  pendiente de devolución en el panel.
- **Sin depender del webhook.** Al volver del checkout, el servidor consulta la transacción en
  Wompi. Así funciona también en local, adonde el webhook no llega.
- **Cuentas propias**: contraseñas con scrypt, sesiones guardadas como hash, bloqueo tras 5
  intentos fallidos y redirecciones solo internas después de entrar.

## Correrlo

Requiere Node 20.9 o superior. No necesita Docker: en desarrollo la base es PGlite (Postgres en
WebAssembly) en `.data/`, migrada y sembrada con Filo Barbería al arrancar.

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:3000
```

`.env.example` trae una cuenta de administrador y una de cliente solo para desarrollo. Sin llaves de
Wompi, los pagos usan una **pasarela simulada** que firma eventos con el mismo formato de Wompi y
los pasa por la misma verificación.

```bash
npm test               # 43 tests, casi todos contra un Postgres real en memoria
npm run typecheck
npm run lint
```

## Pagos con Wompi (modo pruebas)

1. Crea una cuenta de comercio en [Wompi](https://wompi.com) y copia las llaves de pruebas
   (`pub_test_…`, `prv_test_…`) y los secretos de integridad y de eventos.
2. Ponlas en `.env` (`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`,
   `WOMPI_EVENTS_SECRET`) y define `PUBLIC_BASE_URL`.
3. En el dashboard de Wompi, configura la URL de eventos: `PUBLIC_BASE_URL/api/pagos/wompi`.
4. Paga con los datos de prueba de la documentación de Wompi.

Nota: el ejemplo de checksum de eventos de la documentación de Wompi muestra un resultado que no es
el SHA-256 de su propia cadena; los tests lo verifican contra la cadena documentada.

## Publicar (Vercel + Neon)

1. Crea una base en [Neon](https://neon.tech) (incluye `btree_gist`) y define `DATABASE_URL`.
2. Aplica las migraciones y, si quieres la barbería de ejemplo, siémbrala:
   ```bash
   DATABASE_URL="postgres://…" npm run db:migrate
   DATABASE_URL="postgres://…" SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed
   ```
   Para una barbería real, crea solo el administrador: `npm run crear-admin -- correo "Nombre"`.
3. Importa el repositorio en Vercel con las variables de `.env.example`. Para una demo sin cobros
   reales, `PAGOS_SIMULADOS=1` deja activa la pasarela simulada en producción.

## Stack

Next.js 16 (App Router, Server Actions, Route Handlers), TypeScript, PostgreSQL con Drizzle ORM y
migraciones SQL, PGlite para desarrollo y tests, zod, Tailwind CSS 4 y Vitest. Tipografías Big
Shoulders Display y Figtree, incluidas en el proyecto.

Las decisiones de diseño están en [DESIGN.md](DESIGN.md).
