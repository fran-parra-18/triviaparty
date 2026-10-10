import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackgroundBlobs, Logo, Screen } from '../components/ui';

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then((m) => setTotal(m.totalQuestions))
      .catch(() => setTotal(null));
  }, []);

  return (
    <Screen>
      <BackgroundBlobs />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-10 px-5 py-10">
        <div className="animate-pop-in text-center">
          <Logo size="xl" />
          <p className="mt-5 text-lg text-white/75 md:text-2xl">
            El juego de preguntas para fiestas: la pantalla grande pregunta, los celulares responden.
          </p>
        </div>

        <div className="grid w-full gap-5 md:grid-cols-2">
          <section className="glass animate-slide-up flex flex-col gap-4 p-6 md:p-8">
            <h2 className="text-2xl font-bold md:text-3xl">📺 Pantalla principal</h2>
            <p className="text-white/70">
              Abre esto en la PC conectada al televisor o proyector. Crea la sala, muestra el QR y dirige la partida.
            </p>
            <button type="button" className="btn-primary mt-auto py-4 text-xl" onClick={() => navigate('/host')}>
              Crear partida
            </button>
          </section>

          <section className="glass animate-slide-up flex flex-col gap-4 p-6 [animation-delay:120ms] md:p-8">
            <h2 className="text-2xl font-bold md:text-3xl">📱 Jugador</h2>
            <p className="text-white/70">Escanea el QR de la pantalla o escribe el código de la sala.</p>
            <form
              className="mt-auto flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(code.trim() ? `/join/${code.trim().toUpperCase()}` : '/join');
              }}
            >
              <label htmlFor="home-code" className="sr-only">
                Código de sala
              </label>
              <input
                id="home-code"
                className="input min-w-0 flex-1 text-center font-display uppercase tracking-[0.3em]"
                placeholder="CÓDIGO"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" className="btn-secondary px-6">
                Unirse
              </button>
            </form>
          </section>
        </div>

        <footer className="flex flex-col items-center gap-2 text-sm text-white/50">
          <Link to="/reglas" className="underline-offset-4 hover:text-white hover:underline">
            Reglas y puntuación
          </Link>
          {total !== null && <span>{total.toLocaleString('es')} preguntas disponibles en el banco</span>}
        </footer>
      </main>
    </Screen>
  );
}
