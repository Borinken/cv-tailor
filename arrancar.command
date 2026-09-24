#!/bin/bash
# Doble clic para arrancar el Adaptador de CV.
cd "$(dirname "$0")" || exit 1
echo "Arrancando el Adaptador de CV…"
echo "Cuando termines, cierra esta ventana o pulsa Ctrl+C."
exec python3 servidor.py
