#!/usr/bin/env python3
"""Busca funciones que se llaman pero no existen en web/app.js.

`node --check` solo mira la sintaxis: un `cargarPerfiles()` borrado por error pasa
la comprobación y revienta en el navegador, dejando la interfaz en blanco. Esto
lo caza antes. No es un analizador de verdad, es una red para ese fallo concreto.
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# lo que ofrece el navegador y no está definido en el fichero
CONOCIDOS = {
    "alert", "confirm", "prompt", "fetch", "btoa", "atob", "escape", "unescape", "setTimeout", "setInterval", "clearTimeout",
    "clearInterval", "Promise", "Number", "String", "Boolean", "Array", "Object", "JSON",
    "Date", "Math", "Error", "Map", "Set", "RegExp", "URLSearchParams", "FileReader",
    "Blob", "URL", "encodeURIComponent", "decodeURIComponent", "parseFloat", "parseInt",
    "isNaN", "getComputedStyle", "console", "document", "window", "navigator", "location",
    "require", "if", "for", "while", "switch", "catch", "return", "typeof", "function",
    "async", "await", "new", "delete", "void", "yield", "else", "try", "do", "case",
}


def sin_texto(codigo):
    """Deja solo el código: fuera comentarios y cadenas. Se hace en una pasada,
    carácter a carácter, porque con expresiones regulares sueltas una comilla
    dentro de otra cadena se come trozos de código de verdad."""
    salida = []
    estado = None          # None | "//" | "/*" | "'" | '"' | "`"
    i, n = 0, len(codigo)
    while i < n:
        c = codigo[i]
        par = codigo[i:i + 2]
        if estado is None:
            if par == "//":
                estado, i = "//", i + 2
                continue
            if par == "/*":
                estado, i = "/*", i + 2
                continue
            if c in "'\"`":
                estado, i = c, i + 1
                salida.append(" ")
                continue
            salida.append(c)
        elif estado == "//":
            if c == "\n":
                estado = None
                salida.append(c)
        elif estado == "/*":
            if par == "*/":
                estado, i = None, i + 2
                continue
        else:                                   # dentro de una cadena
            if c == "\\":
                i += 2
                continue
            if c == estado:
                estado = None
            elif c == "\n" and estado in "'\"":
                estado = None                   # cadena sin cerrar: no arrastra más líneas
                salida.append(c)
        i += 1
    return "".join(salida)


def revisar(ruta):
    codigo = sin_texto(open(ruta, encoding="utf-8").read())
    definidas = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)\s*\(", codigo))
    definidas |= set(re.findall(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)", codigo))
    # los parámetros también son nombres válidos dentro del fichero
    for lista in re.findall(r"function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)", codigo):
        definidas |= {x.strip().split("=")[0].strip() for x in lista.split(",") if x.strip()}
    for lista in re.findall(r"\(([^()]*)\)\s*=>", codigo):
        definidas |= {x.strip().split("=")[0].strip() for x in lista.split(",") if x.strip()}
    definidas |= set(re.findall(r"\b([A-Za-z_$][\w$]*)\s*=>", codigo))
    definidas |= set(re.findall(r"catch\s*\(\s*([A-Za-z_$][\w$]*)", codigo))
    definidas.discard("")

    llamadas = set()
    for m in re.finditer(r"(?<![\w.$])([a-zA-Z_$][\w$]*)\s*\(", codigo):
        nombre = m.group(1)
        # descarta métodos (algo.metodo()) y palabras clave
        if nombre in CONOCIDOS or nombre in definidas:
            continue
        llamadas.add(nombre)

    faltan = sorted(n for n in llamadas if n[0].islower() and len(n) > 3)
    return faltan


if __name__ == "__main__":
    problemas = []
    for fichero in ["web/app.js", "web/marcador.js"]:
        ruta = os.path.join(RAIZ, fichero)
        if not os.path.exists(ruta):
            continue
        faltan = revisar(ruta)
        if faltan:
            problemas.append("%s llama a funciones que no existen: %s" % (fichero, ", ".join(faltan)))

    if problemas:
        print("\n".join(problemas))
        sys.exit(1)
    print("web/*.js: todas las funciones llamadas están definidas")
