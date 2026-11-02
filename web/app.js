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
  const caja = crear("label", { textContent: etiqueta }, [entrada]);
  if (opciones.ayuda) caja.append(crear("small", { className: "ayuda", textContent: opciones.ayuda }));
  return caja;
}

function ficha(titulo, contenido, alBorrar, interruptor) {
  const cabeza = crear("div", { className: "cabeza" }, [crear("b", { textContent: titulo })]);
  if (interruptor) {
    // Encender y apagar en vez de borrar: un proyecto que no pinta nada en
    // esta oferta es el bueno en la siguiente, y borrarlo lo pierde para
    // siempre. Apagado sigue en el perfil, solo no sale en el PDF.
    const casilla = crear("input", { type: "checkbox", checked: interruptor.activo });
    casilla.onchange = () => { interruptor.alCambiar(casilla.checked); pintarEditor(); pintar(); };
    const etiqueta = crear("label", { className: "interruptor" }, [
      casilla, crear("span", { textContent: interruptor.activo ? "En el CV" : "Oculto" }),
    ]);
    cabeza.append(etiqueta);
  }
  if (alBorrar) {
    const b = crear("button", { className: "btn-mini", textContent: "Borrar" });
    b.onclick = () => { alBorrar(); pintarEditor(); pintar(); };
    cabeza.append(b);
  }
  const caja = crear("div", { className: "ficha" + (interruptor && !interruptor.activo ? " apagada" : "") },
                     [cabeza, ...contenido]);
  return caja;
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

function cajaSugerirConocimientos() {
  const caja = crear("div", { className: "sugerir-con" });
  const nota = crear("p", { className: "estado" });
  const lista = crear("div", { className: "lista-terminos" });
  const boton = crear("button", { className: "btn ancho",
    textContent: "Sugerir palabras que buscan los reclutadores" });

  boton.onclick = async () => {
    boton.disabled = true;
    lista.textContent = "";
    try {
      const r = await conEstado(nota, "Buscando en tu propia experiencia…",
        () => api("/api/sugerir-conocimientos", { cv }));
      const sugeridos = r.sugeridos || [];
      if (!sugeridos.length) {
        nota.className = "estado";
        nota.textContent = "No he encontrado nada nuevo que puedas defender.";
      } else {
        nota.className = "estado ok";
        nota.textContent = sugeridos.length + " términos, cada uno con la frase de tu CV que lo sostiene. " +
          "Marca los que quieras y añádelos.";
        sugeridos.forEach((s) => {
          const marca = crear("input", { type: "checkbox", checked: !s.riesgo });
          const fila = crear("label", { className: "termino" + (s.riesgo ? " justo" : "") }, [
            marca,
            crear("span", {}, [
              crear("b", { textContent: s.termino }),
              crear("em", { className: "tipo", textContent: s.tipo || "" }),
              crear("span", { className: "evidencia", textContent: s.evidencia || "" }),
            ]),
          ]);
          fila.dataset.termino = s.termino;
          lista.append(fila);
        });
        const anadir = crear("button", { className: "btn ancho", textContent: "Añadir los marcados" });
        anadir.onclick = () => {
          let puestos = 0;
          lista.querySelectorAll(".termino").forEach((f) => {
            const marcado = f.querySelector("input").checked;
            const t = f.dataset.termino;
            if (marcado && !cv.conocimientos.some((x) => String(x).toLowerCase() === t.toLowerCase())) {
              cv.conocimientos.push(t);
              puestos++;
            }
          });
          pintarEditor(); refrescar();
          alert(puestos + " términos añadidos al final de Conocimientos. Reordénalos a tu gusto " +
                "y pulsa «Guardar en este perfil» si quieres que se queden.");
        };
        lista.append(anadir);
      }
    } catch (e) { /* el estado ya lo dice */ }
    boton.disabled = false;
  };

  caja.append(crear("p", { className: "ayuda", textContent:
    "Saca términos de gestión, IA y trato con cliente que ya están respaldados por tu experiencia. " +
    "No inventa: cada uno viene con la frase de tu CV que lo sostiene." }), boton, nota, lista);
  return caja;
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
    campo("Credly (insignias verificables)", id.credly, (v) => (id.credly = v),
      { placeholder: "credly.com/users/tu-usuario" }),
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
    cajaSugerirConocimientos(),
  ]));

  cont.append(acordeon("Proyectos", [
    crear("p", { className: "nota-seccion",
      textContent: "Enciende o apaga cuáles salen en el CV. Al adaptar, la IA enciende los que "
        + "encajan con la oferta y apaga el resto — pero decides tú: nada se borra." }),
    ...cv.proyectos.map((x, i) => ficha(
      (x.nombre || "Proyecto " + (i + 1)).split(" — ")[0], [
        campo("Nombre", x.nombre, (v) => (x.nombre = v)),
        campo("Stack", x.stack, (v) => (x.stack = v)),
        campo("Enlace", x.enlace, (v) => (x.enlace = v),
          { ayuda: "Varios separados por · . Para que salga corto: Etiqueta|https://…" }),
        campo("Descripción", x.texto, (v) => (x.texto = v), { filas: 3 }),
      ],
      () => cv.proyectos.splice(i, 1),
      { activo: !x.oculto, alCambiar: (v) => { x.oculto = !v; } })),
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
  sel.append(crear("option", { value: "conocimientos", textContent: "Conocimientos (etiqueta)" }));
  sel.append(crear("option", { value: "certificados", textContent: "Certificados / cursos" }));
  sel.append(crear("option", { value: "idiomas", textContent: "Idiomas" }));
  sel.append(crear("option", { value: "disponibilidad", textContent: "Disponibilidad" }));
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
  const texto = (s.si_lo_tienes || "").trim();
  const bruto = String(s.donde || "").toLowerCase().trim();
  const numero = bruto.match(/(\d+)/);
  const indice = numero ? Number(numero[1]) : 0;

  let destino = "experiencia";
  if (/(disponib|availab|turno|shift|jornada|horario|incorporaci)/.test(bruto)) destino = "disponibilidad";
  else if (/(certificad|certificat|curso|course|carn[eé]|licen)/.test(bruto)) destino = "certificados";
  else if (/(idioma|language|ingl|english)/.test(bruto)) destino = "idiomas";
  else if (/(conoc|skill|herramienta|tool|knowledge|habilidad)/.test(bruto)) destino = "conocimientos";
  else if (/^(proy|proj)/.test(bruto)) destino = "proyecto";

  const meteChip = (c) => {
    if (c && !cv.conocimientos.some((x) => String(x).toLowerCase() === String(c).toLowerCase())) {
      cv.conocimientos.push(c);
      return 1;
    }
    return 0;
  };

  let hecho = "";
  if (destino === "disponibilidad" && texto) {
    const limpia = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/).filter((p) => p.length > 3);
    const nuevas = limpia(texto);
    const trozos = (cv.identidad.disponibilidad || "").split("·").map((t) => t.trim()).filter(Boolean);
    // si ya dice lo mismo con otras palabras, no lo repetimos
    const repetido = trozos.some((t) => {
      const suyas = limpia(t);
      const comunes = nuevas.filter((p) => suyas.includes(p));
      return nuevas.length && comunes.length >= Math.ceil(nuevas.length * 0.6);
    });
    if (!repetido) trozos.push(texto);
    cv.identidad.disponibilidad = trozos.join(" · ");
    hecho = "disponibilidad";
  } else if (destino === "certificados" && texto) {
    cv.certificados.unshift({ titulo: texto, entidad: "", fecha: "" });
    hecho = "certificados";
  } else if (destino === "idiomas" && texto) {
    const partes = texto.split(/[—\-·:]/).map((x) => x.trim()).filter(Boolean);
    cv.idiomas.push({ idioma: partes[0] || texto, nivel: partes[1] || "", puntos: 3 });
    hecho = "idiomas";
  } else if (destino === "conocimientos") {
    hecho = "conocimientos";                      // solo etiquetas: nunca una frase suelta
  } else if (destino === "proyecto" && texto) {
    cv.proyectos.unshift({ nombre: "Proyecto (ponle nombre)",
      stack: (s.conocimientos || []).join(", "), enlace: "", texto });
    hecho = "proyectos";
  } else if (texto && cv.experiencia.length) {
    const i = Math.min(Math.max(indice, 0), cv.experiencia.length - 1);
    cv.experiencia[i].puntos.unshift(texto);
    hecho = "experiencia";
  }

  let chips = 0;
  (s.conocimientos || []).forEach((c) => { chips += meteChip(c); });
  if (destino === "conocimientos" && !chips && texto) chips += meteChip(texto);

  pintarEditor(); refrescar();
  return { hecho, chips, destino };
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
      if (!r.hecho && !r.chips) {
        anadir.textContent = "No he sabido dónde ponerlo";
        return;
      }
      ficha.classList.add("puesta");
      anadir.disabled = true;
      const sitio = r.hecho || "conocimientos";
      anadir.textContent = "Añadido ✓ a " + sitio + (r.chips ? " (+" + r.chips + " chip)" : "");
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
  // Se llama a fetch directamente en vez de a api(): el servidor cuenta en la
  // cabecera X-Encaje qué tuvo que apretar para que el CV quepa en dos
  // páginas, y api() devuelve solo el PDF y tira las cabeceras.
  const r = await fetch("/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cv, carta, tipo, nombre, oferta: ($("#of-texto") || {}).value || "" }),
  });
  if (!r.ok) { alert("No se pudo generar el PDF."); return; }
  const encaje = r.headers.get("X-Encaje");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = crear("a", { href: url, download: nombre + ".pdf" });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  if (encaje) avisoEncaje(decodeURIComponent(encaje));
}

function avisoEncaje(pasos) {
  /* Ver desaparecer dos proyectos del PDF sin que nadie lo explique parece un
     fallo del programa. Se dice lo que se apretó y se recuerda que el perfil
     guardado sigue completo. */
  let caja = document.getElementById("avisoEncaje");
  if (!caja) {
    caja = crear("div", { id: "avisoEncaje", className: "aviso-encaje" });
    document.body.append(caja);
  }
  caja.textContent = "PDF ajustado a 2 páginas — " + pasos +
    ". Tu perfil guardado no ha cambiado.";
  caja.style.display = "block";
  clearTimeout(caja.temporizador);
  caja.temporizador = setTimeout(() => { caja.style.display = "none"; }, 14000);
}

async function inicio() {
  [cv, plantillas] = await Promise.all([api("/api/base"), api("/api/plantillas")]);
  await cargarPerfiles();
  cv.secciones_ocultas = cv.secciones_ocultas || [];
  cv.estilo = Object.assign({ color: "#4A76B8", tamano: 10, foto: true, plantilla: "cape_town", ats: false },
    cv.estilo || {});
  pintarEditor(); pintarDiseno(); pintarCarta(); pintarIdioma(); refrescar(); cargarHistorial();
}

async function conTodosLosProyectos(cargado, estado) {
  /* Una candidatura guarda el CV tal y como se envió, con sus proyectos ya
     elegidos. Al reabrirla no aparecían los demás y no había nada que
     encender: se recuperan del perfil activo y entran apagados, sin tocar los
     que sí se enviaron ni su orden.

     Solo en las que aún no han salido. Una ya enviada es el registro de lo
     que mandaste: si se le añaden proyectos, aunque sea apagados, deja de ser
     una copia fiel de lo que vio esa empresa. */
  cargado.proyectos = cargado.proyectos || [];
  if (estado && estado !== "preparada") return cargado;
  try {
    const base = await api("/api/perfil-actual");
    const clave = (p) => (p.nombre || "").trim().toLowerCase();
    const yaEstan = new Set(cargado.proyectos.map(clave));
    (base.proyectos || []).forEach((p) => {
      if (!yaEstan.has(clave(p))) cargado.proyectos.push(Object.assign({}, p, { oculto: true }));
    });
  } catch (e) { /* si no se puede leer el perfil, se abre tal cual se guardó */ }
  return cargado;
}

async function cargarHistorial() {
  const filas = await api("/api/candidaturas");
  const caja = $("#historial");
  caja.innerHTML = filas.length ? "" : '<p class="ayuda">Todavía no has guardado ninguna.</p>';
  filas.forEach((f) => {
    const a = crear("a", { textContent: `${f.empresa || "—"} · ${f.puesto || "—"} · ${(f.fecha || "").slice(0, 10)}` });
    a.onclick = async () => {
      const d = await api("/api/candidatura/" + f.carpeta);
      cv = await conTodosLosProyectos(d.cv, f.estado); carta = d.carta || carta;
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
    // Solo los de Infojobs. El de Workana trae su propio código en el HTML y
    // este bucle se lo machacaba: el usuario pulsaba en Workana el marcador
    // de Infojobs y, claro, no rellenaba nada.
    document.querySelectorAll("a.marcador:not(.marcador-workana)").forEach((a) => {
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
    // los destinos cortos no necesitan que la IA redacte nada
    if (["conocimientos", "certificados", "idiomas", "disponibilidad"].includes(destino)) {
      const r = insertarSugerencia({ si_lo_tienes: texto, donde: destino });
      $("#ex-texto").value = "";
      nodo.className = "estado ok";
      nodo.textContent = "Añadido a " + (r.hecho || destino) + ".";
    } else {
      const r = await conEstado(nodo, "Redactando…",
        () => api("/api/anadir-experiencia", { cv, texto, destino, ajustes: leerAjustes() }));
      const puntos = r.puntos || [];
      if (destino.startsWith("exp:")) {
        const i = Number(destino.split(":")[1]);
        cv.experiencia[i].puntos = [...puntos, ...cv.experiencia[i].puntos];
      } else if (destino === "proyecto") {
        cv.proyectos.unshift({ nombre: "Proyecto (ponle nombre)",
          stack: (r.conocimientos || []).join(", "), enlace: "", texto: puntos.join(" ") });
      }
      (r.conocimientos || []).forEach((c) => {
        if (!cv.conocimientos.some((x) => String(x).toLowerCase() === String(c).toLowerCase())) {
          cv.conocimientos.push(c);
        }
      });
      $("#ex-texto").value = "";
      pintarEditor(); refrescar();
      nodo.className = "estado ok";
      nodo.textContent = "Añadido. " + (r.aviso || "Revísalo por si acaso.");
    }
  } catch (e) { /* ya mostrado */ }
  $("#btnAnadirEx").disabled = false;
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
  } catch (e) { /* el estado ya lo dice */ }
}
$("#btnEn").onclick = () => cambiarIdioma("en");
$("#btnEs").onclick = () => cambiarIdioma("es");

$("#btnPdfCV").onclick = () => descargar("cv");
$("#btnPdfCarta").onclick = () => descargar("carta");
$("#btnGuardarBase").onclick = async () => {
  // guardar una adaptación encima del perfil va podando la despensa: avisamos
  try {
    const guardado = await api("/api/perfil-actual");
    const perdidos = (guardado.conocimientos || []).filter(
      (c) => !cv.conocimientos.some((x) => String(x).toLowerCase() === String(c).toLowerCase()));
    const seccionesFuera = (cv.secciones_ocultas || []).filter(
      (s) => !(guardado.secciones_ocultas || []).includes(s));
    const proyectosFuera = (guardado.proyectos || []).length - (cv.proyectos || []).length;
    const avisos = [];
    if (perdidos.length > 2) avisos.push("· " + perdidos.length + " conocimientos desaparecen: " +
      perdidos.slice(0, 6).join(", ") + (perdidos.length > 6 ? "…" : ""));
    if (proyectosFuera > 0) avisos.push("· " + proyectosFuera + " proyectos dejan de estar en el perfil");
    if (seccionesFuera.length) avisos.push("· se ocultan secciones: " + seccionesFuera.join(", "));
    if (avisos.length && !confirm("Ojo, esto reemplaza tu perfil base:\n\n" + avisos.join("\n") +
        "\n\nLo que quites aquí ya no estará disponible para futuras ofertas. ¿Guardo igual?")) {
      return;
    }
  } catch (e) { /* si no se puede comparar, se guarda sin avisar */ }
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
  $("#freelance").hidden = v !== "freelance";
  $("#editor").hidden = v !== "editor";
  $("#acciones-editor").hidden = v !== "editor";   // esos botones son del editor
  if (v === "editor" && cv) setTimeout(refrescar, 60);   // ya tiene ancho: reescalar y recontar
  if (v === "panel") { cargarAplicados(); refrescarSiTocaYa(); }
  if (v === "freelance") cargarWorkana();
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
/* Tocar un filtro busca otra vez. Antes solo se pintaba el botón y había que
   acordarse de pulsar «Buscar»: parecía que no hacían nada. Si ya hay una
   búsqueda en marcha se espera a que acabe en vez de perder el clic, porque
   el botón está deshabilitado mientras tanto. */
let buscarPendiente = null;
function buscarAhora() {
  clearTimeout(buscarPendiente);
  buscarPendiente = setTimeout(function reintenta() {
    if ($("#btnBuscar").disabled) {
      buscarPendiente = setTimeout(reintenta, 300);
      return;
    }
    $("#btnBuscar").click();
  }, 150);
}

segmentos($("#bu-plazo"), buscarAhora);
segmentos($("#bu-modo"), buscarAhora);

// El desplegable escribe en el campo de texto en vez de sustituirlo: así los
// sitios de siempre están a un clic y se puede seguir escribiendo cualquier
// otro. Recuerda el último elegido para la próxima vez.
$("#bu-pais").onchange = (ev) => {
  if (!ev.target.value) return;
  $("#bu-lugar").value = ev.target.value;
  try { localStorage.setItem("cvtailor.lugar", ev.target.value); } catch (e) { /* modo privado */ }
  buscarAhora();
};
try {
  const guardado = localStorage.getItem("cvtailor.lugar");
  if (guardado && !$("#bu-lugar").value) {
    $("#bu-lugar").value = guardado;
    $("#bu-pais").value = guardado;
  }
} catch (e) { /* sin almacenamiento, se queda vacío */ }
segmentos($("#filtro-estado"), (d) => { filtroEstado = d.estado || ""; cargarAplicados(); });
document.querySelectorAll(".chip-f").forEach((c) => {
  c.onclick = () => { c.classList.toggle("activa"); buscarAhora(); };
});
// El tope de solicitantes se escribe dígito a dígito: se espera a que pare.
$("#bu-gente").oninput = () => { clearTimeout(buscarPendiente); buscarPendiente = setTimeout(buscarAhora, 700); };
$("#bu-texto").onkeydown = (ev) => { if (ev.key === "Enter") buscarAhora(); };
$("#bu-lugar").onkeydown = (ev) => { if (ev.key === "Enter") buscarAhora(); };

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
  // Con la hora exacta se distingue una oferta de hace 40 minutos de otra de
  // ayer por la mañana; las dos salían como "hoy" cuando solo teníamos el día.
  const cuando = o.horas != null
    ? (o.horas < 1 ? "hace " + Math.max(1, Math.round(o.horas * 60)) + " min"
      : o.horas < 24 ? "hace " + Math.round(o.horas) + " h"
        : "hace " + Math.round(o.horas / 24) + " días")
    : dias === null ? "sin fecha"
      : dias <= 0 ? "hoy" : dias === 1 ? "ayer" : "hace " + dias + " días";
  const reciente = o.horas != null ? o.horas < 24 : dias === 0;
  const etqCuando = crear("span", {
    className: "etq" + (reciente ? " hoy" : dias === 1 ? " ayer" : ""), textContent: cuando });
  // La hora exacta de publicación, en hora local. "hace 23 h" dice si corres;
  // "24 oct, 15:03" dice a qué hora salió, que es lo que permite comparar dos
  // ofertas del mismo día y saber cuál se publicó antes.
  let etqHora = null;
  if (o.publicada) {
    const t = new Date(o.publicada);
    if (!isNaN(t)) {
      etqHora = crear("span", { className: "etq hora",
        title: "Publicada el " + t.toLocaleString("es-ES"),
        textContent: t.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
          + ", " + t.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) });
    }
  }
  // LinkedIn no declara la modalidad en ningún campo, así que cuando aparece
  // suele venir de leer el texto de la oferta. Se marca con ~ para que se vea
  // que es una lectura, no un dato que afirme el portal.
  const etqModo = !o.modalidad ? null : crear("span", {
    className: "etq modo " + o.modalidad.toLowerCase().replace("í", "i"),
    title: o.modalidad_leida ? "Leído en el texto de la oferta, el portal no lo declara"
                             : "Lo declara el portal",
    textContent: (o.modalidad_leida ? "~ " : "") + o.modalidad });
  const etqSueldo = !o.sueldo ? null : crear("span", {
    className: "etq sueldo", title: "Sueldo que publica la oferta", textContent: o.sueldo });
  const etqGente = o.solicitantes == null ? null : crear("span", {
    className: "etq gente" + (!o.solicitantes_minimo && o.solicitantes <= 25 ? " poca" : ""),
    title: o.solicitantes_texto || "",
    textContent: o.solicitantes_minimo ? "+" + o.solicitantes + " solicitantes"
      : "≤ " + o.solicitantes + " solicitantes" });
  const fuente = (o.fuente || "").toLowerCase();
  const etqFuente = crear("span", { className: "etq fuente " + fuente, textContent: o.fuente || "" });

  const adaptar = crear("button", { className: "btn-mini", textContent: "Adaptar" });
  adaptar.onclick = () => adaptarDesdeOferta(o, adaptar, "Adaptar");
  const ver = crear("button", { className: "btn-mini", textContent: "Ver" });
  const m = marcas[claveOferta(o.url)];
  ver.onclick = () => { api("/api/abrir", { que: "url", valor: o.url }); if (!m) marcar(o, "vista"); };
  const enviada = crear("button", { className: "btn-mini" + (m && m.estado === "enviada" ? " activa" : ""),
    textContent: "✅", title: "Ya envié el CV a esta oferta" });
  enviada.onclick = () => marcar(o, m && m.estado === "enviada" ? "" : "enviada");

  const tarjeta = crear("div", { className: "oferta" + (urlsAplicadas.has(o.url) || m ? " usada" : "") }, [
    m && TEXTO_MARCA[m.estado]
      ? crear("div", { className: "sello s-" + m.estado, textContent: TEXTO_MARCA[m.estado] + " · " + fechaCorta(m.fecha) })
      : null,
    crear("div", { className: "alto" }, [
      avatar(o.empresa || o.titulo),
      crear("div", {}, [
        crear("div", { className: "tit", textContent: o.titulo }),
        crear("div", { className: "emp", textContent: o.empresa || "—" }),
      ]),
    ]),
    crear("div", { className: "meta" }, [etqCuando, etqHora, etqModo, etqSueldo, etqGente, etqFuente,
      crear("span", { className: "etq", textContent: o.lugar || "" })].filter(Boolean)),
    crear("div", { className: "botones" }, [adaptar, ver, enviada]),
  ].filter(Boolean));
  return tarjeta;
}

/* Trae la oferta y la deja cargada en "Adaptar al empleo", lista para pulsar Adaptar. */
async function adaptarDesdeOferta(o, adaptar, textoBoton) {
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
    adaptar.disabled = false; adaptar.textContent = textoBoton;
}

/* ------------------------------------------------ recomendadas para ti */
const LOGOS = {
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#0A66C2"/>' +
    '<path fill="#fff" d="M7.1 9.6h2.6V18H7.1zM8.4 5.6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11.4 9.6h2.5v1.2h.04c.35-.66 1.2-1.36 2.47-1.36 2.64 0 3.13 1.74 3.13 4V18h-2.6v-4c0-.95-.02-2.18-1.33-2.18-1.33 0-1.53 1.04-1.53 2.1V18h-2.6z"/></svg>',
  infojobs: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#167DB7"/>' +
    '<text x="12" y="16.3" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="11" fill="#fff">iJ</text></svg>',
};
const NOMBRE_FUENTE = { linkedin: "LinkedIn", infojobs: "InfoJobs" };
let recomendadas = [];
let filtroReco = "";
let estadoReco = "pendiente";
let marcas = {};

/* La misma oferta llega con enlaces distintos (parámetros de búsqueda, barra
   final…): se identifica por el número de LinkedIn o el código de InfoJobs. */
function claveOferta(url) {
  const u = url || "";
  const li = u.match(/linkedin\.com\/jobs\/view\/(?:[^/?]*-)?(\d{6,})/) || u.match(/currentJobId=(\d{6,})/);
  if (li) return "linkedin:" + li[1];
  const ij = u.match(/\/of-i([0-9a-f]{20,})/i);
  if (ij) return "infojobs:" + ij[1].toLowerCase();
  return u.split(/[?#]/)[0].replace(/\/+$/, "");
}

const TEXTO_MARCA = { vista: "👁 Ya la viste", enviada: "✅ Ya enviaste el CV", descartada: "✕ Descartada" };
const fechaCorta = (f) => f ? new Date(f + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "";

function marcaDe(url) {
  const m = marcas[claveOferta(url)];
  if (m) return m;
  return urlsAplicadas.has(url) ? { estado: "preparada" } : null;
}

async function marcar(o, estado) {
  try {
    marcas = await api("/api/marcar", { clave: claveOferta(o.url), estado, titulo: o.titulo, empresa: o.empresa });
  } catch (e) { return; }
  pintarRecomendadas();
  if (ofertasEncontradas.length) pintarOfertas();
}

async function cargarMarcas() {
  try { marcas = await api("/api/marcas"); } catch (e) { marcas = {}; }
}

function tarjetaRecomendada(o) {
  const fuente = (o.fuente || "").toLowerCase();
  const logo = crear("span", { className: "logo-fuente " + fuente, title: NOMBRE_FUENTE[fuente] || fuente });
  logo.innerHTML = LOGOS[fuente] || "";

  const marca = marcaDe(o.url);
  const est = marca ? marca.estado : "";
  const abrir = crear("a", { className: "btn-mini abrir", textContent: "Abrir oferta ↗",
    href: o.url, target: "_blank", rel: "noopener" });
  // abrirla ya cuenta como vista, sin pisar "enviada" o "descartada"
  abrir.addEventListener("click", () => { if (!marcas[claveOferta(o.url)]) marcar(o, "vista"); });
  const adaptar = crear("button", { className: "btn-mini adaptar", textContent: "✨ Adaptar mi CV" });
  adaptar.onclick = () => adaptarDesdeOferta(
    { url: o.url, titulo: o.titulo, empresa: o.empresa, fuente: NOMBRE_FUENTE[fuente] || o.fuente,
      extra: [o.titulo, o.empresa, o.modalidad, o.motivo].filter(Boolean).join("\n") },
    adaptar, "✨ Adaptar mi CV");

  const hecha = urlsAplicadas.has(o.url);
  const boton = (estado, texto, titulo) => {
    const b = crear("button", { className: "marca-btn m-" + estado + (est === estado ? " activa" : ""),
      textContent: texto, title: titulo });
    b.onclick = () => marcar(o, est === estado ? "" : estado);   // segundo clic, la desmarca
    return b;
  };
  const marcasBar = crear("div", { className: "marcas" }, [
    boton("vista", "👁 Vista", "Ya la miré"),
    boton("enviada", "✅ La envié", "Ya mandé el CV a esta oferta"),
    boton("descartada", "✕ No me interesa", "Quitarla de la lista"),
  ]);
  const aviso = marca && TEXTO_MARCA[est]
    ? crear("div", { className: "sello s-" + est, textContent: TEXTO_MARCA[est] + (marca.fecha ? " · " + fechaCorta(marca.fecha) : "") })
    : null;
  const pct = Math.max(0, Math.min(100, Number(o.encaje) || 0));
  const nivel = pct >= 85 ? "nv-alto" : pct >= 75 ? "nv-medio" : "nv-bajo";
  const anillo = crear("div", { className: "anillo " + nivel, title: "Encaje con tu CV" }, [
    crear("b", { textContent: pct + "%" }), crear("small", { textContent: "encaje" }),
  ]);
  anillo.style.setProperty("--pct", pct);
  return crear("div", { className: "reco " + nivel + (hecha ? " usada" : "") + (est ? " est-" + est : "") }, [
    aviso,
    crear("div", { className: "alto" }, [
      logo,
      crear("div", { className: "cuerpo" }, [
        crear("div", { className: "tit", textContent: o.titulo }),
        crear("div", { className: "emp", textContent: o.empresa || "—" }),
        crear("span", { className: "prio", textContent: hecha ? "✔ CV ya preparado"
          : pct >= 85 ? "Aplica ya" : pct >= 75 ? "Buena opción" : "Revísala antes" }),
      ]),
      anillo,
    ]),
    crear("div", { className: "meta" }, [
      etiquetaCuando(o),
      crear("span", { className: "etq modo", textContent: "📍 " + (o.modalidad || "—") }),
      o.pedir ? crear("span", { className: "etq dinero", textContent: "💶 Pide " + o.pedir }) : null,
      o.salario ? crear("span", { className: "etq", textContent: "Publican " + o.salario }) : null,
    ].filter(Boolean)),
    o.motivo ? crear("p", { className: "motivo", textContent: o.motivo }) : null,
    crear("div", { className: "botones" }, [adaptar, abrir]),
    marcasBar,
  ].filter(Boolean));
}

function etiquetaCuando(o) {
  /* Cuándo se publicó, con hora si la tenemos. Las tarjetas de "Sugeridas" no
     la mostraban y era imposible saber si una recomendación era de hoy o de
     hace tres semanas, que es justo lo que decide si merece la pena correr. */
  const t = o.publicada ? new Date(o.publicada) : (o.fecha ? new Date(o.fecha) : null);
  if (!t || isNaN(t)) return null;
  const horas = (Date.now() - t.getTime()) / 36e5;
  // Sin hora exacta, `t` es la medianoche de ese día: contar horas daría "hace
  // 2 días" para algo de ayer por la tarde. Ahí manda el día de calendario,
  // que es lo que el servidor cuenta y lo que una persona entiende.
  const cuando = o.publicada
    ? (horas < 1 ? "hace " + Math.max(1, Math.round(horas * 60)) + " min"
      : horas < 24 ? "hace " + Math.round(horas) + " h"
        : "hace " + Math.round(horas / 24) + " días")
    : (o.dias === 0 ? "hoy" : o.dias === 1 ? "ayer"
      : o.dias != null ? "hace " + o.dias + " días"
        : "hace " + Math.round(horas / 24) + " días");
  const conHora = o.publicada
    ? ", " + t.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
  return crear("span", {
    className: "etq hora" + (horas < 24 ? " hoy" : ""),
    title: "Publicada el " + t.toLocaleString("es-ES"),
    textContent: cuando + " · " + t.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + conHora,
  });
}

function estadoGrupo(o) {
  const m = marcas[claveOferta(o.url)];
  return m && (m.estado === "enviada" || m.estado === "descartada") ? m.estado : "pendiente";
}

function pintarRecomendadas() {
  const caja = $("#recomendadas");
  caja.textContent = "";
  const deFuente = recomendadas.filter((o) => !filtroReco || (o.fuente || "").toLowerCase() === filtroReco);
  const cuenta = { pendiente: 0, enviada: 0, descartada: 0 };
  deFuente.forEach((o) => cuenta[estadoGrupo(o)]++);
  document.querySelectorAll("#estado-reco button").forEach((b) => {
    const nombre = { pendiente: "Por aplicar", enviada: "Enviadas", descartada: "Descartadas" }[b.dataset.estado];
    b.textContent = nombre + " (" + cuenta[b.dataset.estado] + ")";
  });
  // las ya vistas bajan al final de "Por aplicar": primero lo que aún no has mirado
  const vista = (o) => (marcas[claveOferta(o.url)] || {}).estado === "vista" ? 1 : 0;
  const lista = deFuente
    .filter((o) => estadoGrupo(o) === estadoReco)
    .sort((a, b) => vista(a) - vista(b) || (b.encaje || 0) - (a.encaje || 0));
  if (!lista.length) {
    const vacios = {
      pendiente: deFuente.length ? ["¡Las has revisado todas!", "Pídele a Claude que te busque ofertas nuevas."]
        : [filtroReco === "infojobs" ? "Aún no hay ofertas de InfoJobs" : "Aún no hay recomendaciones",
           "Pídele a Claude que te busque ofertas y aparecerán aquí."],
      enviada: ["Aún no has marcado ninguna como enviada", "Pulsa «✅ La envié» cuando mandes el CV."],
      descartada: ["No has descartado ninguna", "Pulsa «✕ No me interesa» para quitarla de la lista."],
    }[estadoReco];
    caja.append(crear("div", { className: "vacio" }, [
      crear("b", { textContent: vacios[0] }), crear("span", { textContent: vacios[1] }),
    ]));
    return;
  }
  lista.slice(0, 3).forEach((o) => caja.append(tarjetaRecomendada(o)));
}

async function cargarRecomendadas() {
  try {
    await cargarMarcas();
    const r = await (await fetch("/api/recomendadas")).json();
    recomendadas = r.ofertas || [];
    const n = (f) => recomendadas.filter((o) => o.fuente === f).length;
    $("#reco-nota").textContent = recomendadas.length
      ? recomendadas.length + " ofertas elegidas para tu perfil · " + n("linkedin") + " de LinkedIn · " +
        n("infojobs") + " de InfoJobs" + (r.actualizado ? " · actualizado el " + r.actualizado : "")
      : "";
    pintarRecomendadas();
  } catch (e) { /* sin recomendaciones todavía */ }
}

segmentos($("#filtro-reco"), (d) => { filtroReco = d.fuente || ""; pintarRecomendadas(); });
segmentos($("#estado-reco"), (d) => { estadoReco = d.estado || "pendiente"; pintarRecomendadas(); });

function pintarOfertas() {
  // Lo que ya marcó (visto, enviado, descartado) se va al final: si vuelve a
  // salir en la búsqueda no debe ocuparle los primeros huecos otra vez.
  ofertasEncontradas.sort((a, b) => (marcaDe(a.url) ? 1 : 0) - (marcaDe(b.url) ? 1 : 0));
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
  const modalidad = ($("#bu-modo .activa") || {}).dataset ? $("#bu-modo .activa").dataset.modo : "";
  const caja = $("#ofertas");
  caja.textContent = "";
  for (let i = 0; i < 6; i++) caja.append(crear("div", { className: "hueso" }));
  $("#btnBuscar").disabled = true;
  try {
    // Se recuerda la búsqueda para poder repetirla sola al abrir el panel.
    try { localStorage.setItem("cvtailor.busqueda", $("#bu-texto").value); } catch (e) { /* modo privado */ }
    const r = await conEstado(nodo, "Buscando ofertas…",
      () => api("/api/buscar", { texto: $("#bu-texto").value, lugar: $("#bu-lugar").value, dias, fuentes,
        max_solicitantes: Number($("#bu-gente").value) || null, modalidad }));
    ofertasEncontradas = r.ofertas;
    pintarOfertas();
    $("#n-nuevas").textContent = r.ofertas.length;
    ultimaBusqueda = Date.now();
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    nodo.className = "estado" + (r.ofertas.length ? " ok" : " mal");
    nodo.textContent = r.ofertas.length
      ? r.ofertas.length + " ofertas publicadas en los últimos " + r.dias +
        " días · buscado a las " + hora
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
  if (recomendadas.length) pintarRecomendadas();      // marca las ya preparadas
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
    const borrar = crear("button", { className: "btn-mini peligro", textContent: "Borrar" });
    borrar.onclick = async () => {
      // Se borra la carpeta entera de salidas/: el CV, la carta y los PDF de
      // esa candidatura. No hay papelera, así que se pregunta con nombre y
      // apellidos de lo que va a desaparecer.
      const quien = [f.empresa, f.puesto].filter(Boolean).join(" · ") || "esta candidatura";
      if (!confirm("¿Borrar " + quien + "?\n\nSe elimina su carpeta con el CV, la carta y los PDF. "
                   + "No se puede deshacer.")) return;
      await api("/api/borrar-candidatura", { carpeta: f.carpeta });
      cargarAplicados(); cargarHistorial();
    };
    const cargar = crear("button", { className: "btn-mini", textContent: "Abrir" });
    cargar.onclick = async () => {
      const d = await api("/api/candidatura/" + f.carpeta);
      cv = await conTodosLosProyectos(d.cv, f.estado); carta = d.carta || carta;
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
      crear("td", {}, [crear("span", { className: "acc" }, [cargar, abrir, borrar])]),
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
cargarRecomendadas();

/* ---------------------------------------------------------------- Workana
   Workana no es una bolsa de empleo: aquí no se manda el CV, se escribe una
   propuesta y se compite contra otros freelancers. Por eso va en su propia
   sección y por eso el botón no dice "Adaptar" sino "Preparar propuesta".

   La lista no se descarga desde el servidor: Cloudflare le sirve a Python una
   página sin proyectos. La vuelca el navegador contra /api/workana-pegado. */
let workana = [];
let wkCerrados = 0;
let wkCosecha = "";         // cuándo se recogió por última vez la lista de Workana
let wkHoras = 99999;        // sin tope: lo que importa es que siga abierta
let wkSoloAptas = true;     // por defecto solo las que pasan el filtro
let wkMoneda = "EUR";       // los presupuestos llegan en seis monedas distintas
let wkCupo = {};            // pujas que quedan por sitio

/* Los presupuestos vienen en euros, dólares, rupias, libras… Compararlos tal
   cual es comparar peras con rupias, así que el servidor los convierte y aquí
   se enseñan en la moneda elegida. La conversión es aproximada: sirve para
   ordenar y descartar, no para facturar. */
function dinero(p) {
  const v = p.veredicto || {};
  const e = v.eur;
  if (wkMoneda === "orig" || !e) return p.presupuesto || "";
  const tasa = wkMoneda === "USD" ? 1 / 0.92 : 1;
  const sim = wkMoneda === "USD" ? "$" : "€";
  const n = (x) => sim + Math.round(x * tasa).toLocaleString("es-ES");
  const txt = e.min ? n(e.min) + "–" + n(e.max) : "hasta " + n(e.max);
  return e.por_hora ? txt + "/h" : txt;
}

function wkCompetencia() {
  const v = parseInt($("#wk-competencia").value, 10);
  return isNaN(v) || v <= 0 ? null : v;
}

function tarjetaWorkana(p) {
  const tope = wkCompetencia();
  const pocas = p.propuestas != null && tope && p.propuestas <= tope;
  const chips = [
    // Workana manda "Hace 6 horas" ya escrito; Freelancer y Freelancermap
    // mandan la fecha en crudo. Si tenemos las horas, mandan ellas.
    (p.publicado || p.horas != null)
      ? crear("span", { className: "etq" + (p.horas != null && p.horas <= 24 ? " hoy" : ""),
          title: p.publicado ? "Workana lo escribió como «" + p.publicado +
                               "» cuando se recogió la lista" : "",
          textContent: p.horas == null ? p.publicado
            : p.horas < 1 ? "hace minutos"
            : p.horas < 24 ? "hace " + Math.round(p.horas) + " h"
            : p.horas < 48 ? "ayer"
            : "hace " + Math.round(p.horas / 24) + " días" })
      : null,
    dinero(p) ? crear("span", { className: "etq sueldo", title: p.presupuesto || "",
      textContent: dinero(p) }) : null,
    p.propuestas != null ? crear("span", { className: "etq gente" + (pocas ? " poca" : ""),
      title: "Cuántos freelancers han enviado propuesta ya",
      textContent: p.propuestas + " propuestas" }) : null,
    p.pais ? crear("span", { className: "etq", textContent: p.pais }) : null,
    crear("span", { className: "etq fuente " + (p.fuente || "").toLowerCase().replace(/\./g, ""),
      textContent: p.fuente || "" }),
  ].filter(Boolean);

  const preparar = crear("button", { className: "btn-mini", textContent: "Preparar propuesta" });
  preparar.onclick = () => propuestaWorkana(p, preparar);
  const ver = crear("button", { className: "btn-mini", textContent: "Ver" });
  ver.onclick = () => { api("/api/abrir", { que: "url", valor: p.url }); if (!marcaDe(p.url)) marcar(p, "vista"); };
  const m = marcaDe(p.url);
  const enviada = crear("button", { className: "btn-mini" + (m && m.estado === "enviada" ? " activa" : ""),
    textContent: "✅", title: "Ya envié la propuesta" });
  enviada.onclick = () => marcar(p, m && m.estado === "enviada" ? "" : "enviada");

  /* El veredicto va a la vista y con su motivo. Un número suelto («62») no
     dice nada; «el tope te paga 33 h a tu tarifa» sí, y si descarta algo bueno
     se ve dónde falla el filtro en vez de tener que adivinarlo. */
  const v = p.veredicto || {};
  const juicio = v.motivo
    ? crear("div", { className: "veredicto " + (v.apto ? "ok" : "no") }, [
        crear("b", { textContent: v.apto ? "Apta · " + v.nota + "/100" : "Descartada" }),
        crear("span", { textContent: " " + v.motivo }),
      ])
    : null;

  return crear("div", { className: "oferta" + (m ? " usada" : "") + (v.apto ? " apta" : "") }, [
    m && TEXTO_MARCA[m.estado]
      ? crear("div", { className: "sello s-" + m.estado,
          textContent: TEXTO_MARCA[m.estado] + " · " + fechaCorta(m.fecha) })
      : null,
    crear("div", { className: "alto" }, [
      avatar(p.titulo),
      crear("div", {}, [
        crear("div", { className: "tit", textContent: p.titulo }),
        crear("div", { className: "etq fuente grande " +
          (p.fuente || "").toLowerCase().replace(/\./g, ""),
          textContent: p.fuente === "Freelancer" ? "Freelancer.es" : (p.fuente || "") }),
      ]),
    ]),
    juicio,
    crear("div", { className: "meta" }, chips),
    (p.habilidades || []).length
      ? crear("div", { className: "meta skills" }, p.habilidades.slice(0, 4).map((h) =>
          crear("span", { className: "etq modo", textContent: h })))
      : null,
    p.descripcion ? crear("p", { className: "ayuda recorte", textContent: p.descripcion }) : null,
    crear("div", { className: "botones" }, [preparar, ver, enviada]),
  ].filter(Boolean));
}

function pintarWorkana() {
  const caja = $("#workana");
  caja.innerHTML = "";
  const tope = wkCompetencia();
  const busca = ($("#wk-texto").value || "").trim().toLowerCase();
  const fuentes = wkFuentes();
  const lista = workana.filter((p) => {
    // El filtro que de verdad importa: con 6 pujas al mes en Freelancer y 2 por
    // semana en Workana, lo caro no es mirar un proyecto malo, es pujar por él.
    if (wkSoloAptas && !(p.veredicto || {}).apto) return false;
    if (fuentes.length && !fuentes.includes(p.fuente)) return false;
    if (p.horas != null && p.horas > wkHoras) return false;
    // Sin dato de competencia no se descarta: no saber no es tener mucha.
    if (tope && p.propuestas != null && p.propuestas > tope) return false;
    if (busca) {
      const todo = (p.titulo + " " + (p.descripcion || "") + " " +
                    (p.habilidades || []).join(" ")).toLowerCase();
      // Todas las palabras tienen que estar: "python api" es más estrecho que
      // "python", no una lista de alternativas.
      if (!busca.split(/\s+/).every((t) => todo.includes(t))) return false;
    }
    return true;
  });
  // Freelancer.es y Freelancermap se piden en vivo; los de Workana son de la
  // última cosecha manual. Si eso tiene tres días hay que decirlo aquí: antes
  // se escribía "Actualizado el …" y `pintarWorkana` lo pisaba al instante, así
  // que la lista podía llevar una semana muerta sin que nada lo indicara.
  const hCosecha = wkCosecha ? horasDesde(wkCosecha) : null;
  const avisoCosecha = hCosecha != null && hCosecha > 24
    ? " · ⚠️ los de Workana son de hace " + Math.round(hCosecha / 24) +
      " días, pídeme que los recoja otra vez"
    : "";
  const aptas = workana.filter((p) => (p.veredicto || {}).apto).length;
  $("#wk-estado").textContent = lista.length
    ? lista.length + " de " + workana.length + " proyectos abiertos · " + aptas +
      " pasan el filtro" +
      (wkCerrados ? " · " + wkCerrados + " ya cerrados, ocultos" : "") + avisoCosecha
    : workana.length
      ? "Ninguno de los " + workana.length + " proyectos pasa el filtro: borra la palabra, " +
        "sube el plazo o el máximo de propuestas."
      : "Todavía no hay proyectos. Pulsa «Actualizar» y sigue las instrucciones.";
  lista.forEach((p) => caja.appendChild(tarjetaWorkana(p)));
}

function wkFuentes() {
  return [...document.querySelectorAll(".chip-w.activa")].map((c) => c.dataset.fuente);
}

/* ------------------------------------------------- piloto automático y enviadas
   El cupo manda: 6 pujas al mes en Freelancer y 2 por semana en Workana. Por eso
   el piloto manda UNA al día como mucho — no es una limitación, es lo correcto:
   gastarlas todas en un día deja la semana siguiente a cero, y los dos sitios
   penalizan pujar en masa. */
function pintarAuto(a) {
  const enc = a.encendido;
  $("#btnAuto").textContent = enc ? "⏸ Parar" : "▶ Start";
  $("#btnAuto").classList.toggle("activa", enc);
  wkCupo = a.cupo || wkCupo;
  const cupo = Object.entries(wkCupo || {})
    .map(([s, c]) => (s === "Freelancer" ? "Freelancer.es" : s) + " " + c.quedan + "/" + c.de +
                     " por " + c.cada).join("  ·  ");
  // De dónde sale el número, porque es el que decide cuántas se mandan: si no
  // cuadra con lo que dice tu cuenta, se corrige y se queda corregido.
  $("#auto-cupo").textContent = "Pujas que te quedan: " + cupo +
    ". Leído de cada plataforma el 2-nov.";
  $("#auto-estado").textContent = enc
    ? "Encendido: una tanda al día. Evalúa, redacta, rellena, envía y te avisa por correo."
    : "Apagado. Con Start evalúa y manda una propuesta al día, sola.";
  const d = (a.diario || [])[0];
  $("#auto-diario").textContent = d ? "Última vez (" + fechaCorta(d.cuando) + "): " + d.texto : "";
}

async function cargarAuto() {
  try { pintarAuto(await (await fetch("/api/auto")).json()); } catch (e) { /* aún no */ }
}

async function pintarEnviadas() {
  const caja = $("#enviadas");
  caja.innerHTML = "";
  let r;
  try { r = await (await fetch("/api/enviadas")).json(); } catch (e) { return; }
  wkCupo = r.cupo || {};
  const envios = r.envios || [];
  if (!envios.length) {
    caja.appendChild(crear("p", { className: "ayuda",
      textContent: "Todavía no has mandado ninguna desde aquí." }));
    return;
  }
  envios.forEach((e) => {
    const abrir = crear("button", { className: "btn-mini", textContent: "Ver el proyecto" });
    abrir.onclick = () => api("/api/abrir", { que: "url", valor: e.url });
    const texto = crear("details", {}, [
      crear("summary", { textContent: "Lo que prometiste" }),
      crear("pre", { className: "cajon-propuesta", textContent: e.texto || "" }),
    ]);
    caja.appendChild(crear("div", { className: "oferta usada" }, [
      crear("div", { className: "alto" }, [
        avatar(e.titulo),
        crear("div", {}, [crear("div", { className: "tit", textContent: e.titulo })]),
      ]),
      crear("div", { className: "meta" }, [
        crear("span", { className: "etq fuente grande " +
          (e.fuente || "").toLowerCase().replace(/\./g, ""),
          textContent: e.fuente === "Freelancer" ? "Freelancer.es" : (e.fuente || "") }),
        crear("span", { className: "etq", textContent: fechaCorta(e.cuando) }),
        e.importe ? crear("span", { className: "etq sueldo", textContent: e.importe }) : null,
        e.plazo ? crear("span", { className: "etq", textContent: e.plazo }) : null,
        e.nota != null ? crear("span", { className: "etq", textContent: "nota " + e.nota }) : null,
      ].filter(Boolean)),
      e.motivo ? crear("p", { className: "ayuda", textContent: e.motivo }) : null,
      texto,
      crear("div", { className: "botones" }, [abrir]),
    ].filter(Boolean)));
  });
}

function mostrarSubvista(cual) {
  $("#fl-oportunidades").hidden = cual !== "oportunidades";
  $("#fl-enviadas").hidden = cual !== "enviadas";
  if (cual === "enviadas") pintarEnviadas(); else cargarWorkana();
}

async function cargarWorkana() {
  try {
    await cargarMarcas();
    // Se pide en vivo con lo que haya escrito: Freelancer.es y Freelancermap
    // se consultan en cada carga, así que al abrir la pestaña la lista es de
    // ahora y no la de ayer.
    const q = new URLSearchParams({ texto: ($("#wk-texto") || {}).value || "", dias: "14" });
    // `candidatas` es `workana` más el veredicto de cada proyecto: si sabes
    // hacerlo, si no es fraude y si el presupuesto deja sobrante sobre tu
    // tarifa. Sin eso, la lista son 90 proyectos y 8 pujas para gastarlas mal.
    const r = await (await fetch("/api/candidatas?" + q)).json();
    workana = r.proyectos || [];
    wkCerrados = r.cerrados || 0;
    wkCosecha = (r.auto && r.actualizado) || r.actualizado || "";
    wkCupo = r.cupo || {};
    pintarWorkana();
    if (r.auto) pintarAuto({ ...r.auto, cupo: r.cupo });
  } catch (e) { /* sin proyectos todavía */ }
}

async function propuestaWorkana(p, boton) {
  const antes = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Redactando…";
  try {
    const r = await api("/api/propuesta-workana", { proyecto: p, cv: cv });
    if (r.error) throw new Error(r.error);
    verPropuesta(p, r);
  } catch (e) {
    alert("No pude redactar la propuesta:\n\n" + e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = antes;
  }
}

// De la URL del proyecto a la de su formulario de propuesta.
/* Dónde se escribe la propuesta, que no es la misma página en cada sitio:
   Workana la pone en /messages/bid/, y Freelancer.es la tiene en la propia
   ficha del proyecto, bajo «Place a bid on this project». */
function urlPropuesta(url) {
  if (url.includes("workana.com")) return url.replace("/job/", "/messages/bid/");
  if (url.includes("freelancer.")) {
    return url.includes("/details") ? url : url.replace(/\/?$/, "/details");
  }
  return url;        // Freelancermap y demás: se postula en su propia ficha
}

function verPropuesta(p, r) {
  const texto = crear("textarea", { className: "cajon-propuesta" });
  // La IA suele cerrar la propuesta con la pregunta Y devolverla aparte: se
  // añade solo si no está ya dentro, o salía duplicada.
  const cuerpo = r.propuesta || "";
  const falta = r.preguntar && !cuerpo.includes(r.preguntar.trim());
  texto.value = cuerpo + (falta ? "\n\n" + r.preguntar : "");

  // Workana pide además horas, importe y plazo. Son un compromiso, así que
  // van editables y a la vista, no escondidos en el envío.
  const horas = crear("input", { type: "number", min: "1", className: "mini-campo",
    value: r.horas || "" });
  const importe = crear("input", { type: "number", min: "1", className: "mini-campo",
    value: r.importe || "" });
  const plazo = crear("input", { type: "text", className: "mini-campo ancho",
    value: r.plazo || "", placeholder: "10 días" });

  /* Freelancer.es rechaza la puja entera si pasa de 1500 caracteres, y no lo
     dice hasta que le das a enviar. Con el contador a la vista se ve antes. */
  const cuenta = crear("span", { className: "ayuda" });
  const contar = () => {
    const n = texto.value.length;
    const pasa = r.limite && n > r.limite;
    cuenta.textContent = r.limite ? n + " / " + r.limite + " caracteres" +
      (pasa ? " — se pasa, el sitio la rechazará entera" : "") : n + " caracteres";
    cuenta.classList.toggle("mal", !!pasa);
  };
  texto.oninput = contar;

  const copiar = crear("button", { className: "btn-mini", textContent: "Copiar solo el texto" });
  copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(texto.value); }
    catch (e) { texto.select(); document.execCommand("copy"); }
    copiar.textContent = "Copiado ✓";
    setTimeout(() => (copiar.textContent = "Copiar solo el texto"), 1800);
  };

  /* Abre la página de la puja Y la rellena, sin marcador y sin tocar nada.
     El panel no puede escribir en workana.com ni en freelancer.es porque el
     navegador prohíbe el acceso entre orígenes distintos; quien escribe es el
     servidor, por AppleScript, desde fuera del navegador. Si Chrome tiene ese
     permiso apagado lo dice y se cae al marcador de toda la vida. */
  const rellenar = crear("button", { className: "btn", textContent: "Abrir y rellenar la puja" });
  rellenar.onclick = async () => {
    const antes = rellenar.textContent;
    rellenar.disabled = true;
    rellenar.textContent = "Abriendo y rellenando…";
    const destino = urlPropuesta(p.url);
    try {
      const r = await api("/api/rellenar", {
        url: destino,
        campos: { texto: texto.value, horas: horas.value,
                  importe: importe.value, plazo: plazo.value },
      });
      if (r.error) throw new Error(r.error);
      rellenar.textContent = "Rellenada ✓ — revisa y envía";
      paso.hidden = false;
      marcar(p, "vista");
      // El sitio puede reescribir una cifra por su cuenta (Workana sube el
      // importe si no llega a su mínimo). Si lo hace, se dice: si no, el texto
      // promete un precio y el formulario manda otro.
      if (r.aviso) {
        alert("Rellenada, pero el sitio cambió una cifra:\n\n" + r.aviso +
              "\n\nCorrige el precio en el texto antes de enviar, o súbelo aquí " +
              "y vuelve a rellenar.");
      }
    } catch (e) {
      rellenar.textContent = antes;
      // Plan B: el ancla lleva los datos para el marcador. No se manda al
      // servidor del sitio, así que la propuesta no sale de tu ordenador.
      let codificada = "";
      try {
        codificada = btoa(unescape(encodeURIComponent(JSON.stringify({
          cvtailor: "propuesta", texto: texto.value, horas: horas.value,
          importe: importe.value, plazo: plazo.value }))));
      } catch (e2) { /* queda abrirla vacía */ }
      await api("/api/abrir",
        { que: "url", valor: destino + (codificada ? "#cvt=" + codificada : "") });
      paso.hidden = false;
      alert("No pude rellenarla sola, la he abierto para que lo hagas con el " +
            "marcador.\n\n" + e.message);
    } finally {
      rellenar.disabled = false;
    }
  };

  const paso = crear("div", { className: "siguiente-paso", hidden: true }, [
    crear("b", { textContent: "Ya está abierta y rellena. Ahora, en esa pestaña:" }),
    crear("ol", {}, [
      crear("li", { textContent: "Arrastra las capturas al campo de adjuntos." }),
      crear("li", { textContent: "Léela entera y pulsa el botón de enviar del sitio." }),
    ]),
    crear("span", { className: "ayuda",
      textContent: "El envío lo haces tú siempre: yo relleno, nunca mando. Si Chrome dijo que " +
        "no puede rellenar, actívalo una sola vez en Ver › Desarrollador › Permitir JavaScript " +
        "desde Apple Events." }),
  ]);
  // Un marcador no puede rellenar un campo de archivo: lo impide el navegador
  // por seguridad. Lo más cerca de "ya está todo" es abrirle la carpeta para
  // que arrastre las capturas al formulario.
  const fotos = crear("button", { className: "btn-mini", textContent: "Abrir mis capturas" });
  fotos.onclick = () => api("/api/abrir", { que: "carpeta", valor: "salidas/capturas" });
  // Qué capturas pegan con ESTE proyecto. Mandar las cuatro siempre sería
  // relleno, y el relleno en una propuesta se nota.
  const sugeridasFotos = (r.capturas || []).length
    ? crear("p", { className: "ayuda",
        textContent: "Adjunta solo estas: " +
          r.capturas.map((c) => c.archivo + " (" + c.titulo + ")").join("  ·  ") })
    : crear("p", { className: "ayuda",
        textContent: "Ninguna de tus capturas pega con este proyecto. Mejor sin imágenes " +
          "que con una que no venga a cuento." });
  const cerrar = crear("button", { className: "btn-mini", textContent: "Cerrar" });

  const panel = crear("div", { className: "modal-caja" }, [
    crear("h3", { textContent: p.titulo }),
    crear("p", { className: "ayuda",
      textContent: "Encaje " + (r.encaje != null ? r.encaje + "%" : "—") + " · " + (r.motivo || "") }),
    texto,
    cuenta,
    crear("div", { className: "fila-campos" }, [
      crear("label", {}, [crear("span", { textContent: "Horas" }), horas]),
      crear("label", {}, [crear("span", { textContent: "Importe (" + (p.presupuesto || "?") + ")" }), importe]),
      crear("label", {}, [crear("span", { textContent: "Plazo" }), plazo]),
    ]),
    crear("p", { className: "ayuda",
      textContent: "Léela antes de enviarla. El primer botón abre la página de la puja y deja " +
        "escritos texto, importe y plazo; tú solo revisas y pulsas enviar. Las imágenes las " +
        "arrastras tú desde «Abrir mis capturas»: ningún programa puede rellenar un campo de " +
        "archivo, lo impide el navegador." }),
    sugeridasFotos,
    crear("div", { className: "botones" }, [rellenar, fotos, copiar, cerrar]),
    paso,
  ]);
  const fondo = crear("div", { className: "modal-fondo" }, [panel]);
  const quitar = () => fondo.remove();
  cerrar.onclick = quitar;
  fondo.onclick = (ev) => { if (ev.target === fondo) quitar(); };
  document.body.appendChild(fondo);
  contar();
  texto.focus();
}

// Al tocar un filtro se vuelve a pedir la lista al servidor, no solo se
// repinta: así aparecen los proyectos recién volcados sin recargar la página.
segmentos($("#wk-plazo"), (d) => { wkHoras = parseInt(d.horas, 10) || 72; cargarWorkana(); });
$("#wk-competencia").oninput = () => pintarWorkana();
$("#wk-texto").oninput = () => pintarWorkana();
// Enter en el buscador vuelve a pedir en vivo, no solo filtra lo que ya hay.
$("#wk-texto").onkeydown = (ev) => { if (ev.key === "Enter") cargarWorkana(); };
document.querySelectorAll(".chip-w").forEach((c) => {
  c.onclick = () => { c.classList.toggle("activa"); pintarWorkana(); };
});
segmentos($("#wk-aptas"), (d) => { wkSoloAptas = d.aptas === "1"; pintarWorkana(); });
segmentos($("#wk-moneda"), (d) => { wkMoneda = d.moneda; pintarWorkana(); });
segmentos($("#fl-vistas"), (d) => mostrarSubvista(d.sub));

$("#btnAuto").onclick = async () => {
  const b = $("#btnAuto");
  const encender = b.textContent.indexOf("Start") >= 0;
  if (encender && !confirm(
      "A partir de ahora mandaré una propuesta al día yo solo, sin preguntarte:\n\n" +
      "· Solo a proyectos que pasen el filtro (sabes hacerlos, no son fraude y el " +
      "presupuesto deja sobrante sobre tu tarifa).\n" +
      "· Una al día como mucho, porque solo tienes 6 pujas al mes en Freelancer.es y " +
      "2 por semana en Workana, y los dos sitios penalizan pujar en masa.\n" +
      "· Recibirás un correo con cada propuesta enviada y lo que prometí en ella.\n\n" +
      "¿Lo enciendo?")) return;
  b.disabled = true;
  try {
    pintarAuto(await api("/api/auto", { encendido: encender }));
  } finally { b.disabled = false; }
};

/* El cupo de Workana depende del nivel y del plan, así que el número puede
   quedarse viejo sin avisar. Mejor que lo corrija él que seguir con uno mal. */
$("#btnCupo").onclick = async () => {
  const actual = wkCupo || {};
  const fl = prompt("¿Cuántas pujas te deja Freelancer.es AL MES?\n\n" +
    "Lo ves en la página de un proyecto: «X bids left out of Y».",
    (actual.Freelancer || {}).de || 6);
  if (fl === null) return;
  const wk = prompt("¿Y cuántos contactos te deja Workana POR SEMANA?\n\n" +
    "Lo ves en tu perfil, en «Contactos disponibles». Depende de tu nivel y de tu plan.",
    (actual.Workana || {}).de || 2);
  if (wk === null) return;
  pintarAuto(await api("/api/auto", { cupo: {
    Freelancer: { cuantas: parseInt(fl, 10) || 6, cada: "mes" },
    Workana: { cuantas: parseInt(wk, 10) || 2, cada: "semana" },
  } }));
};

/* El navegador del panel: un Chrome con perfil propio que el servidor sí puede
   conducir. No toca el Chrome personal; solo hay que iniciar sesión una vez. */
$("#btnNavegador").onclick = async () => {
  const b = $("#btnNavegador");
  const antes = b.textContent;
  b.disabled = true;
  b.textContent = "Abriendo…";
  try {
    const r = await api("/api/navegador", {});
    if (r.error) throw new Error(r.error);
    alert(r.ya
      ? "Ya estaba abierto."
      : "Abierto. Inicia sesión ahí en Workana y en Freelancer.es (solo esta vez).\n\n" +
        "Es un Chrome aparte con su propio perfil: no toca el tuyo ni te cierra nada. " +
        "Desde ese momento el panel puede rellenar y enviar solo.");
  } catch (e) {
    alert("No pude abrirlo:\n\n" + e.message);
  } finally { b.disabled = false; b.textContent = antes; }
};

$("#btnAutoAhora").onclick = async () => {
  const b = $("#btnAutoAhora");
  const antes = b.textContent;
  b.disabled = true;
  b.textContent = "Evaluando y redactando…";
  try {
    const r = await api("/api/auto", { ahora: true });
    pintarAuto(r);
    // La tanda corre en segundo plano porque tarda minutos: se sigue por el
    // diario, que se refresca solo hasta que haya un resultado.
    alert("En marcha. Tarda un par de minutos: redactar, rellenar, enviar y " +
          "COMPROBAR que entró de verdad.\n\nEl resultado aparece aquí abajo, y si " +
          "se envía te llega el correo.");
    let vueltas = 0;
    const reloj = setInterval(async () => {
      await cargarAuto();
      await pintarEnviadas();
      if (++vueltas > 40) clearInterval(reloj);
    }, 15000);
  } catch (e) {
    alert("La tanda falló:\n\n" + e.message);
  } finally { b.disabled = false; b.textContent = antes; }
};
/* Antes este botón solo sacaba un aviso de que Workana bloquea la lectura
   automática: no refrescaba nada y parecía roto. Workana sigue bloqueada, pero
   Freelancer.es y Freelancermap sí se piden en vivo, así que el botón hace lo
   que puede hacer y dice qué parte no depende de él. */
$("#btnWorkana").onclick = async () => {
  const b = $("#btnWorkana");
  const antes = b.textContent;
  b.disabled = true;
  b.textContent = "Actualizando…";
  try {
    await cargarWorkana();
    const h = wkCosecha ? horasDesde(wkCosecha) : null;
    if (h != null && h > 24) {
      $("#wk-estado").textContent += " — Freelancer.es y Freelancermap están al día; " +
        "los de Workana no, porque su Cloudflare bloquea la lectura automática.";
    }
  } finally {
    b.disabled = false;
    b.textContent = antes;
  }
};

cargarWorkana();


/* --------------------------------------------------- refrescar al abrir
   El panel abría con las mismas ofertas desde el 30-sep: `recomendadas.json`
   es un fichero que nadie caduca, así que se quedó congelado 28 días. Ahora se
   busca de verdad CADA VEZ que se entra al panel — sin mirar si lo guardado
   parece fresco — porque un fichero con fecha de hoy puede seguir teniendo las
   mismas veinte ofertas de ayer. */
function horasDesde(iso) {
  const t = Date.parse(iso);
  return isNaN(t) ? null : (Date.now() - t) / 36e5;
}

// `var` a propósito: `mostrarVista("panel")` corre durante el arranque, antes
// de llegar aquí, y con `let` reventaba por zona muerta temporal.
var ultimaBusqueda = 0;
var MINUTOS_ENTRE_BUSQUEDAS = 10;

/* Buscar solo al cargar la página no basta: si deja el panel abierto en una
   pestaña y vuelve dos horas después, sigue viendo lo de hace dos horas. Se
   vuelve a buscar al volver a la pestaña y al entrar en el Panel, con un
   mínimo de 10 minutos para no machacar a LinkedIn. */
function refrescarSiTocaYa() {
  if (typeof refrescarAlAbrir !== "function") return;     // aún arrancando
  if (Date.now() - ultimaBusqueda < MINUTOS_ENTRE_BUSQUEDAS * 60000) return;
  refrescarAlAbrir();
}

/* Lo mismo para Freelance: tenía `cargarWorkana()` al entrar en la pestaña,
   pero si la dejaba abierta y volvía al rato no se enteraba de nada, porque
   estos dos oyentes solo miraban el Panel. */
function refrescarVistaActiva() {
  if (!$("#panel").hidden) refrescarSiTocaYa();
  else if (!$("#freelance").hidden) cargarWorkana();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refrescarVistaActiva();
});
window.addEventListener("focus", refrescarVistaActiva);

async function refrescarAlAbrir() {
  ultimaBusqueda = Date.now();
  const nodo = $("#estadoBuscar");
  nodo.className = "estado";
  nodo.textContent = "Buscando lo publicado hoy…";
  let texto = "";
  try { texto = localStorage.getItem("cvtailor.busqueda") || ""; } catch (e) { /* modo privado */ }
  if (!texto) texto = ($("#cv-titular") && $("#cv-titular").value) || "desarrollador backend python";
  $("#bu-texto").value = texto;
  $("#btnBuscar").click();
}

/* Las "Sugeridas por Claude" salen de un fichero que no se regenera solo. Si
   tiene más de un día, se dice su edad en la cara en vez de hacerlas pasar por
   recomendaciones de hoy. */
/* Qué conocimientos suyos aparecen en la oferta. Es coincidencia de palabras,
   no un juicio, y la sección lo dice así. */
function coincidencias(o) {
  const saber = (cv && cv.conocimientos) || [];
  const t = ((o.titulo || "") + " " + (o.empresa || "") + " " + (o.lugar || "")).toLowerCase();
  const encontradas = [];
  saber.forEach((s) => {
    const raiz = s.toLowerCase().split(" (")[0].trim();
    if (raiz.length > 2 && t.includes(raiz)) encontradas.push(s.split(" (")[0]);
  });
  return encontradas;
}

/* Lo fresco vale, pero no tanto como que encaje: una oferta de hace una hora
   que no tiene nada que ver no sirve de nada. 65% encaje, 35% frescura. */
function frescura(o) {
  const h = o.horas != null ? o.horas : (o.dias != null ? o.dias * 24 : null);
  if (h == null) return 0.3;                 // sin dato, ni premio ni castigo
  if (h <= 6) return 1;
  if (h <= 24) return 0.8;
  if (h <= 48) return 0.6;
  if (h <= 72) return 0.4;
  return 0.2;
}

function puntuarEncaje(o) {
  // El número que pinta la tarjeta es un PORCENTAJE: con tres conocimientos
  // coincidiendo ya se da por pleno, que más no cambia la decisión.
  const n = coincidencias(o).length;
  const pctSaber = Math.min(1, n / 3);
  return Math.round((0.65 * pctSaber + 0.35 * frescura(o)) * 100);
}

function porQueEncaja(o) {
  const c = coincidencias(o);
  const cuando = o.horas != null && o.horas < 24
    ? "publicada hace " + Math.max(1, Math.round(o.horas)) + " h"
    : o.dias === 0 ? "publicada hoy"
    : o.dias === 1 ? "publicada ayer"
    : o.dias != null ? "publicada hace " + o.dias + " días" : "";
  const saber = c.length ? "coincide en " + c.slice(0, 3).join(", ")
                         : "no coincide con tus conocimientos por el título";
  return [saber, cuando].filter(Boolean).join(" · ");
}

async function sugeridasFrescas() {
  let viejas = null;
  try {
    const r = await (await fetch("/api/recomendadas")).json();
    const h = horasDesde(r.actualizado);
    if (h !== null && h < 24) return;          // el fichero aún sirve
    viejas = r.actualizado;
  } catch (e) { /* sin fichero: se rellena igual */ }

  // El fichero está caducado. En vez de enseñar ofertas de hace semanas, esta
  // sección se rellena con lo que la búsqueda acaba de traer, ordenado por
  // cuántos de sus conocimientos aparecen en el título.
  const esperar = () => new Promise((listo) => setTimeout(listo, 400));
  for (let i = 0; i < 40 && !ofertasEncontradas.length; i++) await esperar();
  if (!ofertasEncontradas.length) return;

  // Solo tres: esta sección es una recomendación, no un segundo listado.
  // El listado completo ya está arriba, en «Trabajos de esta semana».
  recomendadas = ofertasEncontradas
    .map((o) => Object.assign({}, o, { encaje: puntuarEncaje(o), motivo: porQueEncaja(o) }))
    .sort((a, b) => b.encaje - a.encaje || (a.horas ?? 999) - (b.horas ?? 999))
    .slice(0, 3);
  pintarRecomendadas();
  const nota = $("#reco-nota");
  if (nota) {
    nota.textContent = "Las " + recomendadas.length + " mejores: 65% por coincidir con tus " +
      "conocimientos, 35% por ser recientes. El resto está arriba." +
      (viejas ? " (Las guardadas eran del " + viejas + " y se han descartado.)" : "");
  }
}

refrescarAlAbrir();
sugeridasFrescas();
