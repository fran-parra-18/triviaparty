# Pistas musicales

Scripts para generar las categorías `pistas-*` (preguntas con un fragmento de 30 s de iTunes).

1. Añade canciones en `songs.py`: artista tal como aparece en iTunes, título, tipo (`W` = quién canta, `N` = cómo se llama), opciones con la correcta primero, explicación, dificultad y etiquetas.
2. `python scripts/pistas/find_all.py` busca cada canción en la API pública de iTunes (sin clave). Exige que coincidan artista y título y descarta versiones en vivo, remix, karaoke, etc. Guarda los resultados en `itunes_cache.json` y lista las que no encontró. Revisa a mano lo que imprime: a veces elige una versión rara y hay que ajustar `EXTRA`.
3. `python scripts/pistas/build_audio.py` escribe `server/data/questions/pistas-*.json`.
4. `npm run questions:validate -- --all` y `npm run db:seed`.

Una categoría nueva también hay que añadirla en `shared/src/categories.ts` y en `PREFIX` de `build_audio.py`.
