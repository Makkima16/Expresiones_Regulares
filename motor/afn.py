"""Autómata finito no determinista con transiciones ε (construcción de Thompson)."""

from .arbol import LITERAL, EPSILON, CONCAT, UNION, ESTRELLA, MAS, OPCIONAL


class AFN:
    def __init__(self):
        self.cantidad = 0
        self.inicio = 0
        self.aceptacion = 0
        # origen -> lista de (símbolo o None para ε, destino)
        self.transiciones = {}

    def nuevo_estado(self):
        estado = self.cantidad
        self.cantidad += 1
        self.transiciones[estado] = []
        return estado

    def agregar(self, origen, simbolo, destino):
        self.transiciones[origen].append((simbolo, destino))

    # ---- simulación -------------------------------------------------
    def cierre_epsilon(self, estados):
        pendientes = list(estados)
        cierre = set(estados)
        while pendientes:
            actual = pendientes.pop()
            for simbolo, destino in self.transiciones[actual]:
                if simbolo is None and destino not in cierre:
                    cierre.add(destino)
                    pendientes.append(destino)
        return frozenset(cierre)

    def mover(self, estados, simbolo):
        return {d for e in estados for s, d in self.transiciones[e] if s == simbolo}

    def rastro(self, cadena):
        """Conjuntos de estados activos tras cada símbolo leído.

        Devuelve (pasos, acepta). Cada paso es (símbolo leído o None, activos).
        """
        activos = self.cierre_epsilon({self.inicio})
        pasos = [(None, sorted(activos))]
        for simbolo in cadena:
            activos = self.cierre_epsilon(self.mover(activos, simbolo))
            pasos.append((simbolo, sorted(activos)))
            if not activos:
                break
        return pasos, self.aceptacion in activos

    def acepta(self, cadena):
        return self.rastro(cadena)[1]

    # ---- exportación ------------------------------------------------
    def a_grafo(self):
        etiquetas = {}
        for origen, salidas in self.transiciones.items():
            for simbolo, destino in salidas:
                etiquetas.setdefault((origen, destino), []).append("ε" if simbolo is None else simbolo)
        return {
            "estados": [
                {
                    "id": e,
                    "etiqueta": f"q{e}",
                    "inicial": e == self.inicio,
                    "aceptacion": e == self.aceptacion,
                }
                for e in range(self.cantidad)
            ],
            "aristas": [
                {"de": o, "a": d, "etiqueta": ", ".join(sorted(set(et)))}
                for (o, d), et in sorted(etiquetas.items())
            ],
        }


def construir(nodo):
    """Construye el AFN de Thompson recorriendo el árbol de forma recursiva."""
    afn = AFN()

    def fragmento(n):
        """Devuelve (estado_inicial, estado_final) del fragmento de `n`."""
        if n.tipo in (LITERAL, EPSILON):
            ini, fin = afn.nuevo_estado(), afn.nuevo_estado()
            afn.agregar(ini, n.valor if n.tipo == LITERAL else None, fin)
            return ini, fin

        if n.tipo == CONCAT:
            i1, f1 = fragmento(n.hijos[0])
            i2, f2 = fragmento(n.hijos[1])
            afn.agregar(f1, None, i2)
            return i1, f2

        if n.tipo == UNION:
            ini = afn.nuevo_estado()
            i1, f1 = fragmento(n.hijos[0])
            i2, f2 = fragmento(n.hijos[1])
            fin = afn.nuevo_estado()
            afn.agregar(ini, None, i1)
            afn.agregar(ini, None, i2)
            afn.agregar(f1, None, fin)
            afn.agregar(f2, None, fin)
            return ini, fin

        # Operadores unarios: *, + y ?
        ini = afn.nuevo_estado()
        i1, f1 = fragmento(n.hijos[0])
        fin = afn.nuevo_estado()
        afn.agregar(ini, None, i1)
        afn.agregar(f1, None, fin)
        if n.tipo in (ESTRELLA, MAS):
            afn.agregar(f1, None, i1)  # repetir
        if n.tipo in (ESTRELLA, OPCIONAL):
            afn.agregar(ini, None, fin)  # saltarse la subexpresión
        return ini, fin

    afn.inicio, afn.aceptacion = fragmento(nodo)
    return afn
