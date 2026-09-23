# LimpiaMarcadores

Limpia los marcadores de tu navegador: encuentra carpetas repetidas y enlaces duplicados, decide qué hacer con cada uno y descarga un archivo listo para importar.

Todo corre en tu navegador. El archivo no se sube a ningún servidor.

## Uso

1. Exporta tus marcadores a HTML desde tu navegador (Chrome, Edge, Brave, Firefox, Safari, Opera, Vivaldi…). La app trae las instrucciones para cada uno.
2. Abre `index.html` en el navegador y arrastra el archivo exportado.
3. **Carpetas repetidas:** elige qué grupos fundir. El contenido pasa a la carpeta destino, y las subcarpetas con el mismo nombre también se funden. «Imágenes» e «imagenes» cuentan como iguales.
4. **Marcadores duplicados:** para cada grupo, marca *Mantener*, *Mover* o *Eliminar*, o aplica una acción masiva (conservar el más antiguo, el más reciente o el primero en el árbol).
5. Descarga el resultado (`<nombre>_limpio.html`) e impórtalo en el navegador. Borra antes los marcadores actuales, o se sumarán a los importados.

### Qué cuenta como duplicado

Se puede configurar si se ignoran:

- `http` vs `https`
- el prefijo `www.`
- la `/` final
- los parámetros de rastreo (`utm_…`)
- el `#fragmento`

## Compatibilidad

Funciona con cualquier archivo en el formato estándar de exportación de marcadores (Netscape Bookmark File), que usan todos los navegadores principales.

## Desarrollo

Son solo `index.html` y `style.css`, sin dependencias ni paso de build.

## Créditos

Desarrollado con asistencia de [Claude Code](https://claude.com/claude-code), usando el modelo Claude Opus 5.5 de Anthropic.
