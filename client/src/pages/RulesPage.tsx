import { Link } from 'react-router-dom';
import { Logo, Screen } from '../components/ui';

export function RulesPage() {
  return (
    <Screen>
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-10">
        <Link to="/" aria-label="Volver al inicio">
          <Logo size="md" />
        </Link>
        <article className="glass mt-8 space-y-6 p-6 leading-relaxed md:p-10">
          <h1 className="text-4xl font-bold">Reglas del juego</h1>

          <section>
            <h2 className="mb-2 text-2xl font-bold">Cómo se juega</h2>
            <ol className="list-decimal space-y-1 pl-6 text-white/85">
              <li>El anfitrión crea una sala en la pantalla principal.</li>
              <li>Cada jugador escanea el QR (o escribe el código) en su celular y elige un apodo.</li>
              <li>En cada pregunta hay cuatro opciones y una sola es correcta.</li>
              <li>Solo se puede responder una vez: la respuesta no se puede cambiar.</li>
              <li>La pregunta se cierra cuando todos respondieron o se acaba el tiempo.</li>
              <li>Después se revela la respuesta correcta, su explicación y la clasificación.</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-2xl font-bold">Puntuación (modo clásico)</h2>
            <ul className="list-disc space-y-1 pl-6 text-white/85">
              <li>
                Respuesta correcta: <strong>1.000 puntos</strong> base.
              </li>
              <li>
                Bonificación por rapidez: hasta <strong>500 puntos</strong> extra, proporcionales al tiempo que quedaba al
                responder. Por ejemplo, responder bien con la mitad del tiempo restante da 1.250 puntos.
              </li>
              <li>Respuesta incorrecta o sin responder: 0 puntos.</li>
              <li>
                El anfitrión puede elegir otros sistemas: <em>Velocidad</em> (500 + hasta 1.000), <em>Precisión</em> (1.000
                fijos, sin bonificación), <em>Por dificultad</em> (×1 fácil, ×1,5 media, ×2 difícil) o uno personalizado.
              </li>
              <li>El tiempo lo mide el servidor, no el celular, así que todos compiten en igualdad de condiciones.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-2xl font-bold">Desempates</h2>
            <p className="text-white/85">Si dos jugadores tienen los mismos puntos, se ordenan por:</p>
            <ol className="list-decimal space-y-1 pl-6 text-white/85">
              <li>Más respuestas correctas.</li>
              <li>Menor tiempo total sumado en las respuestas correctas (quien fue más rápido).</li>
              <li>Si aun así coinciden, comparten el mismo puesto (por ejemplo, dos 1.º y el siguiente es 3.º).</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-2xl font-bold">Conexión</h2>
            <p className="text-white/85">
              Si se corta la conexión del celular, vuelve a abrir la página: recuperarás tu puntuación mientras la partida siga
              activa. Si el anfitrión se desconecta, la partida se pausa hasta que vuelva.
            </p>
          </section>
        </article>
      </main>
    </Screen>
  );
}
