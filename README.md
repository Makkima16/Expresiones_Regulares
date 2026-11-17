# Expresiones regulares y autómatas

Convierte una expresión regular en su autómata y lo muestra en el navegador:

1. **Árbol sintáctico** (analizador recursivo descendente).
2. **AFN con transiciones ε** (construcción de Thompson).
3. **AFD** (construcción por subconjuntos).
4. **AFD mínimo** (refinamiento de particiones).

Además permite probar cadenas y seguir su recorrido paso a paso sobre cada autómata.

## Requisitos

Solo Python 3.8 o superior. No se necesitan dependencias externas ni Graphviz:
el servidor usa la biblioteca estándar y el dibujo se hace en SVG dentro del navegador.

## Uso

```bash
python3 main.py                  # abre http://127.0.0.1:8000 en el navegador
python3 main.py --puerto 9000    # otro puerto
python3 main.py --sin-navegador  # solo levanta el servidor
```

## Sintaxis soportada

| Elemento | Significado |
|----------|-------------|
| `ab`     | concatenación |
| `a\|b`   | unión |
| `a*`, `a+`, `a?` | 0 o más, 1 o más, 0 o 1 |
| `( )`    | agrupación (se puede anidar) |
| `ε`      | cadena vacía (también una alternativa vacía, como `(a\|)`) |
| `\*`     | escapa un símbolo especial |

Los espacios se ignoran.

## Estructura

```
main.py          punto de entrada
servidor.py      servidor HTTP local y API JSON (/api/analizar, /api/probar)
motor/           lógica: analizador.py, arbol.py, afn.py, afd.py
web/             interfaz: index.html, estilos.css, app.js
tests/           pruebas con unittest
```

## Pruebas

```bash
python3 -m unittest discover -s tests -t .
```

Las pruebas comparan el AFN, el AFD y el AFD mínimo contra el módulo `re` de Python
sobre todas las cadenas de hasta 5 símbolos para varias expresiones.
