(function () {
  var d = document, ADAPTADOR = "http://127.0.0.1:8765";

  function buscaOferta(x) {
    if (!x) return null;
    if (Array.isArray(x)) { for (var i = 0; i < x.length; i++) { var a = buscaOferta(x[i]); if (a) return a; } return null; }
    if (typeof x === "object") {
      var t = x["@type"];
      if (t && String(t).toLowerCase().indexOf("jobposting") >= 0) return x;
      for (var k in x) { var b = buscaOferta(x[k]); if (b) return b; }
    }
    return null;
  }
  function jsonLd() {
    var j = null;
    try {
      [].forEach.call(d.querySelectorAll('script[type="application/ld+json"]'), function (s) {
        if (!j) { try { j = buscaOferta(JSON.parse(s.textContent)); } catch (e) {} }
      });
    } catch (e) {}
    return j;
  }
  function aTexto(marcado) {          // DOMParser no ejecuta nada: es seguro
    var m = String(marcado).replace(/<li[^>]*>/gi, "\n• ").replace(/<br[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n");
    return new DOMParser().parseFromString(m, "text/html").body.textContent || "";
  }
  function dias(t) {
    t = (t || "").toLowerCase();
    if (/\bhoy\b|hace\s*\d+\s*(h|hora|min)/.test(t)) return 0;
    if (/\bayer\b/.test(t)) return 1;
    var m = t.match(/hace\s*(\d+)\s*(d|d[ií]as?)/);
    if (m) return parseInt(m[1], 10);
    m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return Math.max(0, Math.round((Date.now() - new Date(+m[3], +m[2] - 1, +m[1])) / 86400000));
    return null;
  }

  /* --------- tarjetas de un listado de resultados --------- */
  var cajas = d.querySelectorAll(
    '[class*="OfferCard"], .base-card, [class*="job-search-card"], .p-3.border.rounded');
  var vistos = {}, ofertas = [];
  [].forEach.call(cajas, function (caja) {
    var a = caja.querySelector('a[href*="/of-i"], a[href*="/jobs/view/"], a[href*="/rf-"]');
    if (!a) return;                      // solo enlaces que son ofertas, no los de la empresa
    var url = (a.href || "").split("?")[0];
    var t = (caja.innerText || "").replace(/[ \t]+/g, " ").trim();
    var l = t.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    if (!url || !l.length) return;
    var clave = (l[0] + "|" + (l[1] || "")).toLowerCase();
    if (vistos[url] || vistos[clave]) return;
    vistos[url] = vistos[clave] = 1;
    ofertas.push({
      url: url, titulo: l[0].slice(0, 150), empresa: (l[1] || "").slice(0, 100),
      lugar: [l[2], l[3]].filter(Boolean).join(" · ").slice(0, 80),
      dias: dias(t), texto: t.slice(0, 400),
    });
  });

  function enviar(datos, aviso) {
    fetch(ADAPTADOR + (datos.ofertas ? "/api/ofertas-pegadas" : "/api/oferta-pegada"), {
      method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(datos),
    }).then(function (r) {
      if (!r.ok) throw new Error("no");
      alert(aviso);
    }).catch(function () {
      navigator.clipboard.writeText(JSON.stringify(datos)).then(function () {
        alert("Esta web no deja que el navegador hable con el Adaptador.\n\n" +
              "Lo he copiado: ve al panel del Adaptador y pulsa «Pegar ofertas copiadas».");
      }).catch(function () { alert("No he podido copiarlo. Prueba a recargar la página."); });
    });
  }

  if (ofertas.length >= 3) {
    enviar({ ofertas: ofertas, origen: location.href },
           "He mandado " + ofertas.length + " ofertas al panel del Adaptador.");
    return;
  }

  var j = jsonLd(), org = (j && j.hiringOrganization) || {};
  if (Array.isArray(org)) org = org[0] || {};
  enviar({
    url: location.href, puesto: (j && j.title) || d.title, empresa: org.name || "",
    texto: ((j && j.description) ? aTexto(j.description)
                                 : ((d.querySelector("main") || d.body).innerText || ""))
           .replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000),
  }, "Oferta enviada al Adaptador de CV. Cambia a su pestaña.");
})();
