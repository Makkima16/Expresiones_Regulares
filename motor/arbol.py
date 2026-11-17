"""Nodos del árbol sintáctico (AST) de una expresión regular."""

from dataclasses import dataclass
from typing import Tuple

# Tipos de nodo
LITERAL = "literal"
EPSILON = "epsilon"
CONCAT = "concat"
UNION = "union"
ESTRELLA = "estrella"
MAS = "mas"
OPCIONAL = "opcional"


@dataclass(frozen=True)
class Nodo:
    tipo: str
    valor: str = ""
    hijos: Tuple["Nodo", ...] = ()

    def a_dict(self):
        """Representación serializable (JSON) del árbol."""
        return {
            "tipo": self.tipo,
            "valor": self.valor,
            "hijos": [h.a_dict() for h in self.hijos],
        }

    def alfabeto(self):
        """Conjunto de símbolos que aparecen en la expresión."""
        if self.tipo == LITERAL:
            return {self.valor}
        simbolos = set()
        for hijo in self.hijos:
            simbolos |= hijo.alfabeto()
        return simbolos
