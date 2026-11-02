// Conduce el Chrome que arranca el panel, por el protocolo de DevTools.
//
// Por que esto y no AppleScript: una pagina servida en localhost no puede tocar
// el formulario de workana.com ni el de freelancer.es (el navegador prohibe el
// acceso entre origenes), y el camino de AppleScript exige activar a mano
// "Permitir JavaScript desde Apple Events" en el menu de Chrome. Por CDP el
// servidor lo hace solo, sin pedir permisos y sin tocar el Chrome personal:
// es otra instancia, con su propio perfil en ~/.cvtailor-chrome.
//
//   node cdp.mjs '<json>'
//   {"url": "...", "js": "...", "navegar": true, "esperar": 4000}
//
// Devuelve por stdout {"ok":true,"valor":...} o {"error":"..."}.

const PUERTO = process.env.CVT_CDP_PUERTO || 9222;

async function json(ruta) {
  const r = await fetch(`http://127.0.0.1:${PUERTO}${ruta}`);
  return r.json();
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Sesion {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendientes = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pendientes.has(m.id)) {
        const { resolver, rechazar } = this.pendientes.get(m.id);
        this.pendientes.delete(m.id);
        if (m.error) rechazar(new Error(m.error.message));
        else resolver(m.result);
      }
    });
  }
  static async abrir(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error("no pude conectar al navegador")), { once: true });
    });
    return new Sesion(ws);
  }
  enviar(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      setTimeout(() => {
        if (this.pendientes.delete(id)) rechazar(new Error(`${method} no contestó`));
      }, 30000);
    });
  }
  cerrar() { try { this.ws.close(); } catch (e) { /* da igual */ } }
}

async function main() {
  const pet = JSON.parse(process.argv[2] || "{}");
  const base = (pet.url || "").split("?")[0];

  const host = (() => { try { return new URL(pet.url).host; } catch (e) { return ""; } })();
  let paginas = (await json("/json/list")).filter((t) => t.type === "page");
  let pagina = base ? paginas.find((t) => (t.url || "").split("?")[0].startsWith(base)) : paginas[0];

  /* Si no está la página exacta, se reutiliza cualquiera del mismo sitio y se
     navega. Antes se abría una pestaña nueva en cada llamada y, llamando cada
     pocos segundos, Chrome acababa con doce pestañas iguales. Abrir solo es el
     último recurso. */
  let reciencreada = false;
  if (!pagina && host) {
    pagina = paginas.find((t) => { try { return new URL(t.url).host === host; } catch (e) { return false; } });
    if (pagina) pet.navegar = true;
  }
  if (!pagina && base) {
    await fetch(`http://127.0.0.1:${PUERTO}/json/new?${encodeURIComponent(pet.url)}`,
      { method: "PUT" }).catch(() => {});
    await esperar(1500);
    paginas = (await json("/json/list")).filter((t) => t.type === "page");
    pagina = paginas.find((t) => (t.url || "").split("?")[0].startsWith(base));
    reciencreada = true;
  }
  if (!pagina) throw new Error("no hay ninguna pestaña donde trabajar");

  const s = await Sesion.abrir(pagina.webSocketDebuggerUrl);
  try {
    if (pet.navegar && !reciencreada) {
      await s.enviar("Page.enable");
      await s.enviar("Page.navigate", { url: pet.url });
    }
    /* Esperar un número fijo de segundos no sirve: Workana pasa por Cloudflare
       y Freelancer es una SPA que tarda lo que tarda. Con 7 s la página estaba
       en blanco y el fallo salía como «esta página no tiene formulario», que
       manda a buscar donde no es. Se espera AL ELEMENTO, y el tiempo solo es
       el tope. */
    const tope = pet.esperar || 15000;
    const hasta = Date.now() + tope;
    const espera = pet.selector
      ? `!!document.querySelector(${JSON.stringify(pet.selector)})`
      : `document.readyState === "complete" && document.body && document.body.innerText.trim().length > 50`;
    let listo = false;
    while (Date.now() < hasta) {
      await esperar(700);
      try {
        const r = await s.enviar("Runtime.evaluate", { expression: espera, returnByValue: true });
        if (r.result && r.result.value === true) { listo = true; break; }
      } catch (e) { /* la página aún está cambiando de documento */ }
    }
    if (pet.selector && !listo) {
      throw new Error(`la página cargó pero «${pet.selector}» no apareció en ${Math.round(tope / 1000)} s`);
    }
    if (!pet.js) {
      const r = await s.enviar("Runtime.evaluate",
        { expression: "location.href + ' || ' + document.title", returnByValue: true });
      return { ok: true, valor: r.result.value };
    }
    const r = await s.enviar("Runtime.evaluate",
      { expression: pet.js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || "el script falló");
    }
    return { ok: true, valor: r.result.value };
  } finally {
    s.cerrar();
  }
}

main()
  .then((r) => { process.stdout.write(JSON.stringify(r)); })
  .catch((e) => { process.stdout.write(JSON.stringify({ error: String(e.message || e) })); });
