"""Servidor local (solo biblioteca estándar) que sirve la interfaz web y la API."""

import json
import mimetypes
import socket
import threading
import webbrowser
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from motor import Resultado, ErrorSintaxis, DemasiadosEstados

RAIZ_WEB = (Path(__file__).parent / "web").resolve()
MAX_CUERPO = 16 * 1024
MAX_CADENA = 1000


@lru_cache(maxsize=64)
def _resultado(texto):
    return Resultado(texto)


class Manejador(BaseHTTPRequestHandler):
    server_version = "AutomatasLocal/1.0"

    def log_message(self, formato, *args):  # silencio en consola
        pass

    # ---- utilidades -------------------------------------------------
    def _responder(self, codigo, contenido, tipo):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(contenido)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(contenido)

    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self._responder(codigo, cuerpo, "application/json; charset=utf-8")

    # ---- rutas ------------------------------------------------------
    def do_GET(self):
        ruta = self.path.split("?", 1)[0]
        if ruta == "/":
            ruta = "/index.html"
        archivo = (RAIZ_WEB / ruta.lstrip("/")).resolve()
        if RAIZ_WEB not in archivo.parents or not archivo.is_file():
            self._responder(404, b"No encontrado", "text/plain; charset=utf-8")
            return
        tipo = mimetypes.guess_type(archivo.name)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo in ("application/javascript", "application/json"):
            tipo += "; charset=utf-8"
        self._responder(200, archivo.read_bytes(), tipo)

    def do_POST(self):
        if self.path not in ("/api/analizar", "/api/probar"):
            self._json(404, {"ok": False, "error": "Ruta desconocida"})
            return
        try:
            largo = int(self.headers.get("Content-Length", 0))
            if largo > MAX_CUERPO:
                self._json(413, {"ok": False, "error": "Petición demasiado grande"})
                return
            datos = json.loads(self.rfile.read(largo) or b"{}")
            texto = str(datos.get("regex", ""))
            resultado = _resultado(texto)
            if self.path == "/api/analizar":
                self._json(200, {"ok": True, **resultado.a_dict()})
            else:
                cadena = str(datos.get("cadena", ""))[:MAX_CADENA]
                self._json(200, {"ok": True, **resultado.probar(cadena)})
        except ErrorSintaxis as e:
            self._json(200, {"ok": False, "error": e.mensaje, "posicion": e.posicion})
        except DemasiadosEstados as e:
            self._json(200, {"ok": False, "error": str(e)})
        except (ValueError, KeyError):
            self._json(400, {"ok": False, "error": "Petición inválida"})


def _puerto_libre(preferido):
    for puerto in range(preferido, preferido + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", puerto)) != 0:
                return puerto
    raise OSError("No se encontró un puerto libre")


def iniciar(puerto=8000, abrir_navegador=True):
    puerto = _puerto_libre(puerto)
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Manejador)
    url = f"http://127.0.0.1:{puerto}"
    print(f"Interfaz disponible en {url}  (Ctrl+C para salir)")
    if abrir_navegador:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        servidor.server_close()
