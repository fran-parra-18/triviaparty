# 🎉 Trivia Party

Juego de preguntas multijugador en tiempo real para fiestas: una **pantalla principal** (PC conectada a un televisor o proyector) muestra las preguntas, el temporizador y la clasificación, y cada participante responde desde **su propio celular**, sin crear cuenta.

- Salas con código de 6 caracteres y **QR** que apunta a una URL utilizable desde otros dispositivos.
- Tiempo real con **Socket.IO**. El servidor es la autoridad: controla el temporizador, valida las respuestas y calcula los puntos.
- La respuesta correcta **nunca** se envía a los dispositivos antes de revelarse.
- Reconexión automática de jugadores y anfitrión, sin duplicar jugadores ni puntos.
- Banco de preguntas en archivos JSON/CSV, con importador, validador y exportador.

---

## Índice

1. [Estado actual](#estado-actual)
   - [Inicio rápido con doble clic](#inicio-rápido-con-doble-clic-windows) · [Jugador líder](#jugador-líder-controlar-desde-el-celular)
2. [Arquitectura](#arquitectura)
3. [Requisitos](#requisitos)
4. [Instalación y ejecución local](#instalación-y-ejecución-local)
5. [Jugar desde celulares](#jugar-desde-celulares)
6. [Variables de entorno](#variables-de-entorno)
7. [Base de datos](#base-de-datos)
8. [Banco de preguntas](#banco-de-preguntas)
9. [Reglas y puntuación](#reglas-y-puntuación)
10. [Seguridad](#seguridad)
11. [Pruebas](#pruebas)
12. [Despliegue en Internet](#despliegue-en-internet)
13. [Estructura del proyecto](#estructura-del-proyecto)
14. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Estado actual

| Área | Estado |
|---|---|
| Partida completa de punta a punta (sala → QR → unión → preguntas → revelación → clasificación → podio → repetir) | ✅ Implementada y probada (pruebas automáticas y en navegador) |
| Configuración: cantidad, tiempo (10/15/20/30/60 s), categorías, dificultad (incluida progresiva), mín./máx. de jugadores, puntuación, incorporaciones tardías, resultados entre preguntas, orden aleatorio y avance automático | ✅ |
| Pausa, reanudar, terminar antes de tiempo, expulsar jugadores, cerrar sala, pantalla completa, sonidos con silencio y atajos de teclado | ✅ |
| Reconexión de jugador y anfitrión | ✅ Probada |
| Banco de preguntas | ✅ **2.760 preguntas reales en las 17 categorías** (10 de ellas con audio, en «Pistas musicales 80s»), validadas con `npm run questions:validate` (0 errores; los avisos restantes se revisaron a mano). |
| Despliegue con Docker / PostgreSQL | ⚠️ Archivos preparados (`Dockerfile`, `docker-compose.yml`, migraciones de PostgreSQL), **no probados** en esta máquina (no tenía Docker ni PostgreSQL). |

Preguntas por categoría (fácil / media / difícil):

| Categoría | Total | | Categoría | Total |
|---|---|---|---|---|
| 🏛️ Historia | 217 (66/114/37) | | 🎨 Arte y cultura | 130 (45/62/23) |
| 🌍 Geografía | 240 (79/112/49) | | 🍽️ Gastronomía | 213 (66/116/31) |
| 🔬 Ciencia y naturaleza | 197 (56/99/42) | | 🐾 Animales | 130 (42/55/33) |
| 💻 Tecnología e informática | 185 (58/85/42) | | 🚀 Espacio y astronomía | 130 (33/57/40) |
| 🎬 Cine y televisión | 204 (71/98/35) | | 💡 Inventos y descubrimientos | 143 (19/80/44) |
| 🎵 Música | 225 (54/125/46) | | 🧠 Cultura general | 137 (63/60/14) |
| ⚽ Deportes | 212 (66/111/35) | | 🤯 Datos curiosos del mundo | 129 (13/79/37) |
| 📚 Literatura | 132 (32/76/24) | | 🏆 Récords y hechos sorprendentes | 126 (14/68/44) |
| | | | 🎧 Pistas musicales 80s | 10 (5/5/0) |
| **Total** | **2.760 (782/1.402/576)** | | | |

Para consultar el recuento real en cualquier momento: `npm run questions:validate` (archivos) o `npm run questions:stats` (base de datos).

---

## Arquitectura

Es un monorepo con *npm workspaces*:

```
shared/   Tipos TypeScript de eventos y vistas, esquemas Zod, categorías y constantes (lo usan cliente y servidor)
server/   Node + Express 5 + Socket.IO 4 + Prisma 6 (SQLite o PostgreSQL)
client/   React 19 + Vite 7 + Tailwind CSS 4 + React Router
```

**Decisiones principales:**

- **Estado de la partida en memoria y en el servidor.** Cada sala es una máquina de estados (`server/src/game/Room.ts`): `lobby → countdown → question → locked → reveal → leaderboard → … → finished`. El temporizador usa `setTimeout` y marcas de tiempo del servidor. Los clientes solo dibujan la cuenta atrás a partir de `endsAt`, corrigiendo el desfase de reloj con un `time:sync` al estilo NTP.
- **Vistas por rol.** El servidor arma una vista distinta para el anfitrión (`HostView`) y para cada jugador (`PlayerView`). La pregunta se envía sin el índice correcto; el índice, la explicación y los puntos solo se publican en la fase `reveal`.
- **La base de datos guarda el banco de preguntas y el historial de partidas** (`GameRecord`), no el estado en vivo.
- **SQLite por defecto y PostgreSQL disponible.** En la máquina de desarrollo no había PostgreSQL ni Docker, y SQLite no requiere instalación. Los mismos modelos existen en `server/prisma/schema.prisma` (SQLite) y `server/prisma/postgres/schema.prisma`, cada uno con sus migraciones. `server/scripts/prisma.mjs` elige el esquema según `DATABASE_URL`.
- **En producción, un solo puerto.** El servidor sirve el cliente compilado, la API y Socket.IO en el mismo origen, así que no hay problemas de CORS y el QR siempre funciona. En desarrollo, Vite (puerto 5173) redirige `/api` y `/socket.io` al servidor (puerto 3001).

---

## Requisitos

- **Node.js 20.19 o superior** (probado con Node 24) y npm.
- Nada más para desarrollo: la base SQLite se crea sola. PostgreSQL es opcional.

---

## Inicio rápido con doble clic (Windows)

Haz doble clic en **`Iniciar Trivia Party.bat`**, en la carpeta del proyecto. El lanzador:

1. comprueba que Node.js esté instalado (si no, indica dónde descargarlo);
2. instala las dependencias la primera vez;
3. compila el juego si no está compilado o si el código cambió desde la última vez;
4. prepara la base de datos y las preguntas (sin duplicar nada);
5. inicia el servidor en segundo plano, sin ventana, en el puerto 3001 y abre `http://localhost:3001/host` en el navegador. La ventana del lanzador se cierra sola.

Para apagar el juego, haz doble clic en **`Apagar Trivia Party.bat`**; si no lo apagas, sigue funcionando hasta que apagues o reinicies la PC. Si haces doble clic en el lanzador con el juego ya abierto, solo abre el navegador. Los mensajes del servidor quedan en `server/logs/servidor.log`, útil si algo falla. Para tener un acceso directo con el logo en el escritorio, ejecuta una vez `powershell -ExecutionPolicy Bypass -File scripts/crear-acceso-directo.ps1`.

## Jugador líder (controlar desde el celular)

Para no levantarse del sillón en cada pregunta, el anfitrión puede elegir a un **líder** tocando 👑 junto a su nombre en la sala de espera, o con el selector 👑 de la cabecera en cualquier momento. Solo hay un líder a la vez, y el anfitrión puede quitarlo o cambiarlo.

Desde su celular, el líder puede **comenzar la partida, revelar la respuesta, mostrar la clasificación, pasar a la siguiente pregunta o al podio, pausar o reanudar y «Jugar otra vez»**.

Por juego limpio, el líder **no puede cerrar una pregunta abierta**: como también juega, podría responder rápido y dejar sin tiempo a los demás. La pregunta se cierra sola cuando todos responden o se agota el tiempo. Tampoco puede terminar la partida, expulsar jugadores, cambiar la configuración ni cerrar la sala. El servidor valida cada una de estas restricciones.

## Instalación y ejecución local

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

(`npm run setup` ejecuta los tres primeros pasos de una vez.)

- Pantalla principal: <http://localhost:5173/host>. También se puede abrir la portada en <http://localhost:5173> y pulsar «Crear partida».
- La consola muestra las direcciones de la red local, por ejemplo `http://192.168.0.100:5173`.

**Producción local** (un solo puerto, 3001):

```bash
npm run build
```

```bash
npm start
```

`npm start` aplica las migraciones y arranca `server/dist/index.js`. Abre `http://localhost:3001/host`.

**Simular jugadores** (bots que responden al azar, útil si tienes pocos celulares):

```bash
npm run simulate -- --code=ABC123 --bots=5
```

---

## Jugar desde celulares

`localhost` en la PC **no** es accesible desde un teléfono. La aplicación lo resuelve así:

1. **Misma red Wi-Fi (fiesta en casa).** Al abrir la pantalla principal con `localhost`, el QR reemplaza `localhost` por la **IP de la PC en la red local**. Esa IP la detecta el servidor, priorizando Wi-Fi/Ethernet sobre adaptadores virtuales como WSL o VirtualBox. Si la PC tiene varias interfaces, debajo del QR hay un selector «¿El QR no funciona? Dirección».
   - Los teléfonos deben estar **en la misma red Wi-Fi** que la PC. Las redes de invitados con aislamiento de clientes lo impiden.
   - **Firewall de Windows:** la primera vez Windows pregunta si permite a Node.js en redes privadas; responde que sí. Si no apareció, permite los puertos 5173 (desarrollo) o 3001 (producción) para redes privadas. La red Wi-Fi debe estar marcada como *privada*.
2. **Internet.** Despliega el servidor (ver [Despliegue](#despliegue-en-internet)) y define `PUBLIC_URL=https://tu-dominio`. El QR usará esa dirección.

Los jugadores también pueden entrar a `http://<dirección>/join` y escribir el código.

**Prueba recomendada con varios celulares:** crea una sala en la PC, escanea el QR con 2 o más teléfonos, juega una partida de 5 preguntas y, durante una pregunta, bloquea un teléfono o recarga la página: debe volver con su nombre y sus puntos.

---

## Variables de entorno

Copia `.env.example` como `server/.env` (o `.env` en la raíz). Todas tienen valor por defecto.

| Variable | Por defecto | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `production` o `test` |
| `PORT` | `3001` | Puerto del servidor. En desarrollo, `scripts/dev.mjs` lo fija explícitamente; también se puede usar `SERVER_PORT` |
| `HOST` | `0.0.0.0` | Interfaz de escucha (0.0.0.0 = accesible en la red) |
| `DATABASE_URL` | `file:./trivia.db` | SQLite (ruta relativa a `server/prisma/`) o `postgresql://…` |
| `PUBLIC_URL` | vacío | URL pública para el QR (p. ej. `https://trivia.midominio.com`) |
| `CLIENT_DEV_PORT` | `5173` | Puerto de Vite en desarrollo |
| `CORS_ORIGINS` | vacío | Orígenes externos permitidos, separados por comas. Vacío = solo el mismo origen |
| `HOST_GRACE_MINUTES` | `10` | Minutos que se conserva una sala si el anfitrión se desconecta |
| `ROOM_IDLE_MINUTES` | `120` | Minutos de inactividad tras los que se elimina una sala |
| `MAX_PLAYERS_HARD_LIMIT` | `100` | Límite absoluto de jugadores por sala |
| `MAX_ROOMS` | `500` | Salas simultáneas máximas |
| `TRUST_PROXY` | `0` | Pon `1` detrás de Nginx, Render, Railway u otro proxy (usa `X-Forwarded-For` para los límites por IP) |

No hace falta ninguna credencial externa.

---

## Base de datos

- **SQLite (por defecto):** `npm run db:migrate` crea `server/prisma/trivia.db` aplicando `server/prisma/migrations`.
- **PostgreSQL:** define `DATABASE_URL="postgresql://usuario:clave@host:5432/trivia?schema=public"` y ejecuta los mismos comandos (`npm run db:migrate` y `npm run db:seed`). El envoltorio usa `server/prisma/postgres/schema.prisma` y sus migraciones. Debes volver a compilar (`npm run build`) para que el cliente de Prisma se genere para PostgreSQL.

Modelos: `Category`, `Question` (id, enunciado, 4 opciones, índice correcto, explicación, categoría, dificultad, fuente, etiquetas, texto normalizado único) y `GameRecord` (historial de partidas terminadas).

Si cambias el esquema, modifica **los dos** archivos `schema.prisma` y crea las migraciones de ambos: `npm run db:migrate:dev -w server` para SQLite y `prisma migrate diff` para PostgreSQL.

---

## Banco de preguntas

Las preguntas viven en `server/data/questions/*.json`, un archivo por categoría, independiente del código. Para ampliar el banco **no hay que tocar el código**: basta con añadir o editar archivos e importarlos.

### Formato JSON

```json
{
  "category": "historia",
  "questions": [
    {
      "id": "his-141",
      "question": "¿En qué año cayó el Muro de Berlín?",
      "options": ["1985", "1989", "1991", "1979"],
      "answer": 1,
      "explanation": "El 9 de noviembre de 1989 se abrieron los pasos fronterizos…",
      "difficulty": "facil",
      "source": "Wikipedia: Caída del Muro de Berlín",
      "tags": ["guerra fría"]
    }
  ]
}
```

- `category` puede ir en el archivo (como valor por defecto) o en cada pregunta. Los ids válidos son: `historia, geografia, ciencia, tecnologia, cine, musica, deportes, literatura, arte, gastronomia, animales, espacio, inventos, cultura-general, curiosidades, records, pistas-80s`.
- `answer`: índice de 0 a 3 o letra de la A a la D. `difficulty`: `facil`, `media` o `dificil` (también acepta *fácil*, *difícil*, *easy*, *medium* y *hard*).
- `id` es opcional: si falta, se genera uno estable a partir del enunciado.
- También se admite un arreglo simple de preguntas.
- `audio` (opcional): URL `https://` de un fragmento que la pantalla principal reproduce durante la pregunta (por ejemplo, «¿Quién canta esta canción?»). Las preguntas con audio pueden repetir el mismo enunciado, porque las distingue el fragmento. Las de `pistas-80s` usan las vistas previas de 30 s de iTunes: se buscaron con la API pública de búsqueda de iTunes, comprobando que el artista y el título coincidieran con la grabación original de estudio (no en vivo, remix ni covers).

### Formato CSV

Encabezados en inglés o en español, separados por `,` o `;`:

```csv
id,question,option_a,option_b,option_c,option_d,answer,explanation,category,difficulty,source,tags
csv-001,"¿Cuántas patas tiene una araña?",6,8,10,12,B,"Todas las arañas tienen ocho patas.",animales,facil,"Wikipedia: Araneae",arácnidos|invertebrados
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run questions:validate` | Valida `data/questions` sin tocar la base. Admite `-- --strict` y `-- --all` |
| `npm run db:seed` | Importa todo `data/questions`. Es idempotente: inserta las nuevas, actualiza las cambiadas e ignora las iguales |
| `npm run questions:import -- archivo.csv` | Importa un archivo o carpeta. Opciones: `--dry-run`, `--prune` (borra las que no estén en el lote) y `--allow-errors` |
| `npm run questions:export -- salida.csv` | Exporta la base a CSV o JSON reimportable (`--category=historia`) |
| `npm run questions:stats` | Muestra el recuento por categoría y dificultad en la base de datos |

### Qué valida el importador

- Esquema: 4 opciones, longitudes, categoría y dificultad válidas, explicación presente.
- Opciones repetidas, opciones del tipo «todas/ninguna de las anteriores» (no tienen sentido porque las opciones **se barajan** en cada partida) y una opción igual al enunciado.
- **Duplicados exactos** por id o por enunciado normalizado (sin tildes, mayúsculas ni signos), en el lote y frente a la base de datos.
- **Avisos** que no bloquean la importación y conviene revisar a mano:
  - casi duplicados (similitud de palabras);
  - respuesta incluida en el enunciado;
  - falta de «¿» o «?»;
  - explicación que menciona una opción distinta de la marcada. Este aviso detectó dos índices mal marcados durante la creación del banco; los avisos que quedan se revisaron y son correctos.

### Cómo se elaboraron las preguntas

Todas se redactaron a mano en español, con un dato verificable y una fuente de referencia (normalmente el artículo de Wikipedia correspondiente o el organismo oficial). Pasaron el validador anterior. Aun así, conviene que una persona revise el banco antes de un evento importante. Si encuentras un error, corrige el JSON y ejecuta `npm run db:seed`.

Dentro de una misma sala **no se repiten preguntas**, ni siquiera entre partidas sucesivas con «Jugar otra vez». Si se agotan las preguntas de los filtros elegidos, la aplicación lo avisa.

---

## Reglas y puntuación

(También disponibles en la aplicación, en `/reglas`.)

- Cada pregunta tiene 4 opciones y una sola correcta. Se responde una sola vez y no se puede cambiar.
- La pregunta se cierra cuando responden todos los jugadores conectados o se agota el tiempo del servidor. El anfitrión también puede cerrarla antes.
- **Modo clásico:** respuesta correcta = **1.000 puntos** + hasta **500** de bonificación proporcional al tiempo restante (`1000 + 500 × tiempo_restante / tiempo_total`). Incorrecta o sin respuesta = 0.
- Otros modos: **Velocidad** (500 + 1.000), **Precisión** (1.000 fijos), **Por dificultad** (clásico ×1, ×1,5 o ×2) y **Personalizado**.
- Los puntos se calculan al cerrar la pregunta y **se publican al revelar la respuesta**. Antes de eso nadie ve quién acertó.
- **Desempates:** 1) más puntos; 2) más aciertos; 3) menos tiempo acumulado en los aciertos. Si todo coincide, los jugadores comparten el puesto (1, 1, 3…).
- Un jugador que se une tarde empieza con 0 puntos; las preguntas anteriores no le cuentan.

**Controles del anfitrión:** `Espacio`/`Enter` = siguiente fase; `P` = pausa; `F` = pantalla completa; `M` = sonido.

---

## Seguridad

- **El servidor es la autoridad:** valida fase, índice de pregunta, plazo (con el reloj del servidor), pausa y respuesta única. Las puntuaciones las calcula siempre el servidor.
- **Sin filtración de respuestas:** las vistas se construyen campo a campo y la respuesta correcta solo aparece en `reveal`. Una prueba de integración revisa cada mensaje enviado durante una partida. La API HTTP es de solo lectura y no expone respuestas; la importación del banco solo se hace por línea de comandos.
- **Roles separados:** el anfitrión se autentica con un `hostToken` y cada jugador con su propio token. Ambos son aleatorios, de 192 bits, y se comparan en tiempo constante. Cada socket queda ligado a un rol y una sala; un jugador no puede ejecutar acciones de anfitrión.
- **Validación con Zod** de todos los datos recibidos y límite de 16 KB por mensaje.
- **Nombres saneados:** se eliminan caracteres de control e invisibles, `<>&"'`, el exceso de marcas combinantes («zalgo») y se limitan a 20 caracteres. Son únicos por sala sin distinguir mayúsculas ni tildes. El anfitrión puede expulsar jugadores.
- **Límites de frecuencia:** por socket, por IP para unirse o reconectar (dificulta adivinar códigos de sala) y para crear salas, además de `express-rate-limit` en la API.
- **Helmet** con una CSP estricta: solo recursos del mismo origen.

---

## Pruebas

```bash
npm test
```

75 pruebas con Vitest (todas pasan):

- **Unitarias:** puntuación, desempates, saneado de nombres, códigos y tokens, selección de preguntas (sin repeticiones, filtros, progresiva), lectura de JSON y CSV, validación y duplicados, y la máquina de estados de la sala con temporizadores simulados (pausa, cierre por tiempo, respuestas tardías o dobles, puntos no publicados antes de revelar, avance automático y anfitrión desconectado).
- **Integración en tiempo real:** servidor HTTP y Socket.IO reales con varios clientes `socket.io-client`. Cubren una partida completa de 1 anfitrión y 3 jugadores con puntuación verificada, que ningún mensaje filtre la respuesta, reconexión sin duplicados, recuperación del anfitrión, permisos, validación, expulsión, cierre de sala, límite de frecuencia y cierre por tiempo real del servidor.
- **Integración con base de datos:** migraciones reales de SQLite, importación idempotente del banco, conflictos por duplicados y una sala que selecciona preguntas desde la base.
- `npm run typecheck` comprueba los tres paquetes.

---

## Despliegue en Internet

El servidor necesita **WebSockets** y un proceso Node persistente. Las plataformas *serverless* puras no sirven.

### Opción A: Docker con PostgreSQL

```bash
PUBLIC_URL=https://trivia.midominio.com POSTGRES_PASSWORD=una-clave-segura docker compose up -d --build
```

El contenedor aplica migraciones, importa el banco y escucha en el 3001. Pon delante un proxy con HTTPS (Caddy o Nginx) que reenvíe también las conexiones WebSocket (`Upgrade`), y define `TRUST_PROXY=1`.

### Opción B: VPS con Node

```bash
npm ci && npm run build
```

Define `DATABASE_URL` (SQLite en un disco persistente o PostgreSQL), `PUBLIC_URL`, `NODE_ENV=production` y `TRUST_PROXY=1`. Después ejecuta `npm run db:migrate && npm run db:seed` y arranca con `npm start` usando un gestor de procesos (systemd o pm2).

### Opción C: Render, Railway, Fly.io u otros

- Comando de compilación: `npm ci && npm run build`.
- Comando de arranque: `cd server && node scripts/prisma.mjs migrate deploy && node dist/cli/import.js data/questions && node dist/index.js`.
- La plataforma define `PORT`. Añade `DATABASE_URL` de su PostgreSQL gestionado, `PUBLIC_URL` con la URL del servicio y `TRUST_PROXY=1`.
- **Una sola instancia:** las salas viven en memoria (ver limitaciones).

---

## Estructura del proyecto

```
├── shared/src/            categories, constants, schemas (Zod), types (vistas), events (Socket.IO), messages
├── server/
│   ├── data/questions/    banco de preguntas (JSON por categoría)
│   ├── prisma/            schema.prisma + migrations (SQLite) · postgres/ (PostgreSQL)
│   ├── scripts/prisma.mjs elige el esquema según DATABASE_URL
│   ├── src/
│   │   ├── app.ts         Express + Socket.IO + API + estáticos
│   │   ├── index.ts       arranque
│   │   ├── config.ts      variables de entorno (Zod)
│   │   ├── game/          Room (máquina de estados), RoomManager, scoring, ranking, selection
│   │   ├── realtime/      manejadores de Socket.IO, permisos y límites
│   │   ├── questions/     esquema, lectura JSON/CSV, validación, importador, repositorio
│   │   ├── security/      tokens, saneado de nombres, limitador de frecuencia
│   │   └── cli/           validate, import, export, stats, simulate
│   └── test/              unit/ e integration/
├── client/src/
│   ├── pages/host/        HostPage, HostLobby, SettingsPanel, HostPlay, HostFinal
│   ├── pages/player/      PlayerPage (unión, respuesta, resultado, final)
│   ├── hooks/             useHostSession, usePlayerSession (reconexión)
│   ├── lib/               socket, reloj sincronizado, sonido, URL del QR, almacenamiento
│   └── components/        temporizador, clasificación animada, podio, QR, UI
├── scripts/dev.mjs        arranca servidor + Vite en desarrollo
├── Dockerfile · docker-compose.yml · .env.example
```

---

## Limitaciones conocidas

- **Pistas musicales:** necesitan internet en la PC de la pantalla principal, porque el fragmento se descarga de iTunes (los celulares no reproducen nada). Si Apple cambia o retira una vista previa, esa pregunta se quedará sin sonido y habrá que volver a buscar su enlace. El navegador puede bloquear el sonido si nadie hizo clic en la página: en ese caso aparece el botón «Tocar para escuchar».
- **Datos que cambian con el tiempo:** algunas preguntas (récords deportivos, edificios más altos, monedas) son correctas a fecha de 2026, y su explicación indica el año cuando conviene. Habrá que revisarlas de vez en cuando.
- **Las salas viven en memoria:** si el servidor se reinicia, las partidas en curso se pierden. Las preguntas y el historial están en la base de datos. Por eso tampoco se puede escalar a varias instancias sin añadir un almacén compartido (por ejemplo, Redis y el adaptador de Socket.IO).
- El despliegue con Docker y PostgreSQL está preparado pero **no se ha ejecutado** en este entorno.
- En el entorno de pruebas no se usaron teléfonos físicos. El acceso desde otros dispositivos se verificó abriendo el cliente por la IP de la red local (`192.168.0.100`) en pestañas independientes con vista móvil. Conviene hacer la prueba descrita en [Jugar desde celulares](#jugar-desde-celulares) con teléfonos reales.
