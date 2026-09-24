# limpia/marcadores>

Combina los marcadores de varios navegadores, encuentra carpetas repetidas, links duplicados y links rotos, decide qué hacer con cada uno y descarga un archivo listo para importar de vuelta.

Todo corre en el navegador. Los archivos no se suben a ningún servidor.

## Uso

1. Exporta tus marcadores a HTML desde tu navegador (Chrome, Edge, Brave, Firefox, Safari, Opera, Vivaldi…). La app trae las instrucciones para cada uno. El `.zip` que exporta Safari se puede cargar tal cual.
2. Abre `index.html` en el navegador y arrastra uno o varios archivos. Con varios, eliges si se mezclan en una sola estructura o si cada archivo queda en su propia carpeta.
3. **Carpetas repetidas:** elige qué grupos fundir. El contenido pasa a la carpeta destino, y las subcarpetas con el mismo nombre también se funden. «Imágenes» e «imagenes» cuentan como iguales.
4. **Marcadores duplicados:** para cada grupo, marca *Mantener*, *Mover* o *Eliminar*, o aplica una acción masiva (conservar el más antiguo, el más reciente o el primero en el árbol).
5. **Links rotos:** revisa los links y mueve o elimina los que ya no funcionan (ver abajo).
6. Descarga el resultado (`<nombre>_limpio.html`) e impórtalo en el navegador. Borra antes los marcadores actuales, o se sumarán a los importados.

### Links rotos

La revisión intenta abrir cada link desde el navegador y separa los resultados en dos niveles:

- **El dominio ya no existe** (consultado vía DNS de Cloudflare): seguro, el sitio completo desapareció.
- **No se pudo abrir / tiempo agotado:** sospechoso. Muchos sitios que funcionan bloquean que otra página los lea (cabecera `Cross-Origin-Resource-Policy`) y desde JavaScript eso no se distingue de un sitio caído. Hay que confirmarlos a mano.

Una página 404 dentro de un sitio que sí existe no se puede detectar desde el navegador. La revisión sí contacta a cada sitio, y la consulta DNS envía a Cloudflare solo el nombre de dominio.

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
- los parámetros de rastreo (`utm_…`, `fbclid`, `spm`, `si`, `ref`…)
- el idioma y el país: subdominios como `es.`, `cl.`, `pt-br.` o `m.`, y parámetros como `?hl=es`. Solo se usa una lista de códigos conocidos, porque subdominios como `id.`, `my.` o `excel.` son servicios distintos.
- el `#fragmento`

Además, **«juntar portadas del mismo sitio»** agrupa las páginas de inicio de un mismo sitio en otro país o dominio (`aliexpress.com` = `aliexpress.cl`) y los marcadores de socios de Vivaldi (`vivaldi.com/bk/aliexpress-cl`). Esos grupos quedan marcados como **parecidos**: pueden ser tiendas o espejos distintos, así que la acción masiva los deja fuera salvo que se marque «incluir los grupos parecidos». Nunca junta sitios con puerto, `localhost` ni IP.

## Compatibilidad

Funciona con cualquier archivo en el formato estándar de exportación de marcadores (Netscape Bookmark File), que usan todos los navegadores principales, y con el `.zip` de Safari. Al combinar archivos, solo la primera «barra de marcadores» conserva esa marca en el resultado, para que el navegador no se confunda al importar.

Probado con exports reales de Brave, Comet, Edge, Firefox, Opera y Vivaldi.

- **Barras de marcadores:** cada navegador le pone otro nombre («Barra de marcadores», «Barra de favoritos», «Marcadores»…). La app las reconoce por su marca interna y las agrupa juntas para fundirlas, aunque se llamen distinto.
- **Papelera:** Opera incluye su papelera en el export (en la prueba eran 798 marcadores ya borrados). Por defecto queda fuera para que no revivan; se puede incluir con una casilla junto al archivo.

> [!WARNING]
> **Safari no se ha probado con un export real.** El soporte se basa en el formato estándar y en un `.zip` armado a mano para las pruebas, no en un archivo sacado de Safari. Si usas marcadores de Safari:
> - guarda una copia del export original antes de empezar;
> - revisa que el total de marcadores y carpetas que muestra la app coincida con lo que tienes en Safari;
> - revisa el archivo resultante antes de borrar tus marcadores actuales.
>
> Si algo falla, abre un issue con el detalle (sin adjuntar tus marcadores).

## Desarrollo

Sin dependencias ni paso de build:

| Archivo | Qué tiene |
|---|---|
| `index.html` | La estructura de la página |
| `style.css` | Los estilos |
| `core.js` | La lógica pura, sin DOM: leer y exportar marcadores, combinar archivos, fundir carpetas, detectar duplicados, leer el `.zip` de Safari y revisar links |
| `app.js` | La interfaz: carga de archivos, pestañas, marcas y descarga |
| `vercel.json` | Cabeceras de seguridad de la versión publicada: solo se ejecutan los scripts propios y no se envía el `Referer` a los sitios revisados |

Los scripts son clásicos (no módulos ES) para que la app funcione abriendo `index.html` con doble clic: los navegadores bloquean los módulos cargados desde `file://`.

`core.js` también se puede usar desde Node, lo que sirve para probar la lógica sin navegador:

```js
const { parseBookmarks, findGroups } = require('./core.js');
```

## Créditos

Desarrollado con asistencia de [Claude Code](https://claude.com/claude-code), usando el modelo Claude Opus 5.5 de Anthropic.

## Licencia

[MIT](LICENSE) © 2026 fgbravom. Puedes usar, copiar, modificar y distribuir este código libremente, siempre que mantengas el aviso de copyright y la licencia. Se entrega «tal cual», sin garantías.
