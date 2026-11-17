"""Autómata finito determinista: construcción por subconjuntos y minimización."""

from collections import deque

MAX_ESTADOS = 400


class DemasiadosEstados(ValueError):
    pass


class AFD:
    def __init__(self, alfabeto):
        self.alfabeto = sorted(alfabeto)
        self.inicio = 0
        self.aceptacion = set()
        self.transiciones = {}  # estado -> {símbolo: estado}
        self.detalle = {}  # estado -> texto explicativo (p. ej. subconjunto del AFN)

    @property
    def cantidad(self):
        return len(self.transiciones)

    # ---- simulación -------------------------------------------------
    def rastro(self, cadena):
        """Camino seguido. Devuelve (pasos, acepta); estado None = sin transición."""
        actual = self.inicio
        pasos = [(None, actual)]
        for simbolo in cadena:
            actual = self.transiciones[actual].get(simbolo)
            pasos.append((simbolo, actual))
            if actual is None:
                return pasos, False
        return pasos, actual in self.aceptacion

    def acepta(self, cadena):
        return self.rastro(cadena)[1]

    # ---- exportación ------------------------------------------------
    def a_grafo(self):
        agrupadas = {}
        for origen, salidas in self.transiciones.items():
            for simbolo, destino in salidas.items():
                agrupadas.setdefault((origen, destino), []).append(simbolo)
        return {
            "estados": [
                {
                    "id": e,
                    "etiqueta": f"q{e}",
                    "inicial": e == self.inicio,
                    "aceptacion": e in self.aceptacion,
                    "detalle": self.detalle.get(e, ""),
                }
                for e in sorted(self.transiciones)
            ],
            "aristas": [
                {"de": o, "a": d, "etiqueta": ", ".join(sorted(s))}
                for (o, d), s in sorted(agrupadas.items())
            ],
        }


def desde_afn(afn, alfabeto):
    """Construcción de subconjuntos. Los estados muertos no se incluyen."""
    afd = AFD(alfabeto)
    inicial = afn.cierre_epsilon({afn.inicio})
    ids = {inicial: 0}
    cola = deque([inicial])
    while cola:
        conjunto = cola.popleft()
        origen = ids[conjunto]
        afd.transiciones[origen] = {}
        afd.detalle[origen] = "{" + ", ".join(f"q{e}" for e in sorted(conjunto)) + "}"
        if afn.aceptacion in conjunto:
            afd.aceptacion.add(origen)
        for simbolo in afd.alfabeto:
            destino = afn.cierre_epsilon(afn.mover(conjunto, simbolo))
            if not destino:
                continue
            if destino not in ids:
                if len(ids) >= MAX_ESTADOS:
                    raise DemasiadosEstados(
                        f"El AFD supera {MAX_ESTADOS} estados; la expresión es demasiado compleja para dibujarla"
                    )
                ids[destino] = len(ids)
                cola.append(destino)
            afd.transiciones[origen][simbolo] = ids[destino]
    return afd


def minimizar(afd):
    """Minimización por refinamiento de particiones (Moore)."""
    MUERTO = -1
    estados = list(afd.transiciones) + [MUERTO]

    def siguiente(e, s):
        return MUERTO if e == MUERTO else afd.transiciones[e].get(s, MUERTO)

    clase = {e: (1 if e in afd.aceptacion else 0) for e in estados}
    while True:
        firmas = {
            e: (clase[e], tuple(clase[siguiente(e, s)] for s in afd.alfabeto))
            for e in estados
        }
        numeros = {}
        nueva = {e: numeros.setdefault(firmas[e], len(numeros)) for e in estados}
        if len(numeros) == len(set(clase.values())):
            break
        clase = nueva

    clase_muerta = clase[MUERTO]
    # Renumerar por orden de descubrimiento desde el estado inicial.
    orden = {clase[afd.inicio]: 0}
    cola = deque([afd.inicio])
    resultado = AFD(afd.alfabeto)
    representante = {}
    for e in afd.transiciones:
        representante.setdefault(clase[e], e)
    visitadas = {clase[afd.inicio]}
    while cola:
        e = cola.popleft()
        c = clase[e]
        origen = orden[c]
        resultado.transiciones[origen] = {}
        miembros = sorted(x for x in afd.transiciones if clase[x] == c)
        resultado.detalle[origen] = "≡ {" + ", ".join(f"q{x}" for x in miembros) + "}"
        if e in afd.aceptacion:
            resultado.aceptacion.add(origen)
        for s in afd.alfabeto:
            destino = siguiente(e, s)
            cd = clase[destino]
            if cd == clase_muerta and cd != c:
                continue
            if cd not in visitadas:
                visitadas.add(cd)
                orden[cd] = len(orden)
                cola.append(representante[cd])
            resultado.transiciones[origen][s] = orden[cd]
    return resultado
