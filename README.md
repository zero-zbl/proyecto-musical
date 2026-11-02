# Temple · Afinador de guitarra y acordes

Aplicación web progresiva (PWA) gratuita para afinar la guitarra y consultar acordes.
Todo el procesamiento de audio ocurre **en tu teléfono**: sin servidores, sin cuentas,
sin anuncios y sin suscripciones. Una vez abierta, funciona sin conexión.

## Funcionalidades

**Afinador**
- Detección por micrófono con el algoritmo **YIN** + interpolación parabólica
  (error < 2 cents en las pruebas, ~30 lecturas por segundo).
- Tres modos:
  - **Auto**: detecta qué cuerda estás tocando.
  - **Manual**: eliges la cuerda; si está muy lejos te dice cuántos semitonos subir/bajar,
    y al afinarla avanza sola a la siguiente.
  - **Cromático**: cualquier nota (sirve para otros instrumentos).
- Medidor de aguja (±50 cents), colores verde/amarillo/rojo, indicación
  "tensa / afloja la cuerda", frecuencia medida y objetivo.
- Vista de las 6 cuerdas: la cuerda detectada vibra y se colorea; las afinadas quedan
  marcadas con ✓ (vibración al afinar y aviso cuando están las 6).
- Tono de referencia para cada cuerda (🔊).
- Calibración de La4 (420–460 Hz), tolerancia (±2/3/5/10 cents), sensibilidad,
  y pantalla siempre encendida mientras afinas.

**Afinaciones** (las notas objetivo se adaptan automáticamente)
Estándar, medio tono abajo, un tono abajo, Drop D, Drop C♯, Drop C, Drop B, Drop A,
Open D, Open D menor, Open G, Open E, Open A, Open C, DADGAD, Doble Drop D, Nashville
y una **afinación personalizada** editable cuerda por cuerda.

**Biblioteca de acordes**
- 12 tónicas × 17 tipos = **204 acordes** con **414 posiciones** (abiertas + cejillas
  forma E/A/D): mayores, menores, 7, m7, maj7, m7♭5, 7sus4, sus2, sus4, dim, dim7,
  aug, 6, m6, 9, add9 y power chords.
- Diagramas con dedos (1–4), cejillas, cuerdas al aire (○) y sin tocar (×),
  número de traste y nombre de la nota de cada cuerda (tónica en verde).
- Filtros por categoría y por tónica (incluido "♯ / ♭" para sostenidos y bemoles),
  y buscador: `Am7`, `F#m`, `Bbmaj7`, `Solm`, `Sib7`…
- Toca el diagrama para escuchar el acorde rasgueado.
- Notación americana (C D E) o latina (Do Re Mi), con sostenidos o bemoles.

## Instalarla en el teléfono

El micrófono del navegador solo funciona en sitios **HTTPS**, así que la forma más simple
es publicarla gratis con GitHub Pages:

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Haz merge a `main`: el flujo `.github/workflows/pages.yml` ejecuta las pruebas y publica
   la app en `https://<usuario>.github.io/<repositorio>/`.
3. Abre esa URL en el teléfono:
   - **Android (Chrome)**: menú ⋮ → *Instalar aplicación* / *Agregar a pantalla principal*.
   - **iPhone (Safari)**: botón Compartir → *Agregar a pantalla de inicio*.
4. Concede el permiso de micrófono la primera vez que pulses **Activar micrófono**.

(Cualquier hosting estático con HTTPS sirve igual: Netlify, Cloudflare Pages, Vercel…)

## Desarrollo

No hay dependencias ni paso de compilación: HTML, CSS y JavaScript (módulos ES).

```bash
npm start            # servidor local en http://localhost:8080 (el micrófono funciona en localhost)
npm test             # pruebas unitarias (Node ≥ 18)
npm run test:e2e     # pruebas end-to-end en Chromium (requiere Playwright)
```

Para probar desde el teléfono en la red local necesitas HTTPS (por ejemplo,
`npx localtunnel --port 8080` o `cloudflared tunnel --url http://localhost:8080`).

### Estructura

| Archivo | Contenido |
|---|---|
| `js/pitch.js` | Detección de tono YIN, reducción de muestreo y estabilizador (mediana + confirmación de saltos) |
| `js/tuner.js` | Captura del micrófono (Web Audio), filtros y bucle de análisis |
| `js/notes.js` | Teoría: frecuencias, cents, nombres de notas (americano/latino, ♯/♭) |
| `js/tunings.js` | Afinaciones y detección de la cuerda más cercana |
| `js/chords.js` | Tipos de acorde, posiciones abiertas, formas móviles, buscador |
| `js/chord-diagram.js` | Diagramas de acordes en SVG |
| `js/synth.js` | Síntesis de cuerda pulsada (tonos de referencia y rasgueos) |
| `js/app.js` | Interfaz y estado |
| `sw.js`, `manifest.webmanifest` | PWA: uso sin conexión e instalación |

### Pruebas

- `tests/pitch.test.mjs`: senos de 41 Hz a 988 Hz; todas las cuerdas de todas las afinaciones
  con timbre de guitarra (fundamental débil) desafinadas entre −30 y +25 cents; notas pulsadas
  con decaimiento; ruido; silencio; rendimiento; estabilizador.
- `tests/chords.test.mjs`: valida **cada una** de las 414 posiciones: que suenen exactamente las
  notas del acorde, con la tónica en el bajo, que los dedos sean coherentes y tocables, y que
  ninguna cejilla pase sobre una cuerda al aire.
- `tests/e2e.mjs`: abre la app en Chromium con un micrófono simulado y comprueba el flujo completo
  (modos auto/manual/cromático, cambio de afinación, calibración, acordes, ajustes persistentes,
  diseño móvil sin desbordes, funcionamiento sin conexión) y además usa la captura de audio real de
  Chromium alimentada con un archivo WAV.

Al publicar cambios, sube la versión de `CACHE` en `sw.js` para que los teléfonos descarguen
la versión nueva.

## Consejos para afinar mejor

- Pulsa la cuerda con firmeza y deja que suene; la lectura más estable llega ~0,5 s después
  del ataque.
- Afina siempre **subiendo** hacia la nota (si te pasas, baja un poco y vuelve a subir):
  la cuerda se mantiene afinada más tiempo.
- En ambientes ruidosos baja la sensibilidad en Ajustes.
