#!/bin/sh
# Reconstruye el bundle y lo aplica sobre la copia previa a la tragaperras 3D.
# OJO: parte de /workspace/royal-casino-backup-antes-slot3d.html; si index.html ha cambiado después, rehaz esa copia antes.
set -e
cd /workspace/slot3d
node build.mjs
python3 patch.py
python3 poker_fix.py   # arreglo del póker de 2 cartas (independiente del 3D)
python3 circulos_fix.py  # sin círculos detrás de uva/sandía/estrella/campana
python3 sx5_patch.py     # Slots 5 en 3D: ganchos + CSS + bundle común
python3 pk3d_patch.py     # Póker de 2 cartas 3D + botones en móvil (póker y blackjack)
python3 bc3d_patch.py     # Baccarat 3D (makeTable) + botones en móvil
