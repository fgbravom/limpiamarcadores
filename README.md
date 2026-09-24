# limpia/marcadores>

Combina los marcadores de varios navegadores, encuentra carpetas repetidas y links duplicados, decide qué hacer con cada uno y descarga un archivo listo para importar de vuelta.

Todo corre en el navegador. Los archivos no se suben a ningún servidor.

## Uso

1. Exporta tus marcadores a HTML desde tu navegador (Chrome, Edge, Brave, Firefox, Safari, Opera, Vivaldi…). La app trae las instrucciones para cada uno. El `.zip` que exporta Safari se puede cargar tal cual.
2. Abre `index.html` en el navegador y arrastra uno o varios archivos. Con varios, eliges si se mezclan en una sola estructura o si cada archivo queda en su propia carpeta.
3. **Carpetas repetidas:** elige qué grupos fundir. El contenido pasa a la carpeta destino, y las subcarpetas con el mismo nombre también se funden. «Imágenes» e «imagenes» cuentan como iguales.
4. **Marcadores duplicados:** para cada grupo, marca *Mantener*, *Mover* o *Eliminar*, o aplica una acción masiva (conservar el más antiguo, el más reciente o el primero en el árbol).
5. Descarga el resultado (`<nombre>_limpio.html`) e impórtalo en el navegador. Borra antes los marcadores actuales, o se sumarán a los importados.

### Límite al combinar archivos

No hay un tope fijo. Todo se procesa en memoria, y lo que manda es la cantidad total de marcadores:

- Hasta ~60.000 marcadores (unos 25–30 exports de ~2.000) funciona fluido. Fundir todas las carpetas de 4 exports (8.456 marcadores) toma menos de 0,2 s.
- Sobre 60.000 la app pide confirmación: cada cambio tarda alrededor de un segundo y el consumo de memoria sube (los íconos embebidos pesan la mayor parte de cada archivo).
- Las listas se muestran de a 200 grupos, así que la pantalla no se traba aunque haya miles.

### Qué cuenta como duplicado

Se puede configurar si se ignoran:

- `http` vs `https`
- el prefijo `www.`
- la `/` final
- los parámetros de rastreo (`utm_…`)
- el `#fragmento`

## Compatibilidad

Funciona con cualquier archivo en el formato estándar de exportación de marcadores (Netscape Bookmark File), que usan todos los navegadores principales, y con el `.zip` de Safari. Al combinar archivos, solo la primera «barra de marcadores» conserva esa marca en el resultado, para que el navegador no se confunda al importar.

## Desarrollo

Son solo `index.html` y `style.css`, sin dependencias ni paso de build.

## Créditos

Desarrollado con asistencia de [Claude Code](https://claude.com/claude-code), usando el modelo Claude Opus 5.5 de Anthropic.
