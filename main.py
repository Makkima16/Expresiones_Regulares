"""Punto de entrada: levanta el servidor local y abre la interfaz en el navegador."""

import argparse

from servidor import iniciar

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Visualizador de expresiones regulares y autómatas")
    parser.add_argument("--puerto", type=int, default=8000, help="puerto preferido (por defecto 8000)")
    parser.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador automáticamente")
    args = parser.parse_args()
    iniciar(args.puerto, not args.sin_navegador)
