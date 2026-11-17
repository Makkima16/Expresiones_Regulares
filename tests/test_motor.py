import itertools
import re
import unittest

from motor import Resultado, ErrorSintaxis

EXPRESIONES = [
    "a", "ab", "a|b", "a*", "a+", "a?", "(ab)*", "a*b", "a*b|c*|a",
    "(a|b)*abb", "((a|b)c)+d?", "(a(b|c)*)*", "a|", "(a|)b", "((a))", "(a*)*",
    "(ab|a)(bc|c)?", "a+b+", "(a|b)+(c|)",
]


def cadenas(alfabeto, largo_maximo):
    for n in range(largo_maximo + 1):
        for t in itertools.product(alfabeto, repeat=n):
            yield "".join(t)


class PruebasMotor(unittest.TestCase):
    def test_equivale_a_re_de_python(self):
        """AFN, AFD y AFD mínimo deben aceptar exactamente lo mismo que `re`."""
        for expresion in EXPRESIONES:
            r = Resultado(expresion)
            patron = re.compile(expresion)
            for cadena in cadenas("abcd", 5):
                esperado = patron.fullmatch(cadena) is not None
                with self.subTest(expresion=expresion, cadena=cadena):
                    self.assertEqual(r.afn.acepta(cadena), esperado)
                    self.assertEqual(r.afd.acepta(cadena), esperado)
                    self.assertEqual(r.minimo.acepta(cadena), esperado)

    def test_minimo_no_crece(self):
        for expresion in EXPRESIONES:
            r = Resultado(expresion)
            self.assertLessEqual(r.minimo.cantidad, r.afd.cantidad)

    def test_minimo_conocido(self):
        # (a|b)*abb tiene el AFD mínimo clásico de 4 estados
        self.assertEqual(Resultado("(a|b)*abb").minimo.cantidad, 4)
        self.assertEqual(Resultado("a*").minimo.cantidad, 1)

    def test_epsilon_y_escape(self):
        self.assertTrue(Resultado("ε").afn.acepta(""))
        self.assertTrue(Resultado(r"\*a").afn.acepta("*a"))
        self.assertFalse(Resultado(r"\*a").afn.acepta("a"))

    def test_espacios_se_ignoran(self):
        self.assertTrue(Resultado("a b | c").afn.acepta("ab"))

    def test_errores(self):
        casos = {"(a": 0, "a)": 1, "*a": 0, "a|*": 2, "a\\": 1, "   ": 0}
        for texto, posicion in casos.items():
            with self.subTest(texto=texto):
                with self.assertRaises(ErrorSintaxis) as ctx:
                    Resultado(texto)
                self.assertEqual(ctx.exception.posicion, posicion)

    def test_probar_devuelve_recorrido(self):
        r = Resultado("ab*").probar("abb")
        self.assertTrue(r["acepta"])
        self.assertTrue(r["coinciden"])
        self.assertEqual(len(r["afn"]["pasos"]), 4)
        rechazo = Resultado("ab*").probar("ba")
        self.assertFalse(rechazo["acepta"])


if __name__ == "__main__":
    unittest.main()
