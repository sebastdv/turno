# turno: diseño

Reservas para una barbería pequeña: clientes que reservan desde el celular, una o dos personas que
administran desde el mismo local.

## Reglas del negocio

| Regla | Valor | Dónde |
|---|---|---|
| Inicios de turno | Cada 15 minutos, alineados aunque el tramo empiece 9:10 | `lib/slots.ts` |
| Anticipación | Mínimo 1 hora, máximo 30 días | `lib/slots.ts` |
| Apartado mientras se paga | 15 minutos; al vencer, el horario se libera | `lib/bookings.ts` |
| Abono | `ABONO_COP` (10.000 por defecto), nunca mayor que el precio; con 0, el turno se confirma sin pagar | `lib/money.ts` |
| Cancelación | Con 3 horas o más se devuelve el abono; si cancela la barbería, siempre | `lib/bookings.ts` |
| "El primero libre" | Entre los libres, el de menos turnos ese día | `lib/bookings.ts` |
| Zona horaria | Bogotá, UTC−5 fijo: Colombia no tiene horario de verano | `lib/time.ts` |

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Reservas dobles | Restricción `EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)` solo para estados activos | La garantía vive en la base: ninguna carrera entre dos peticiones puede saltársela. `[)` deja pegar un turno a las 10:30 detrás de uno que termina a las 10:30. |
| Revalidar en la transacción | Vencer apartados, recalcular disponibilidad e insertar en una sola transacción | La restricción evita el cruce; la revalidación evita reservar fuera del horario o en un bloqueo. |
| "El primero libre" | Un savepoint por candidato | En Postgres un error aborta la transacción; con savepoint, si un barbero choca se prueba el siguiente. |
| Apartados vencidos | Se marcan `expirada` de forma perezosa (al leer o reservar), sin tareas programadas | Funciona igual en Vercel, donde no hay procesos de fondo. |
| Pagos | Wompi Web Checkout con firma de integridad en el servidor; eventos verificados con checksum en tiempo constante | La firma impide cambiar el monto en el navegador; el checksum, inventar eventos. |
| Idempotencia | Índice único en (proveedor, transacción, estado) de `payment_events`, y los pagos en estado final no cambian | Wompi reintenta eventos hasta 3 veces; un reenvío no debe confirmar dos veces ni revertir nada. |
| Referencia por intento | `TURNO-<código>-<n>` | Tras un rechazo se puede reintentar con una referencia nueva. |
| Pago tardío | Reactivar el turno; si la restricción choca, cancelarlo con reembolso pendiente | Es el caso que más dinero cuesta si se maneja mal. |
| Respaldo del webhook | Consultar la transacción al volver del checkout (`?id=`) | En local Wompi no alcanza el webhook, y en producción puede tardar. |
| Pasarela simulada | Eventos con el formato de Wompi, firmados y verificados igual; solo sin llaves y fuera de producción, o con `PAGOS_SIMULADOS=1` | Se puede probar todo el flujo sin cuenta de Wompi, por el mismo código. |
| Reembolsos | Se registran como pendientes y se marcan a mano | Cómo se devuelve depende del medio de pago (tarjeta, Nequi, PSE); una barbería pequeña suele hacerlo por transferencia. El panel lleva cuáles faltan. |
| Autenticación | Propia: scrypt de `node:crypto`, sesiones como SHA-256 del token, cookie `httpOnly` `SameSite=Lax` | Sin dependencias nativas ni servicios externos; con la base filtrada no se puede suplantar a nadie. |
| Bloqueo por intentos | 5 fallos por correo en 15 minutos, en la base | Funciona con varias instancias; en memoria no. |
| Flujo de reserva | Estado en la URL, enlaces normales y una sola Server Action al confirmar | Funciona sin JavaScript, se puede compartir y el botón atrás hace lo esperado. |
| Siembra | Al abrir la base local vacía, no en un script aparte | Un script con el servidor encendido abriría dos PGlite sobre la misma carpeta. |

## Fuera de alcance

Recordatorios por WhatsApp o correo, varias sedes, pagos del servicio completo, propinas,
reprogramar un turno sin cancelarlo.
