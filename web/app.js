/* Adaptador de CV — lógica de la interfaz */
const $ = (s) => document.querySelector(s);
const crear = (tag, props = {}, hijos = []) => {
  const el = Object.assign(document.createElement(tag), props);
  hijos.forEach((h) => el.append(h));
  return el;
};
const COLORES = ["#4A76B8", "#0F6E68", "#2F3A45", "#7A2E3A", "#1F4E79", "#5B4B8A"];
const TITULOS = {
  experiencia: "Experiencia laboral", educacion: "Educación", conocimientos: "Conocimientos",
  proyectos: "Proyectos", idiomas: "Idiomas", certificados: "Certificados", intereses: "Intereses",
};

let cv = null;
let carta = { destino: "", asunto: "", parrafos: [], despedida: "Atentamente," };
let vistaActual = "cv";
let temporizador = null;

/* ---------------------------------------------------------------- utilidades */
async function api(ruta, datos) {
  const r = await fetch(ruta, {
    method: datos ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const tipo = r.headers.get("Content-Type") || "";
  if (tipo.includes("application/pdf")) return r.blob();
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "error " + r.status);
  return j;
}
const lineas = (txt) => txt.split("\n").map((s) => s.trim()).filter(Boolean);
const debounce = (fn, ms) => { clearTimeout(temporizador); temporizador = setTimeout(fn, ms); };

/* ---------------------------------------------------------------- vista previa */
async function refrescar() {
  const cuerpo = vistaActual === "cv" ? { cv, tipo: "cv" } : { cv, carta, tipo: vistaActual };
  const { html } = await api("/api/render", cuerpo);
  const marco = $("#previa");
  return new Promise((listo) => {
    marco.onload = () => {
      let pag = 1;
      try {
        const doc = marco.contentDocument;
        doc.body.style.zoom = "1";                   // medir siempre a tamaño real
        doc.body.style.width = 210 * 3.7795 + "px";
        pag = estimarPaginas(doc);
        const pill = $("#paginas");
        pill.textContent = pag + (pag === 1 ? " página" : " páginas");
        pill.className = "pill " + (pag <= 2 ? "pill-ok" : "pill-mal");
        const ancho = marco.clientWidth;
        if (ancho > 40) {
          // zoom (y no transform) para que el alto y el scroll también se reduzcan
          doc.body.style.zoom = ancho / (210 * 3.7795);
        }
        doc.documentElement.style.overflowX = "hidden";
      } catch (e) { /* vista previa sin medidas */ }
      listo(pag);
    };
    marco.srcdoc = html;
  });
}
/* Chrome no parte los bloques por la mitad, así que hay que simular el salto de
   página bloque a bloque; medir la altura total y dividir se queda corto. */
function estimarPaginas(doc) {
  const px = 3.7795;
  // calibrado contra PDFs reales: el hueco que deja cada salto de bloque se come unos mm
  const primera = 280 * px, siguientes = 268 * px;
  const trozos = [];
  doc.querySelectorAll(".cabecera, .contacto").forEach((el) => trozos.push(el));
  doc.querySelectorAll(".sec").forEach((sec) => {
    const titulo = sec.querySelector("h2");
    // los bloques se parten; los chips y los idiomas fluyen y van como una pieza
    const piezas = [...sec.children].filter((x) => x !== titulo)
      .flatMap((x) => (x.classList.contains("bloque") ? [x] : [x]));
    const partes = piezas.length === 1 && piezas[0].classList.contains("bloque")
      ? piezas : piezas.flatMap((x) => (x.classList.contains("chips") ||
          x.classList.contains("idiomas") ? [x] : [...x.children].length &&
          [...x.children].every((h) => h.classList.contains("bloque")) ? [...x.children] : [x]));
    const lista = partes.length ? partes : (titulo ? [titulo] : []);
    lista.forEach((el, i) => trozos.push(i === 0 && titulo ? [titulo, el] : el));
  });
  const alto = (el) => {
    const piezas = Array.isArray(el) ? el : [el];
    return piezas.reduce((suma, x) => {
      const estilo = doc.defaultView.getComputedStyle(x);
      return suma + x.getBoundingClientRect().height + parseFloat(estilo.marginBottom || 0);
    }, 0);
  };
  let pagina = 1, usado = 0, tope = primera;
  trozos.forEach((t) => {
    const h = alto(t);
    if (usado + h > tope && usado > 0) { pagina++; usado = 0; tope = siguientes; }
    usado += h;
  });
  return pagina;
}

const pintar = () => debounce(refrescar, 250);

/* ---------------------------------------------------------------- editor */
function campo(etiqueta, valor, alCambiar, opciones = {}) {
  const entrada = opciones.filas
    ? crear("textarea", { value: valor || "", rows: opciones.filas })
    : crear("input", { value: valor || "", placeholder: opciones.placeholder || "" });
  entrada.addEventListener("input", () => { alCambiar(entrada.value); pintar(); });
  return crear("label", { textContent: etiqueta }, [entrada]);
}

function ficha(titulo, contenido, alBorrar) {
  const cabeza = crear("div", { className: "cabeza" }, [crear("b", { textContent: titulo })]);
  if (alBorrar) {
    const b = crear("button", { className: "btn-mini", textContent: "Borrar" });
    b.onclick = () => { alBorrar(); pintarEditor(); pintar(); };
    cabeza.append(b);
  }
  return crear("div", { className: "ficha" }, [cabeza, ...contenido]);
}

function acordeon(titulo, contenido, abierto = false) {
  const det = crear("details", { className: "acordeon", open: abierto });
  det.append(crear("summary", {}, [document.createTextNode(titulo)]));
  det.append(crear("div", { className: "interior" }, contenido));
  return det;
}

function botonAnadir(texto, alPulsar) {
  const b = crear("button", { className: "btn-mini", textContent: texto });
  b.onclick = () => { alPulsar(); pintarEditor(); pintar(); };
  return b;
}

function cajaFoto() {
  const vista = crear("img", { className: "foto-vista", alt: "" });
  vista.src = (cv.identidad.foto || "datos/foto_cuadrada.jpg") + "?t=" + Date.now();
  const entrada = crear("input", { type: "file", accept: "image/*" });
  const recorte = crear("select");
  [["centro", "Centrar la cara"], ["arriba", "Recortar por arriba"], ["abajo", "Recortar por abajo"]]
    .forEach(([v, t]) => recorte.append(crear("option", { value: v, textContent: t })));
  const nota = crear("p", { className: "estado" });

  entrada.onchange = () => {
    const fichero = entrada.files[0];
    if (!fichero) return;
    const lector = new FileReader();
    nota.className = "estado";
    nota.textContent = "Ajustando la imagen…";
    lector.onload = async () => {
      try {
        const r = await api("/api/foto", { imagen: lector.result, recorte: recorte.value });
        cv.identidad.foto = r.ruta;
        cv.estilo.foto = true;
        vista.src = r.ruta + "?t=" + Date.now();
        $("#conFoto").checked = true;
        nota.className = "estado ok";
        nota.textContent = "Lista: de " + r.original + " a " + r.ancho + "×" + r.alto +
          " (" + r.kb + " KB). Guarda el perfil si quieres que se quede.";
        refrescar();
      } catch (e) {
        nota.className = "estado mal";
        nota.textContent = e.message;
      }
      entrada.value = "";
    };
    lector.readAsDataURL(fichero);
  };

  const quitar = crear("button", { className: "btn-mini", textContent: "Quitar la foto del CV" });
  quitar.onclick = () => {
    cv.estilo.foto = false;
    $("#conFoto").checked = false;
    nota.className = "estado";
    nota.textContent = "Quitada. Vuelve a marcarla en Diseño cuando quieras.";
    refrescar();
  };

  return crear("div", { className: "foto-caja" }, [
    vista,
    crear("div", { className: "foto-mandos" }, [
      crear("label", { textContent: "Cambiar la foto" }, [entrada]),
      crear("label", { textContent: "Si la foto es vertical" }, [recorte]),
      quitar, nota,
    ]),
  ]);
}

function pintarEditor() {
  const cont = $("#tab-contenido");
  cont.innerHTML = "";
  const id = cv.identidad;

  cont.append(acordeon("Contacto", [
    campo("Nombre", id.nombre, (v) => (id.nombre = v)),
    campo("Titular (solo aparece en la carta)", cv.titular || id.titular, (v) => (cv.titular = v)),
    campo("Email", id.email, (v) => (id.email = v)),
    campo("Teléfono (separa varios con / )", id.telefono, (v) => (id.telefono = v)),
    campo("¿Cuál tiene WhatsApp?", id.whatsapp, (v) => (id.whatsapp = v),
      { placeholder: "+34 600 000 000" }),
    campo("Ciudad", id.ciudad, (v) => (id.ciudad = v)),
    campo("Disponibilidad (sale junto al contacto; déjalo vacío para no mostrarla)",
      id.disponibilidad, (v) => (id.disponibilidad = v),
      { placeholder: "Incorporación inmediata · Jornada completa · Turnos rotativos" }),
    campo("LinkedIn", id.linkedin, (v) => (id.linkedin = v)),
    campo("GitHub", id.github, (v) => (id.github = v)),
  ], true));

  cont.append(acordeon("Resumen y foto", [
    campo("Va dentro de la banda de color, junto a la foto", cv.resumen, (v) => (cv.resumen = v), { filas: 6 }),
    cajaFoto(),
  ], true));

  cont.append(acordeon("Experiencia laboral", [
    ...cv.experiencia.map((x, i) => ficha("Empleo " + (i + 1), [
      campo("Puesto", x.puesto, (v) => (x.puesto = v)),
      campo("Empresa", x.empresa, (v) => (x.empresa = v)),
      campo("Ubicación", x.ubicacion, (v) => (x.ubicacion = v)),
      campo("Periodo", x.periodo, (v) => (x.periodo = v)),
      campo("Puntos (uno por línea)", (x.puntos || []).join("\n"),
        (v) => (x.puntos = lineas(v)), { filas: 8 }),
    ], () => cv.experiencia.splice(i, 1))),
    botonAnadir("+ Añadir empleo", () => cv.experiencia.push(
      { puesto: "", empresa: "", ubicacion: "", periodo: "", puntos: [] })),
  ]));

  cont.append(acordeon("Educación", [
    ...cv.educacion.map((x, i) => ficha("Estudios " + (i + 1), [
      campo("Institución", x.institucion, (v) => (x.institucion = v)),
      campo("Título", x.titulo, (v) => (x.titulo = v)),
      campo("Ubicación", x.ubicacion, (v) => (x.ubicacion = v)),
      campo("Periodo", x.periodo, (v) => (x.periodo = v)),
    ], () => cv.educacion.splice(i, 1))),
    botonAnadir("+ Añadir estudios", () => cv.educacion.push(
      { institucion: "", titulo: "", ubicacion: "", periodo: "" })),
  ]));

  cont.append(acordeon("Conocimientos", [
    campo("Uno por línea. El orden es el que sale en el CV.", cv.conocimientos.join("\n"),
      (v) => (cv.conocimientos = lineas(v)), { filas: 12 }),
  ]));

  cont.append(acordeon("Proyectos", [
    ...cv.proyectos.map((x, i) => ficha("Proyecto " + (i + 1), [
      campo("Nombre", x.nombre, (v) => (x.nombre = v)),
      campo("Stack", x.stack, (v) => (x.stack = v)),
      campo("Enlace", x.enlace, (v) => (x.enlace = v)),
      campo("Descripción", x.texto, (v) => (x.texto = v), { filas: 3 }),
    ], () => cv.proyectos.splice(i, 1))),
    botonAnadir("+ Añadir proyecto", () => cv.proyectos.push(
      { nombre: "", stack: "", enlace: "", texto: "" })),
  ]));

  cont.append(acordeon("Idiomas", [
    ...cv.idiomas.map((x, i) => ficha(x.idioma || "Idioma", [
      campo("Idioma", x.idioma, (v) => (x.idioma = v)),
      campo("Nivel", x.nivel, (v) => (x.nivel = v)),
      campo("Puntos (1 a 5)", x.puntos, (v) => (x.puntos = Number(v) || 0)),
    ], () => cv.idiomas.splice(i, 1))),
    botonAnadir("+ Añadir idioma", () => cv.idiomas.push({ idioma: "", nivel: "", puntos: 3 })),
  ]));

  cont.append(acordeon("Certificados", [
    ...cv.certificados.map((x, i) => ficha("Certificado " + (i + 1), [
      campo("Título", x.titulo, (v) => (x.titulo = v)),
      campo("Entidad", x.entidad, (v) => (x.entidad = v)),
      campo("Fecha", x.fecha, (v) => (x.fecha = v)),
    ], () => cv.certificados.splice(i, 1))),
    botonAnadir("+ Añadir certificado", () => cv.certificados.push({ titulo: "", entidad: "", fecha: "" })),
  ]));

  cont.append(acordeon("Intereses", [
    campo("Uno por línea", (cv.intereses || []).join("\n"), (v) => (cv.intereses = lineas(v)), { filas: 4 }),
  ]));

  pintarDestinos();
}

/* ---------------------------------------------------------------- diseño */
let plantillas = {};

function pintarPlantillas() {
  const caja = $("#plantillas");
  caja.textContent = "";
  Object.entries(plantillas).forEach(([clave, nombre]) => {
    const [titulo, desc] = nombre.split(" — ");
    const b = crear("button", {
      className: "plantilla" + (cv.estilo.plantilla === clave ? " activa" : ""),
    }, [crear("b", { textContent: titulo }), crear("span", { textContent: desc || "" })]);
    b.onclick = () => { cv.estilo.plantilla = clave; pintarPlantillas(); pintar(); };
    caja.append(b);
  });
  $("#modoATS").checked = !!cv.estilo.ats;
}

function pintarDiseno() {
  pintarPlantillas();
  const cajaColor = $("#colores");
  cajaColor.innerHTML = "";
  COLORES.forEach((c) => {
    const b = crear("button", { className: cv.estilo.color === c ? "activo" : "" });
    b.style.background = c;
    b.onclick = () => { cv.estilo.color = c; pintarDiseno(); pintar(); };
    cajaColor.append(b);
  });
  $("#tamano").value = cv.estilo.tamano;
  $("#valTamano").textContent = cv.estilo.tamano + " pt";
  $("#conFoto").checked = cv.estilo.foto !== false;

  const caja = $("#secciones");
  caja.innerHTML = "";
  cv.orden.forEach((clave, i) => {
    const marca = crear("input", { type: "checkbox", checked: !cv.secciones_ocultas.includes(clave) });
    marca.onchange = () => {
      cv.secciones_ocultas = marca.checked
        ? cv.secciones_ocultas.filter((s) => s !== clave)
        : [...cv.secciones_ocultas, clave];
      pintar();
    };
    const mover = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= cv.orden.length) return;
      [cv.orden[i], cv.orden[j]] = [cv.orden[j], cv.orden[i]];
      pintarDiseno(); pintar();
    };
    const arriba = crear("button", { className: "btn-mini", textContent: "↑" });
    const abajo = crear("button", { className: "btn-mini", textContent: "↓" });
    arriba.onclick = () => mover(-1);
    abajo.onclick = () => mover(1);
    caja.append(crear("label", {}, [marca, document.createTextNode(TITULOS[clave] || clave),
      crear("span", { className: "orden" }, [arriba, abajo])]));
  });
}

/* ---------------------------------------------------------------- carta */
function pintarCarta() {
  $("#ca-destino").value = carta.destino || "";
  $("#ca-asunto").value = carta.asunto || "";
  $("#ca-parrafos").value = (carta.parrafos || []).join("\n\n");
  $("#ca-despedida").value = carta.despedida || "Atentamente,";
}
function leerCarta() {
  carta.destino = $("#ca-destino").value;
  carta.asunto = $("#ca-asunto").value;
  carta.parrafos = $("#ca-parrafos").value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  carta.despedida = $("#ca-despedida").value;
  pintar();
}

function pintarDestinos() {
  const sel = $("#ex-destino");
  sel.innerHTML = "";
  cv.experiencia.forEach((x, i) => sel.append(
    crear("option", { value: "exp:" + i, textContent: "Experiencia: " + (x.puesto || "empleo " + (i + 1)) })));
  sel.append(crear("option", { value: "proyecto", textContent: "Un proyecto nuevo" }));
  sel.append(crear("option", { value: "conocimientos", textContent: "Solo conocimientos (chips)" }));
}

/* ------------------------------------------------- lo que pide el reclutador */
function pintarRequisitos(lista, cobertura) {
  const caja = $("#requisitos");
  caja.textContent = "";
  $("#cajaRequisitos").hidden = !lista.length;
  if (!lista.length) return;

  ultimaCobertura = cobertura || null;
  ultimosRequisitos = lista;

  if (cobertura && (cobertura.perdidas || []).length) {
    const cuales = [...new Set(cobertura.perdidas.map((p) => p.palabra))].join(", ");
    const boton = crear("button", { className: "btn ancho", textContent: "Recuperar lo que se ha caído" });
    boton.onclick = async () => {
      boton.disabled = true;
      const nodo = $("#estadoAdaptar");
      try {
        const r = await conEstado(nodo, "Recuperando lo tuyo que faltaba…",
          () => api("/api/rellenar-huecos", { cv, carta, perdidas: cobertura.perdidas,
            requisitos: ultimosRequisitos, ajustes: leerAjustes() }));
        cv = r.cv;
        pintarEditor(); refrescar();
        pintarRequisitos(r.requisitos || [], r.cobertura);
        nodo.className = "estado ok";
        nodo.textContent = "Recuperado. Repasa que siga siendo verdad.";
      } catch (e) { boton.disabled = false; }
    };
    caja.append(crear("div", { className: "perdidas" }, [
      crear("b", { textContent: "Esto lo tienes en tu perfil y se ha quedado fuera" }),
      crear("span", { textContent: cuales }),
      boton,
    ]));
  }

  if (cobertura && cobertura.imprescindibles) {
    const pct = cobertura.porcentaje;
    const barra = crear("div", { className: "barra-cobertura" });
    const relleno = crear("i");
    relleno.style.width = pct + "%";
    relleno.className = pct >= 80 ? "alta" : pct >= 50 ? "media" : "baja";
    barra.append(relleno);
    caja.append(crear("div", { className: "cobertura" }, [
      crear("b", { textContent: "Cubres " + cobertura.cubiertos + " de " +
        cobertura.imprescindibles + " requisitos imprescindibles" }),
      barra,
      crear("span", { className: "ayuda", textContent:
        "Comprobado buscando las palabras del anuncio dentro del CV que ha salido, no es una opinión." }),
    ]));
  }

  const signo = { si: "✓", parcial: "~", no: "✕" };
  lista.forEach((r) => {
    const estado = ["si", "parcial", "no"].includes(r.cumple) ? r.cumple : "parcial";
    const cabeza = crear("b", { textContent: r.pide || "" });
    if (r.peso === "imprescindible") {
      cabeza.append(crear("em", { className: "peso", textContent: "imprescindible" }));
    }
    const palabras = crear("span", { className: "palabras" });
    (r.palabras_detalle || []).forEach((d) => {
      palabras.append(crear("span", {
        className: "palabra" + (d.en_cv ? " esta" : d.en_perfil ? " perfil" : d.en_carta ? " carta" : ""),
        textContent: (d.en_cv ? "✓ " : d.en_perfil ? "↩ " : d.en_carta ? "carta: " : "✕ ") + d.palabra,
        title: d.en_cv ? "Aparece en tu CV"
          : d.en_perfil ? "Lo tienes en tu perfil pero se ha quedado fuera del CV adaptado"
          : d.en_carta ? "Solo aparece en la carta" : "No aparece en ningún sitio",
      }));
    });
    caja.append(crear("div", { className: "req" }, [
      crear("span", { className: "marca-req " + estado, textContent: signo[estado] }),
      crear("div", { className: "txt" }, [
        cabeza,
        crear("span", { textContent: r.donde || "" }),
        palabras,
      ]),
    ]));
  });
}

function insertarSugerencia(s) {
  const frase = (s.si_lo_tienes || "").trim();
  const bruto = String(s.donde || "").toLowerCase().trim();
  // la IA puede contestar en inglés ("experience:0", "skills"): lo aceptamos igual
  let destino = "experiencia";
  if (/^(proy|proj)/.test(bruto)) destino = "proyecto";
  else if (/(conoc|skill|knowledge|habilidad)/.test(bruto)) destino = "conocimientos";
  const numero = bruto.match(/(\d+)/);
  const indice = numero ? Number(numero[1]) : 0;

  let puesto = false;
  if (frase) {
    if (destino === "proyecto") {
      cv.proyectos.unshift({ nombre: "Proyecto (ponle nombre)",
        stack: (s.conocimientos || []).join(", "), enlace: "", texto: frase });
      puesto = true;
    } else if (cv.experiencia.length) {           // conocimientos sueltos también llevan frase
      const i = Math.min(Math.max(indice, 0), cv.experiencia.length - 1);
      cv.experiencia[i].puntos.unshift(frase);
      puesto = true;
      destino = destino === "conocimientos" ? "experiencia" : destino;
    }
  }
  let chips = 0;
  (s.conocimientos || []).forEach((c) => {
    if (c && !cv.conocimientos.some((x) => String(x).toLowerCase() === String(c).toLowerCase())) {
      cv.conocimientos.unshift(c);
      chips++;
    }
  });
  pintarEditor(); refrescar();
  return { puesto, chips, destino };
}

function pintarSugerencias(lista) {
  const caja = $("#sugerencias");
  caja.textContent = "";
  $("#cajaSugerencias").hidden = !lista.length;
  lista.forEach((s) => {
    const ficha = crear("div", { className: "sug" }, [
      crear("p", { textContent: s.pregunta || "" }),
      crear("q", { textContent: s.si_lo_tienes || "" }),
    ]);
    const anadir = crear("button", { className: "btn-mini", textContent: "Lo tengo → añadir" });
    anadir.onclick = () => {                       // directo, sin esperar a la IA
      const r = insertarSugerencia(s);
      if (!r.puesto && !r.chips) {
        anadir.textContent = "No he sabido dónde ponerlo";
        return;
      }
      ficha.classList.add("puesta");
      anadir.disabled = true;
      anadir.textContent = r.puesto ? "Añadido ✓ a " + r.destino : "Añadido ✓ a conocimientos";
      editar.textContent = "Ver dónde ha quedado";
    };
    const editar = crear("button", { className: "btn-mini", textContent: "Redactarlo a mi manera" });
    editar.onclick = () => {
      $("#ex-texto").value = s.si_lo_tienes || s.pregunta || "";
      const n = String(s.donde || "").match(/(\d+)/);
      $("#ex-destino").value = /(proy|proj)/i.test(s.donde || "")
        ? "proyecto" : "exp:" + (n ? n[1] : 0);
      $("#ex-texto").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#ex-texto").focus();
    };
    ficha.append(crear("span", { className: "botones" }, [anadir, editar]));
    caja.append(ficha);
  });
}

/* ---------------------------------------------------------------- ajustes de la oferta */
const leerAjustes = () => ({
  empresa: $("#of-empresa").value, puesto: $("#of-puesto").value, fuente: $("#of-fuente").value,
  idioma: $("#of-idioma").value, oferta: $("#of-texto").value, notas: $("#of-notas").value,
  url: $("#of-url").value,
});

/* ---------------------------------------------------------------- acciones */
async function conEstado(nodo, texto, fn) {
  nodo.className = "estado";
  nodo.textContent = texto;
  const t0 = Date.now();
  const reloj = setInterval(() => {
    nodo.textContent = texto + " (" + Math.round((Date.now() - t0) / 1000) + " s)";
  }, 1000);
  try {
    const r = await fn();
    clearInterval(reloj);
    return r;
  } catch (e) {
    clearInterval(reloj);
    nodo.className = "estado mal";
    nodo.textContent = e.message;
    throw e;
  }
}

async function descargar(tipo) {
  const nombre = ({ carta: "Carta_", conjunto: "Carta_y_CV_" }[tipo] || "CV_") +
    (cv.identidad.nombre || "cv").replace(/\s+/g, "_") +
    ($("#of-empresa").value ? "_" + $("#of-empresa").value.replace(/\s+/g, "_") : "");
  const blob = await api("/api/pdf", { cv, carta, tipo, nombre });
  const url = URL.createObjectURL(blob);
  const a = crear("a", { href: url, download: nombre + ".pdf" });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function inicio() {
  [cv, plantillas] = await Promise.all([api("/api/base"), api("/api/plantillas")]);
  await cargarPerfiles();
  cv.secciones_ocultas = cv.secciones_ocultas || [];
  cv.estilo = Object.assign({ color: "#4A76B8", tamano: 10, foto: true, plantilla: "cape_town", ats: false },
    cv.estilo || {});
  pintarEditor(); pintarDiseno(); pintarCarta(); pintarIdioma(); refrescar(); cargarHistorial();
}

async function cargarHistorial() {
  const filas = await api("/api/candidaturas");
  const caja = $("#historial");
  caja.innerHTML = filas.length ? "" : '<p class="ayuda">Todavía no has guardado ninguna.</p>';
  filas.forEach((f) => {
    const a = crear("a", { textContent: `${f.empresa || "—"} · ${f.puesto || "—"} · ${(f.fecha || "").slice(0, 10)}` });
    a.onclick = async () => {
      const d = await api("/api/candidatura/" + f.carpeta);
      cv = d.cv; carta = d.carta || carta;
      const aj = d.ajustes || {};
      $("#of-empresa").value = aj.empresa || ""; $("#of-puesto").value = aj.puesto || "";
      $("#of-fuente").value = aj.fuente || ""; $("#of-texto").value = aj.oferta || "";
      $("#of-notas").value = aj.notas || "";
      pintarEditor(); pintarDiseno(); pintarCarta(); refrescar();
    };
    caja.append(a);
  });
}

/* ---------------------------------------------------------------- eventos */
document.querySelectorAll(".pest[data-tab]").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".pest[data-tab]").forEach((x) => x.classList.remove("activa"));
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("activa"));
    b.classList.add("activa");
    $("#tab-" + b.dataset.tab).classList.add("activa");
  };
});
document.querySelectorAll(".pest[data-vista]").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".pest[data-vista]").forEach((x) => x.classList.remove("activa"));
    b.classList.add("activa");
    vistaActual = b.dataset.vista;
    refrescar();
  };
});
["ca-destino", "ca-asunto", "ca-parrafos", "ca-despedida"].forEach((id) =>
  $("#" + id).addEventListener("input", () => debounce(leerCarta, 300)));
$("#tamano").oninput = (ev) => {
  cv.estilo.tamano = Number(ev.target.value);
  $("#valTamano").textContent = cv.estilo.tamano.toFixed(1) + " pt";
  pintar();
};
$("#conFoto").onchange = (ev) => { cv.estilo.foto = ev.target.checked; pintar(); };
$("#btnAjustar").onclick = async () => {
  const nodo = $("#estadoAjuste");
  const boton = $("#btnAjustar");
  boton.disabled = true;
  const original = cv.estilo.tamano;
  const paginasReales = async (tam) => {
    cv.estilo.tamano = tam;
    nodo.className = "estado";
    nodo.textContent = "Probando con letra de " + tam.toFixed(1) + " pt… (mido el PDF de verdad)";
    const r = await api("/api/paginas", { cv, tipo: "cv" });
    return r.paginas;
  };
  try {
    let bajo = 8.4, alto = 11.4, mejor = null;
    let pag = await paginasReales(original);
    if (pag <= 2) { bajo = original; mejor = original; } else { alto = original; }
    for (let i = 0; i < 4 && alto - bajo > 0.25; i++) {
      const medio = Math.round(((bajo + alto) / 2) * 10) / 10;
      pag = await paginasReales(medio);
      if (pag <= 2) { mejor = medio; bajo = medio; } else { alto = medio; }
    }
    if (mejor === null) {
      pag = await paginasReales(8.4);
      if (pag <= 2) mejor = 8.4;
    }
    if (mejor === null) {
      cv.estilo.tamano = original;
      nodo.className = "estado mal";
      nodo.textContent = "Ni con la letra más pequeña cabe en 2 páginas: quita algún punto de tu experiencia.";
    } else {
      cv.estilo.tamano = mejor;
      nodo.className = "estado ok";
      nodo.textContent = "Cabe en 2 páginas con letra de " + mejor.toFixed(1) + " pt. (Comprobado en el PDF.)";
    }
    pintarDiseno();
    await refrescar();
  } catch (e) {
    cv.estilo.tamano = original;
    nodo.className = "estado mal";
    nodo.textContent = e.message;
    await refrescar();
  }
  boton.disabled = false;
};

$("#modoATS").onchange = (ev) => { cv.estilo.ats = ev.target.checked; pintar(); };

$("#btnProbar").onclick = async () => {
  const pill = $("#estadoIA");
  pill.className = "pill pill-gris"; pill.textContent = "probando…";
  const r = await api("/api/probar", {});
  pill.className = "pill " + (r.ok ? "pill-ok" : "pill-mal");
  pill.textContent = r.ok ? "IA lista" : "IA no disponible";
  if (!r.ok) alert("La IA no responde:\n\n" + r.detalle);
};

function aplicarAdaptacion(r) {
  cv = r.cv;
  carta = Object.assign({ despedida: "Atentamente," }, r.carta || {});
  if (!carta.destino) carta.destino = $("#of-empresa").value;
  pintarEditor(); pintarDiseno(); pintarCarta(); refrescar();
  $("#enfoque").textContent = r.enfoque
    ? (r.sector ? "Sector: " + r.sector + ". " : "") + r.enfoque : "";
  pintarRequisitos(r.requisitos || [], r.cobertura);
  pintarSugerencias(r.sugerencias || []);
}

/* botón de marcador: lo montamos desde el fichero, para no duplicar el código */
(async () => {
  try {
    const fuente = await (await fetch("/web/marcador.js")).text();
    const enlace = "javascript:" + encodeURIComponent(fuente.replace(/\n\s*/g, " "));
    document.querySelectorAll("a.marcador").forEach((a) => {
      a.href = enlace;
      a.onclick = (ev) => {
        ev.preventDefault();
        alert("No lo pulses aquí: arrástralo a la barra de marcadores y úsalo estando en la oferta.");
      };
    });
  } catch (e) { /* sin marcador, se sigue pudiendo pegar a mano */ }
})();

/* si llega una oferta desde el marcador, rellenamos los campos solos */
let ultimaOfertaVista = 0;
setInterval(async () => {
  try {
    const o = await api("/api/ultima-oferta");
    if (!o.ts || o.ts === ultimaOfertaVista) return;
    ultimaOfertaVista = o.ts;
    if (o.puesto) $("#of-puesto").value = o.puesto;
    if (o.empresa) $("#of-empresa").value = o.empresa;
    if (o.fuente) $("#of-fuente").value = o.fuente;
    if (o.url) $("#of-url").value = o.url;
    if (o.texto) $("#of-texto").value = o.texto;
    const nodo = $("#estadoUrl");
    nodo.className = "estado ok";
    nodo.textContent = "Llegó desde el navegador: " + (o.puesto || "") +
      (o.empresa ? " · " + o.empresa : "");
  } catch (e) { /* servidor ocupado */ }
}, 3000);

$("#btnTraer").onclick = async () => {
  const nodo = $("#estadoUrl");
  const url = $("#of-url").value.trim();
  if (!url) { nodo.className = "estado mal"; nodo.textContent = "Pega antes el enlace."; return; }
  $("#btnTraer").disabled = true;
  try {
    const r = await conEstado(nodo, "Abriendo la oferta…", () => api("/api/oferta-url", { url }));
    if (r.puesto) $("#of-puesto").value = r.puesto;
    if (r.empresa) $("#of-empresa").value = r.empresa;
    if (r.fuente) $("#of-fuente").value = r.fuente;
    if (r.texto) $("#of-texto").value = r.texto;
    nodo.className = "estado ok";
    nodo.textContent = "Traído: " + (r.puesto || "?") + (r.empresa ? " · " + r.empresa : "") +
      ". Repasa el texto por si falta algo.";
  } catch (e) { /* el estado ya muestra el error */ }
  $("#btnTraer").disabled = false;
};

$("#btnManual").onclick = () => {
  const m = $("#manual");
  m.hidden = !m.hidden;
  $("#btnManual").textContent = m.hidden
    ? "¿La IA no responde? Hazlo a mano →" : "Ocultar el modo manual";
};

$("#btnCopiar").onclick = async () => {
  const tipo = $("#ex-texto").value.trim() ? "experiencia" : "adaptar";
  const { prompt } = await api("/api/prompt", {
    cv, ajustes: leerAjustes(), tipo,
    texto: $("#ex-texto").value, destino: $("#ex-destino").value,
  });
  try {
    await navigator.clipboard.writeText(prompt);
    $("#estadoManual").className = "estado ok";
    $("#estadoManual").textContent = "Copiado (" + tipo + "). Pégaselo a Claude y trae su respuesta.";
  } catch (e) {
    $("#respuestaIA").value = prompt;
    $("#estadoManual").className = "estado";
    $("#estadoManual").textContent = "No he podido copiarlo: lo he puesto en el cuadro de abajo, córtalo de ahí.";
  }
};

$("#btnAplicar").onclick = async () => {
  const nodo = $("#estadoManual");
  try {
    const r = await api("/api/aplicar", { cv, respuesta: $("#respuestaIA").value, tipo: "adaptar" });
    aplicarAdaptacion(r);
    $("#respuestaIA").value = "";
    nodo.className = "estado ok";
    nodo.textContent = "Aplicado. Revísalo antes de enviarlo.";
  } catch (e) {
    nodo.className = "estado mal";
    nodo.textContent = e.message;
  }
};

$("#btnAdaptar").onclick = async () => {
  const nodo = $("#estadoAdaptar");
  $("#btnAdaptar").disabled = true;
  try {
    const r = await conEstado(nodo, "Adaptando tu CV y escribiendo la carta…",
      () => api("/api/adaptar", { cv, ajustes: leerAjustes() }));
    aplicarAdaptacion(r);
    nodo.className = "estado ok";
    nodo.textContent = "Listo. Revísalo antes de enviarlo.";
  } catch (e) {
    if (/authenticate|oauth/i.test(e.message)) {   // sin sesión: abrimos el modo manual
      $("#manual").hidden = false;
      $("#btnManual").textContent = "Ocultar el modo manual";
    }
  }
  $("#btnAdaptar").disabled = false;
};

$("#btnAnadirEx").onclick = async () => {
  const nodo = $("#estadoEx");
  const texto = $("#ex-texto").value.trim();
  if (!texto) { nodo.className = "estado mal"; nodo.textContent = "Escribe primero qué has hecho."; return; }
  const destino = $("#ex-destino").value;
  $("#btnAnadirEx").disabled = true;
  try {
    const r = await conEstado(nodo, "Redactando…",
      () => api("/api/anadir-experiencia", { cv, texto, destino, ajustes: leerAjustes() }));
    const puntos = r.puntos || [];
    if (destino.startsWith("exp:")) {
      const i = Number(destino.split(":")[1]);
      cv.experiencia[i].puntos = [...puntos, ...cv.experiencia[i].puntos];
    } else if (destino === "proyecto") {
      cv.proyectos.unshift({ nombre: "Nuevo proyecto (ponle nombre)", stack: (r.conocimientos || []).join(", "),
        enlace: "", texto: puntos.join(" ") });
    }
    (r.conocimientos || []).forEach((c) => { if (!cv.conocimientos.includes(c)) cv.conocimientos.unshift(c); });
    $("#ex-texto").value = "";
    pintarEditor(); refrescar();
    nodo.className = "estado ok";
    nodo.textContent = "Añadido arriba del todo. " + (r.aviso || "Revísalo por si acaso.");
  } catch (e) { /* ya mostrado */ }
  $("#btnAnadirEx").disabled = false;
};

/* ---------------------------------------------------------------- enviar */
let envio = null;

$("#btnPreparar").onclick = async () => {
  const nodo = $("#estadoEnvio");
  $("#btnPreparar").disabled = true;
  try {
    envio = await conEstado(nodo, "Generando los PDF y guardando la candidatura…",
      () => api("/api/preparar-envio", { cv, carta, ajustes: leerAjustes() }));
    const caja = $("#archivos");
    caja.textContent = "";
    Object.entries(envio.archivos).forEach(([clave, ruta]) => {
      const nombre = ruta.split("/").pop();
      const fila = crear("div", { className: "archivo" }, [crear("span", { textContent: nombre })]);
      const b = crear("button", { className: "btn-mini", textContent: "Descargar" });
      b.onclick = () => descargar(clave === "conjunto" ? "conjunto" : clave);
      fila.append(b);
      caja.append(fila);
    });
    $("#cajaEnvio").hidden = false;
    $("#en-para").value = envio.email || "";
    $("#en-asunto").value = envio.asunto || "";
    $("#en-cuerpo").value = envio.cuerpo || "";
    nodo.className = "estado ok";
    nodo.textContent = "Listo, en " + envio.carpeta.split("/").pop();
  } catch (e) { /* mostrado */ }
  $("#btnPreparar").disabled = false;
};

const abrir = (que, valor) => api("/api/abrir", { que, valor });
$("#btnAbrirOferta").onclick = () => {
  const url = $("#of-url").value.trim();
  if (!url) return alert("No tengo el enlace de la oferta: pégalo en «Adaptar al empleo».");
  abrir("url", url);
};
$("#btnAbrirCarpeta").onclick = () => envio && abrir("carpeta", envio.carpeta);
$("#btnCopiarCarta").onclick = async () => {
  await navigator.clipboard.writeText($("#en-cuerpo").value || "");
  $("#btnCopiarCarta").textContent = "Copiada ✓";
  setTimeout(() => ($("#btnCopiarCarta").textContent = "Copiar la carta"), 2000);
};
$("#btnParaMi").onclick = () => { $("#en-para").value = cv.identidad.email || ""; };
$("#btnMail").onclick = async () => {
  if (!envio) return alert("Pulsa antes «Preparar envío».");
  const nodo = $("#estadoEnvio");
  try {
    await api("/api/abrir", {
      que: "mail", para: $("#en-para").value, asunto: $("#en-asunto").value,
      cuerpo: $("#en-cuerpo").value, adjuntos: Object.values(envio.archivos),
    });
    nodo.className = "estado ok";
    nodo.textContent = "Borrador abierto en Mail con los PDF. Revísalo y envíalo tú.";
  } catch (e) {
    nodo.className = "estado mal";
    nodo.textContent = e.message;
  }
};
$("#btnMailto").onclick = () => {
  const url = "mailto:" + encodeURIComponent($("#en-para").value) +
    "?subject=" + encodeURIComponent($("#en-asunto").value) +
    "&body=" + encodeURIComponent($("#en-cuerpo").value);
  window.location.href = url;
};

/* ---------------------------------------------------------------- perfiles */
let perfiles = [];

function pintarPerfiles() {
  const sel = $("#selPerfil");
  sel.textContent = "";
  perfiles.forEach((p) => {
    const op = crear("option", { value: p.slug, textContent: p.nombre });
    if (p.activo) op.selected = true;
    sel.append(op);
  });
  $("#btnBorrarPerfil").disabled = perfiles.length <= 1;
}

async function cargarPerfiles() {
  perfiles = await api("/api/perfiles");
  pintarPerfiles();
}

$("#selPerfil").onchange = async () => {
  const r = await api("/api/usar-perfil", { slug: $("#selPerfil").value });
  cv = r.cv;
  cv.secciones_ocultas = cv.secciones_ocultas || [];
  cv.estilo = Object.assign({ color: "#4A76B8", tamano: 10, foto: true, plantilla: "cape_town", ats: false },
    cv.estilo || {});
  await cargarPerfiles();
  pintarEditor(); pintarDiseno(); pintarIdioma(); refrescar();
};

$("#btnNuevoPerfil").onclick = async () => {
  const nombre = prompt("Nombre del perfil nuevo (ej.: Desarrollo, Soporte, Hostelería):",
    "Perfil " + (perfiles.length + 1));
  if (!nombre) return;
  const r = await api("/api/guardar-perfil", { nombre, cv });
  perfiles = r.perfiles;
  pintarPerfiles();
  $("#btnNuevoPerfil").textContent = "Creado ✓";
  setTimeout(() => ($("#btnNuevoPerfil").textContent = "+ Perfil"), 1800);
};

$("#btnBorrarPerfil").onclick = async () => {
  const actual = perfiles.find((p) => p.activo) || perfiles[0];
  if (!confirm("¿Borro el perfil «" + actual.nombre + "»? El CV que contiene se pierde.")) return;
  const r = await api("/api/borrar-perfil", { slug: actual.slug });
  perfiles = r.perfiles;
  pintarPerfiles();
  $("#selPerfil").onchange();
};

/* ---------------------------------------------------------------- idioma */
function pintarIdioma() {
  const en = cv.idioma === "en";
  $("#btnEn").classList.toggle("activa", en);
  $("#btnEs").classList.toggle("activa", !en);
}

async function cambiarIdioma(idioma) {
  if ((cv.idioma || "es") === idioma) return;
  const aviso = idioma === "en"
    ? "Voy a traducir el CV y la carta al inglés. Tarda un par de minutos. ¿Sigo?"
    : "Voy a traducirlo todo al español. ¿Sigo?";
  if (!confirm(aviso)) return;
  const nodo = $("#estadoAdaptar");
  document.querySelector('.pest[data-tab="adaptar"]').click();
  try {
    const r = await conEstado(nodo, "Traduciendo el CV y la carta…",
      () => api("/api/traducir", { cv, carta, idioma }));
    cv = r.cv; carta = r.carta || carta;
    pintarEditor(); pintarDiseno(); pintarCarta(); pintarIdioma(); refrescar();
    nodo.className = "estado ok";
    nodo.textContent = idioma === "en" ? "Traducido. Revísalo antes de enviarlo." : "Vuelto al español.";
  } catch (e) { /* mostrado */ }
}
$("#btnEn").onclick = () => cambiarIdioma("en");
$("#btnEs").onclick = () => cambiarIdioma("es");

$("#btnPdfCV").onclick = () => descargar("cv");
$("#btnPdfCarta").onclick = () => descargar("carta");
$("#btnGuardarBase").onclick = async () => {
  await api("/api/guardar-base", { cv });
  $("#btnGuardarBase").textContent = "Guardado ✓";
  setTimeout(() => ($("#btnGuardarBase").textContent = "Guardar en este perfil"), 2000);
};
$("#btnGuardarCand").onclick = async () => {
  const r = await api("/api/guardar-candidatura", { cv, carta, ajustes: leerAjustes() });
  alert("Guardado en:\n" + r.carpeta);
  cargarHistorial();
};


/* ---------------------------------------------------------------- panel */
const ESTADOS = ["preparada", "enviada", "respondida", "entrevista", "descartada"];
let ofertasEncontradas = [];
let ultimaCobertura = null;
let ultimosRequisitos = [];
let filtroEstado = "";
const urlsAplicadas = new Set();

function mostrarVista(v) {
  document.querySelectorAll("[data-vista-principal]").forEach((b) =>
    b.classList.toggle("activa", b.dataset.vistaPrincipal === v));
  $("#panel").hidden = v !== "panel";
  $("#editor").hidden = v !== "editor";
  $("#acciones-editor").hidden = v !== "editor";   // esos botones son del editor
  if (v === "editor" && cv) setTimeout(refrescar, 60);   // ya tiene ancho: reescalar y recontar
  if (v === "panel") cargarAplicados();
}
document.querySelectorAll("[data-vista-principal]").forEach((b) => {
  b.onclick = () => mostrarVista(b.dataset.vistaPrincipal);
});

/* segmentos (plazo y filtro de estado) */
function segmentos(caja, alElegir) {
  caja.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      caja.querySelectorAll("button").forEach((x) => x.classList.remove("activa"));
      b.classList.add("activa");
      alElegir(b.dataset);
    };
  });
}
segmentos($("#bu-plazo"), () => {});
segmentos($("#filtro-estado"), (d) => { filtroEstado = d.estado || ""; cargarAplicados(); });
document.querySelectorAll(".chip-f").forEach((c) => {
  c.onclick = () => c.classList.toggle("activa");
});
$("#btnPegarOfertas").onclick = async () => {
  const nodo = $("#estadoPegar");
  try {
    const texto = await navigator.clipboard.readText();
    const datos = JSON.parse(texto);
    const r = await api("/api/ofertas-pegadas", datos);
    nodo.className = "estado ok";
    nodo.textContent = r.recibidas + " ofertas recibidas.";
    $("#btnBuscar").click();
  } catch (e) {
    nodo.className = "estado mal";
    nodo.textContent = "No he encontrado ofertas copiadas. Pulsa el marcador en la web primero.";
  }
};

$("#btnNuevaBusqueda").onclick = () => {
  $("#bu-texto").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#bu-texto").focus();
};

const COLORES_INICIAL = ["#4A76B8", "#0F6E68", "#7A2E3A", "#5B4B8A", "#B45309", "#334155"];
function avatar(texto) {
  const letra = (texto || "?").trim()[0].toUpperCase();
  let suma = 0;
  for (const c of texto || "?") suma += c.charCodeAt(0);
  const el = crear("span", { className: "inicial", textContent: letra });
  el.style.background = COLORES_INICIAL[suma % COLORES_INICIAL.length];
  return el;
}

function tarjetaOferta(o) {
  const dias = o.dias == null ? null : o.dias;
  const cuando = dias === null ? "sin fecha"
    : dias <= 0 ? "hoy" : dias === 1 ? "ayer" : "hace " + dias + " días";
  const etqCuando = crear("span", {
    className: "etq" + (dias === 0 ? " hoy" : dias === 1 ? " ayer" : ""), textContent: cuando });
  const fuente = (o.fuente || "").toLowerCase();
  const etqFuente = crear("span", { className: "etq fuente " + fuente, textContent: o.fuente || "" });

  const adaptar = crear("button", { className: "btn-mini", textContent: "Adaptar" });
  adaptar.onclick = async () => {
    adaptar.disabled = true; adaptar.textContent = "Trayendo…";
    try {
      const r = await api("/api/oferta-url", { url: o.url });
      $("#of-url").value = o.url;
      $("#of-puesto").value = r.puesto || o.titulo;
      $("#of-empresa").value = r.empresa || o.empresa;
      $("#of-fuente").value = r.fuente || o.fuente;
      $("#of-texto").value = r.texto || o.extra || "";
      mostrarVista("editor");
      document.querySelector('.pest[data-tab="adaptar"]').click();
      $("#btnAdaptar").scrollIntoView({ block: "center" });
    } catch (e) {
      if (o.extra) {                       // sin lectura automática, al menos lo que se vio
        $("#of-url").value = o.url; $("#of-puesto").value = o.titulo;
        $("#of-empresa").value = o.empresa; $("#of-texto").value = o.extra;
        mostrarVista("editor");
        document.querySelector('.pest[data-tab="adaptar"]').click();
        alert("Esa web no deja leerla entera.\nHe puesto lo que se veía: repasa el texto antes de adaptar.");
      } else {
        alert(e.message);
      }
    }
    adaptar.disabled = false; adaptar.textContent = "Adaptar";
  };
  const ver = crear("button", { className: "btn-mini", textContent: "Ver" });
  ver.onclick = () => api("/api/abrir", { que: "url", valor: o.url });

  const tarjeta = crear("div", { className: "oferta" + (urlsAplicadas.has(o.url) ? " usada" : "") }, [
    crear("div", { className: "alto" }, [
      avatar(o.empresa || o.titulo),
      crear("div", {}, [
        crear("div", { className: "tit", textContent: o.titulo }),
        crear("div", { className: "emp", textContent: o.empresa || "—" }),
      ]),
    ]),
    crear("div", { className: "meta" }, [etqCuando, etqFuente,
      crear("span", { className: "etq", textContent: o.lugar || "" })]),
    crear("div", { className: "botones" }, [adaptar, ver]),
  ]);
  return tarjeta;
}

function pintarOfertas() {
  const caja = $("#ofertas");
  caja.textContent = "";
  if (!ofertasEncontradas.length) {
    caja.append(crear("div", { className: "vacio" }, [
      crear("b", { textContent: "Todavía no hay ofertas" }),
      crear("span", { textContent: "Escribe lo que buscas y pulsa Buscar." }),
    ]));
    return;
  }
  ofertasEncontradas.forEach((o) => caja.append(tarjetaOferta(o)));
}

$("#btnBuscar").onclick = async () => {
  const nodo = $("#estadoBuscar");
  const fuentes = [...document.querySelectorAll(".chip-f.activa")].map((c) => c.dataset.fuente);
  const dias = Number($("#bu-plazo .activa").dataset.dias);
  const caja = $("#ofertas");
  caja.textContent = "";
  for (let i = 0; i < 6; i++) caja.append(crear("div", { className: "hueso" }));
  $("#btnBuscar").disabled = true;
  try {
    const r = await conEstado(nodo, "Buscando ofertas…",
      () => api("/api/buscar", { texto: $("#bu-texto").value, lugar: $("#bu-lugar").value, dias, fuentes }));
    ofertasEncontradas = r.ofertas;
    pintarOfertas();
    $("#n-nuevas").textContent = r.ofertas.length;
    nodo.className = "estado" + (r.ofertas.length ? " ok" : " mal");
    nodo.textContent = r.ofertas.length
      ? r.ofertas.length + " ofertas publicadas en los últimos " + r.dias + " días."
      : "Nada en ese plazo. Amplía los días o cambia las palabras.";
    if (r.errores.length) nodo.textContent += "  (" + r.errores.join("; ") + ")";
  } catch (e) { caja.textContent = ""; pintarOfertas(); }
  $("#btnBuscar").disabled = false;
};

/* si el marcador manda una lista desde el navegador, se refresca solo */
let ultimaListaVista = 0;
setInterval(async () => {
  if ($("#panel").hidden) return;
  try {
    const r = await api("/api/ultima-lista");
    if (r.ts && r.ts !== ultimaListaVista) {
      ultimaListaVista = r.ts;
      if ($("#bu-texto").value || ofertasEncontradas.length) $("#btnBuscar").click();
      $("#estadoBuscar").className = "estado ok";
      $("#estadoBuscar").textContent = "Han llegado " + r.total + " ofertas desde el navegador.";
    }
  } catch (e) {}
}, 4000);

async function cargarAplicados() {
  const filas = await api("/api/candidaturas");
  filas.forEach((f) => f.url && urlsAplicadas.add(f.url));
  const caja = $("#aplicados");
  caja.textContent = "";
  $("#n-preparadas").textContent = filas.filter((f) => f.estado === "preparada").length;
  $("#n-enviadas").textContent = filas.filter((f) => ["enviada", "respondida", "entrevista"].includes(f.estado)).length;
  $("#n-respuestas").textContent = filas.filter((f) => ["respondida", "entrevista"].includes(f.estado)).length;
  $("#saludo").textContent = filas.length
    ? filas.length + " candidaturas guardadas · " + new Date().toLocaleDateString("es-ES",
      { weekday: "long", day: "numeric", month: "long" })
    : "Empieza buscando ofertas de esta semana.";
  const visibles = filtroEstado ? filas.filter((f) => f.estado === filtroEstado) : filas;
  if (!visibles.length) {
    caja.append(crear("div", { className: "vacio" }, [
      crear("b", { textContent: filtroEstado ? "Ninguna en ese estado" : "Aún no has preparado ninguna" }),
      crear("span", { textContent: "Cuando prepares un envío aparecerá aquí." }),
    ]));
    return;
  }
  const tabla = crear("table");
  tabla.append(crear("tr", {}, ["Fecha", "Empresa", "Puesto", "Estado", ""].map(
    (t) => crear("th", { textContent: t }))));
  visibles.forEach((f) => {
    const sel = crear("select");
    ESTADOS.forEach((e) => sel.append(crear("option", { value: e, textContent: e })));
    sel.value = f.estado || "preparada";
    sel.dataset.estado = sel.value;
    sel.onchange = async () => {
      sel.dataset.estado = sel.value;
      await api("/api/estado-candidatura", { carpeta: f.carpeta, estado: sel.value });
      cargarAplicados();
    };
    const abrir = crear("button", { className: "btn-mini", textContent: "Carpeta" });
    abrir.onclick = () => api("/api/abrir", { que: "carpeta", valor: "salidas/" + f.carpeta });
    const cargar = crear("button", { className: "btn-mini", textContent: "Abrir" });
    cargar.onclick = async () => {
      const d = await api("/api/candidatura/" + f.carpeta);
      cv = d.cv; carta = d.carta || carta;
      const aj = d.ajustes || {};
      $("#of-empresa").value = aj.empresa || ""; $("#of-puesto").value = aj.puesto || "";
      $("#of-fuente").value = aj.fuente || ""; $("#of-texto").value = aj.oferta || "";
      $("#of-notas").value = aj.notas || ""; $("#of-url").value = aj.url || "";
      pintarEditor(); pintarDiseno(); pintarCarta(); pintarIdioma(); refrescar();
      mostrarVista("editor");
    };
    tabla.append(crear("tr", {}, [
      crear("td", { textContent: (f.fecha || "").slice(0, 10) }),
      crear("td", {}, [crear("b", { textContent: f.empresa || "—" })]),
      crear("td", { textContent: f.puesto || "—" }),
      crear("td", {}, [sel]),
      crear("td", {}, [crear("span", { className: "acc" }, [cargar, abrir])]),
    ]));
  });
  caja.append(tabla);
}

pintarOfertas();
mostrarVista("panel");

/* ?demo=1 enseña una adaptación real de ejemplo sin gastar una llamada a la IA */
const params = new URLSearchParams(location.search);
if (params.get("demo")) {
  (async () => {
    try {
      const r = await (await fetch("/docs/demo.json")).json();
      await new Promise((listo) => setTimeout(listo, 700));
      mostrarVista("editor");
      document.querySelector('.pest[data-tab="adaptar"]').click();
      $("#of-empresa").value = r.ajustes?.empresa || "Sample Hospitality SaaS";
      $("#of-puesto").value = r.ajustes?.puesto || "Customer Support Specialist";
      $("#of-texto").value = r.ajustes?.oferta || "";
      aplicarAdaptacion(r);
      $("#estadoAdaptar").className = "estado ok";
      $("#estadoAdaptar").textContent = "Ejemplo cargado: así queda una adaptación real.";
    } catch (e) { /* sin demo */ }
  })();
}
if (params.get("buscar")) {
  $("#bu-texto").value = params.get("buscar");
  $("#bu-lugar").value = params.get("lugar") || "";
  setTimeout(() => $("#btnBuscar").click(), 400);
}

inicio();
