"""Motor de expresiones regulares: análisis, AFN, AFD y AFD mínimo."""

import itertools
from collections import deque

from .analizador import analizar, ErrorSintaxis
from .afn import construir
from .afd import desde_afn, minimizar, DemasiadosEstados


class Resultado:
    """Todo lo que se deriva de una expresión regular."""

    def __init__(self, texto):
        self.texto = texto
        self.arbol = analizar(texto)
        self.alfabeto = sorted(self.arbol.alfabeto())
        self.afn = construir(self.arbol)
        self.afd = desde_afn(self.afn, self.alfabeto)
        self.minimo = minimizar(self.afd)

    def ejemplos(self, cuantos=6):
        """Cadenas cortas aceptadas (por búsqueda en anchura) y rechazadas."""
        aceptadas, cola, vistos = [], deque([(self.minimo.inicio, "")]), 0
        while cola and len(aceptadas) < cuantos and vistos < 4000:
            estado, cadena = cola.popleft()
            vistos += 1
            if estado in self.minimo.aceptacion:
                aceptadas.append(cadena)
            if len(cadena) < 8:
                for simbolo, destino in self.minimo.transiciones[estado].items():
                    cola.append((destino, cadena + simbolo))
        rechazadas = []
        for largo in range(1, 6):
            for tupla in itertools.product(self.alfabeto, repeat=largo):
                cadena = "".join(tupla)
                if not self.minimo.acepta(cadena):
                    rechazadas.append(cadena)
                if len(rechazadas) >= 3:
                    break
            if len(rechazadas) >= 3:
                break
        return {"aceptadas": aceptadas, "rechazadas": rechazadas}

    def a_dict(self):
        return {
            "ejemplos": self.ejemplos(),
            "arbol": self.arbol.a_dict(),
            "alfabeto": self.alfabeto,
            "afn": self.afn.a_grafo(),
            "afd": self.afd.a_grafo(),
            "minimo": self.minimo.a_grafo(),
        }

    def probar(self, cadena):
        """Simula la cadena en los tres autómatas y devuelve el recorrido."""
        pasos_afn, acepta_afn = self.afn.rastro(cadena)
        pasos_afd, acepta_afd = self.afd.rastro(cadena)
        pasos_min, acepta_min = self.minimo.rastro(cadena)
        return {
            "acepta": acepta_afn,
            "afn": {"pasos": [{"simbolo": s, "activos": a} for s, a in pasos_afn]},
            "afd": {"pasos": [{"simbolo": s, "activos": [] if e is None else [e]} for s, e in pasos_afd]},
            "minimo": {"pasos": [{"simbolo": s, "activos": [] if e is None else [e]} for s, e in pasos_min]},
            "coinciden": acepta_afn == acepta_afd == acepta_min,
        }


__all__ = ["Resultado", "analizar", "ErrorSintaxis", "DemasiadosEstados"]
