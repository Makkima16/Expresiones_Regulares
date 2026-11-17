"""Analizador sintáctico recursivo descendente para expresiones regulares.

Gramática (de menor a mayor precedencia):

    expresion     := concatenacion ('|' concatenacion)*
    concatenacion := repeticion*                 (vacía = ε)
    repeticion    := atomo ('*' | '+' | '?')*
    atomo         := '(' expresion ')' | '\\' simbolo | 'ε' | simbolo

Cada regla es una función que se llama a sí misma a través de las demás;
los paréntesis anidados funcionan porque `atomo` vuelve a invocar a
`expresion`. Los espacios en blanco se ignoran.
"""

from .arbol import Nodo, LITERAL, EPSILON, CONCAT, UNION, ESTRELLA, MAS, OPCIONAL

MAX_LONGITUD = 200
OPERADORES = "*+?"
ESPECIALES = "|()*+?\\"


class ErrorSintaxis(ValueError):
    """Error de sintaxis con la posición (base 0) donde ocurrió."""

    def __init__(self, mensaje, posicion):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.posicion = posicion


class _Analizador:
    def __init__(self, texto):
        self.texto = texto
        self.pos = 0

    def _mirar(self):
        return self.texto[self.pos] if self.pos < len(self.texto) else ""

    def analizar(self):
        nodo = self._expresion()
        if self.pos < len(self.texto):  # solo puede quedar un ')' suelto
            raise ErrorSintaxis("Paréntesis de cierre sin su apertura", self.pos)
        return nodo

    def _expresion(self):
        nodo = self._concatenacion()
        while self._mirar() == "|":
            self.pos += 1
            nodo = Nodo(UNION, "|", (nodo, self._concatenacion()))
        return nodo

    def _concatenacion(self):
        partes = []
        while self._mirar() not in ("", "|", ")"):
            partes.append(self._repeticion())
        if not partes:
            return Nodo(EPSILON, "ε")
        nodo = partes[0]
        for parte in partes[1:]:
            nodo = Nodo(CONCAT, "·", (nodo, parte))
        return nodo

    def _repeticion(self):
        nodo = self._atomo()
        while self._mirar() in tuple(OPERADORES):
            op = self.texto[self.pos]
            self.pos += 1
            tipo = {"*": ESTRELLA, "+": MAS, "?": OPCIONAL}[op]
            nodo = Nodo(tipo, op, (nodo,))
        return nodo

    def _atomo(self):
        c = self._mirar()
        if c == "(":
            apertura = self.pos
            self.pos += 1
            nodo = self._expresion()
            if self._mirar() != ")":
                raise ErrorSintaxis("Falta cerrar este paréntesis", apertura)
            self.pos += 1
            return nodo
        if c in tuple(OPERADORES):
            raise ErrorSintaxis(f"El operador '{c}' no tiene nada que repetir", self.pos)
        if c == "\\":
            if self.pos + 1 >= len(self.texto):
                raise ErrorSintaxis("Una barra invertida debe ir seguida de un símbolo", self.pos)
            simbolo = self.texto[self.pos + 1]
            self.pos += 2
            return Nodo(LITERAL, simbolo)
        self.pos += 1
        if c == "ε":
            return Nodo(EPSILON, "ε")
        return Nodo(LITERAL, c)


def analizar(texto):
    """Convierte el texto en un árbol sintáctico o lanza ErrorSintaxis."""
    if len(texto) > MAX_LONGITUD:
        raise ErrorSintaxis(f"La expresión supera {MAX_LONGITUD} caracteres", MAX_LONGITUD)
    # Se quitan espacios recordando la posición original para los errores.
    limpio, mapa = [], []
    for i, c in enumerate(texto):
        if not c.isspace():
            limpio.append(c)
            mapa.append(i)
    if not limpio:
        raise ErrorSintaxis("Escribe una expresión regular", 0)
    try:
        return _Analizador("".join(limpio)).analizar()
    except ErrorSintaxis as e:
        pos = mapa[e.posicion] if e.posicion < len(mapa) else len(texto)
        raise ErrorSintaxis(e.mensaje, pos) from None
