# Adaptador de CV

Editor de CV + adaptación a cada oferta con IA + carta de presentación + PDF.
Todo en tu ordenador. No sube nada a ningún sitio y no cuesta dinero.

## Arrancar

Doble clic en **`arrancar.command`**. Se abre solo en http://127.0.0.1:8765

Si prefieres el terminal:

```bash
cd ruta/al/adaptador-cv && python3 servidor.py
```

Para pararlo: cierra la ventana del terminal o pulsa Ctrl+C.

## La IA

La IA que adapta el CV es el `claude` de tu terminal (Claude Code), así que **sale de la
suscripción que ya pagas**: no hay API de pago ni claves que gestionar.

La primera vez hay que iniciar sesión una sola vez:

```bash
claude auth login
```

Para comprobarlo: `claude auth status` tiene que decir `loggedIn: true`, y en el programa
el botón **«Probar IA»** debe poner «IA lista». Mientras tanto siempre queda el **modo manual**
(dentro de «Adaptar al empleo»), que hace lo mismo copiando y pegando.

## Cómo se usa

Arriba tienes dos vistas: **Panel** y **Editor del CV**.

### Panel
- **Trabajos de esta semana**: escribes qué buscas y dónde, eliges plazo (24 h / 3 días / 7 días)
  y pulsas Buscar. Trae ofertas de **LinkedIn** y **Tecnoempleo** filtradas por fecha real de
  publicación. Cada tarjeta tiene **Adaptar** (se lleva la oferta al editor con el texto ya puesto)
  y **Ver** (la abre en el navegador).
- **Infojobs**: su web no deja que el navegador hable con tu ordenador, así que va por el marcador:
  buscas en Infojobs, filtras por fecha allí, pulsas el marcador y luego «Pegar ofertas copiadas».
- **Trabajos aplicados**: cada candidatura preparada aparece con su estado (preparada, enviada,
  respondida, entrevista, descartada). Cambias el estado desde el propio desplegable.

### Freelance
La tercera vista. Aquí no se manda el CV: se escribe una propuesta y se compite contra otros
freelancers. Trae proyectos abiertos de **Workana**, **Freelancer.es** y **Freelancermap**.

**El filtro es lo importante, y no es un filtro cualquiera: es un racionador.** Con cuenta
gratuita son unas **6 pujas al mes en Freelancer.es** y **2 contactos por semana en Workana**,
y el de Workana sube con el nivel y con el plan — por eso el cupo es editable desde el panel.
Son unas 8 al mes: pujar a todo no es una opción, así que cada proyecto pasa
por `evaluar_proyecto()`, que lo descarta por tres motivos y lo dice:

- **Fraude** — espectadores artificiales, deepfakes, saltarse captchas, apuestas. Los vetos están
  en español y en inglés, porque la mitad de los anuncios vienen en inglés.
- **Fuera de tu terreno** — PLC, SAP, Revit, 3D, WordPress, diseño gráfico, redacción…
- **Dinero** — se calcula **cuántas horas te paga el tope del presupuesto a tu tarifa**
  (18 €/h netos). No se estima cuánto cuesta el encargo: en el listado la descripción llega
  recortada a 300 caracteres y cualquier estimación de horas salida de ahí es un número inventado.

De 90 proyectos abiertos suelen pasar unos 23. Cada tarjeta dice **Apta · 69/100** y por qué.

Dos vistas: **Oportunidades** y **Propuestas enviadas** (guarda el texto entero de lo que
prometiste; dentro de un mes es la única forma de saberlo). Los presupuestos llegan en seis
monedas y se convierten a **€ o $** para poder compararlos, con el original en el tooltip.

**Piloto automático.** Con **Start** manda una propuesta al día, sola: elige la mejor con cupo,
la redacta, abre la página de la puja, la rellena, le da a enviar, comprueba que entró y te manda
un correo con el proyecto, el importe, los días y el enlace. Una al día y no más, porque con 8
pujas al mes gastarlas de golpe deja la semana siguiente a cero, y los dos sitios penalizan pujar
en masa.

**La prueba de que una puja entró es el contador del propio sitio**, no el texto de la página.
Un `click()` devuelve «pulsado» aunque el formulario no valide. Por fiarse del texto se dio por
enviada una propuesta que Workana nunca recibió.

**El navegador.** Una página servida en `localhost` no puede escribir en un formulario de
`workana.com`: el navegador prohíbe el acceso entre orígenes. Hay dos caminos y con uno basta:

1. **«Abrir el navegador del panel»** — arranca un Chrome aparte con su propio perfil en
   `~/.cvtailor-chrome` y lo conduce por el protocolo de DevTools (`cdp.mjs`). No toca tu Chrome.
   Hay que iniciar sesión una vez en cada sitio. *Workana aguanta; Freelancer.es tira la sesión
   al rato.*
2. **Tu Chrome de siempre** — activando **Ver › Desarrollador › Permitir JavaScript desde Apple
   Events**. Usa las sesiones que ya tienes, que son estables. Es el camino bueno para
   Freelancer.es.

### La foto
En el editor, dentro de **Resumen y foto**, puedes cambiarla: eliges el archivo y el programa la
deja cuadrada, en sRGB y a 900×900 (una de 2700×3600 y 780 KB sale a 107 KB). Si la foto es
vertical puedes decirle si recorta por arriba, por el centro o por abajo. Las fotos nuevas se
guardan en `datos/`; para que el cambio quede fijo, pulsa «Guardar en este perfil».

### Perfiles
Arriba a la derecha (en el editor) tienes el selector de **perfil**. Cada perfil es un CV base
distinto, guardado en `perfiles/`. Lo normal es tener uno por familia de puestos: por ejemplo
«Desarrollo» con los proyectos técnicos y «Atención al cliente» con lo de soporte y trato directo.

Esto importa porque **la IA no inventa**: solo reordena y reescribe lo que hay en el perfil que
tengas puesto. Si te presentas a un puesto técnico con el perfil de atención al cliente activo,
no podrá sacar tus proyectos ni tu stack, porque ahí no están.

- **Guardar en este perfil**: guarda los cambios del editor en el perfil activo.
- **+ Perfil**: duplica lo que tengas en pantalla como un perfil nuevo (por ejemplo «Hostelería»).
- **🗑**: borra el perfil activo (no deja borrar el último).

### Idioma
Los botones **Español / English** de arriba traducen el CV y la carta enteros, incluidos los
títulos de las secciones (WORK EXPERIENCE, SKILLS...). Tarda medio minuto.

### Editor del CV

1. **Contenido** — tu CV. Lo que edites aquí se ve al momento en la vista previa.
   Si quieres que un cambio quede para siempre, pulsa «Guardar en este perfil».
2. **Adaptar al empleo** — pega el **enlace** de la oferta y pulsa «Traer»: rellena solo
   empresa, puesto y el texto.
   - **LinkedIn** y **Tecnoempleo**: funcionan.
   - Cualquier portal que publique la oferta en formato estándar (JSON-LD): funciona.
   - **Infojobs**: bloquea la lectura automática. Para esas webs tienes el **botón de marcador**:
     lo arrastras una vez a la barra de marcadores del navegador y, estando en la oferta, lo
     pulsas: la manda al programa y los campos se rellenan solos. Está desplegando
     «Infojobs y otras webs que bloquean» dentro de «La oferta».
   Luego pulsa «Adaptar CV y escribir carta». La IA:
   - reescribe el resumen y los puntos de tu experiencia con el vocabulario de ESE sector
     (si la oferta es de restauración, habla de gestión, costes y proveedores, no de código);
   - reordena tus conocimientos y deja fuera lo que no pinta nada en ese puesto;
   - te enseña **lo que busca el reclutador** y si lo cumples o no;
   - te da **sugerencias** de lo que podrías añadir: si es verdad, pulsas «Lo tengo» y te lo
     redacta en el estilo del CV;
   - escribe la carta de presentación, que puedes retocar a mano.
3. **Diseño** — seis plantillas, color, tamaño de letra, foto y qué secciones salen.
4. **Descargar CV (PDF)** y **Descargar carta (PDF)**, listos para enviar por email.
5. **Guardar candidatura** deja los dos PDF y los datos en `salidas/fecha_empresa-puesto/`.

## Lo que NO hace

No inventa. Ni tecnologías, ni empresas, ni fechas, ni cifras. Si la oferta pide algo que no
tienes, aparece en «lo que busca el reclutador» marcado en rojo y en las sugerencias, pero
nunca se cuela en tu CV. Lo que añadas tú en «me falta experiencia» es responsabilidad tuya:
escribe solo lo que hayas hecho de verdad.

## Plantillas y ATS

Las seis plantillas ponen el contenido **en una sola columna**, que es lo que los filtros
automáticos (ATS) leen sin perderse. Las de dos columnas con barra lateral quedan bonitas
pero muchos lectores automáticos se las comen mal.

La casilla **«Versión ATS»** va un paso más allá: quita foto y colores y lo deja en texto
plano con títulos estándar. Úsala en portales grandes (Infojobs, LinkedIn Easy Apply,
Workday, SAP SuccessFactors). Para enviar por email a una persona, usa la versión con diseño.

## Archivos

| Archivo | Qué es |
|---|---|
| `perfiles/` | Un CV base por perfil (desarrollo, soporte...). Es lo que usa el programa. |
| `ajustes.json` | Qué perfil tienes activo. |
| `cv_base.json` | El CV original. Ya solo sirve de copia de seguridad. |
| `servidor.py` | El programa. |
| `cdp.mjs` | Conduce el navegador del panel para rellenar y enviar las pujas. |
| `web/` | La interfaz. |
| `datos/` | Tus fotos, y los datos del freelance: `workana.json` (proyectos recogidos), `enviadas.json` (pujas mandadas) y `auto.json` (piloto, cupo y diario). |
| `salidas/` | Cada candidatura guardada, con sus PDF, y `capturas/` para las propuestas. |

## Dos cosas que conviene saber

**El perfil activo manda.** Sin `ajustes.json` el programa usa `cv_base.json`, que puede no ser
el perfil que quieres exportar. Actívalo antes de generar el PDF.

**El ajuste a dos páginas recorta las aptitudes por orden de lista**, no por relevancia: deja las
primeras 30. Si añades una al final de la lista, no saldrá impresa. Por eso las listas van
ordenadas a propósito, con el stack delante. Para comprobarlo, lee el PDF de vuelta en vez de
mirar el JSON.

**El envío de pujas en Freelancer.es** necesita activar en Chrome *Ver › Desarrollador › Permitir
JavaScript desde Apple Events*; con el navegador aparte del panel la sesión no aguanta. En
Workana funciona por los dos caminos.

## Siete fallos corregidos, por si reaparecen

1. Se pulsaba `button[type=submit]`, que en Workana es el **«No, cancelar»** de un modal oculto.
   El bueno es un `input` con valor «Enviar presupuesto». Ahora se busca por texto y tiene que verse.
2. Se daba por enviada una puja buscando «Tu propuesta» en la página… que es la etiqueta del
   propio formulario. Falso positivo seguro. Ahora decide el contador del sitio.
3. El aviso por correo colgaba la petición entera y se perdía el resultado. Tope de 25 s y la
   tanda va en segundo plano.
4. Leer el contador **después** de rellenar navegaba la pestaña fuera del formulario y el envío
   salía «VACIO». Se lee antes.
5. Las URLs de Freelancer.es no llevaban el ID del proyecto: la ficha cargaba y el formulario no.
6. Esperas de tiempo fijo. Workana pasa por Cloudflare y Freelancer es una SPA. Ahora se espera
   **al elemento**, con el tiempo solo como tope.
7. `cdp_vivo()` daba el navegador por muerto con 2 s de margen mientras Chrome pintaba.

**Y uno de antes:** la edad de los proyectos de Workana estaba congelada en el momento de la
recogida, así que uno de hace cuatro días seguía diciendo «Hace 1 hora» y el filtro de 24 h no
descartaba nada. Ahora se suma lo que ha pasado desde la cosecha.

## Si algo falla

- **«IA no disponible»** → lo de `claude` de arriba.
- **El PDF no sale** → hace falta Google Chrome instalado (lo usa para imprimir el PDF).
- **El puerto está ocupado** → `PUERTO=8790 python3 servidor.py`
