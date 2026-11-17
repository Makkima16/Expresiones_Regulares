# Expresiones regulares y autómatas

Aplicación web local que convierte una expresión regular en sus autómatas equivalentes y permite probar cadenas paso a paso. Muestra cuatro vistas:

1. **Árbol sintáctico** de la expresión.
2. **AFN con transiciones ε** (construcción de Thompson).
3. **AFD** (construcción por subconjuntos).
4. **AFD mínimo** (refinamiento de particiones).

## Requisitos

Python 3.8 o superior y un navegador. No requiere dependencias externas ni Graphviz: el servidor usa solo la biblioteca estándar y los diagramas se dibujan en SVG dentro del navegador.

## Uso

```bash
python3 main.py                  # abre http://127.0.0.1:8000 en el navegador
python3 main.py --puerto 9000    # usa otro puerto (si está ocupado, busca el siguiente libre)
python3 main.py --sin-navegador  # solo levanta el servidor
```

Con la aplicación abierta:

- Escribe la expresión en el campo superior; el autómata se actualiza solo. Los botones `| * + ? ( ) ε` insertan operadores y los chips ofrecen ejemplos.
- En **Probar una cadena** escribe o elige una cadena de ejemplo (verde = aceptada, rojo = rechazada). Usa los controles ⏮ ◀ ▶ ▶| ⏭ para recorrerla paso a paso; los estados activos se resaltan en el diagrama de la pestaña seleccionada.
- Rueda del ratón o botones `+` `−` para el zoom, arrastrar para desplazar y `⤢` para ajustar a la ventana.
- El botón ☾ cambia entre tema oscuro y claro.

## Sintaxis soportada

| Elemento | Significado |
|----------|-------------|
| `ab` | concatenación |
| `a\|b` | unión |
| `a*` · `a+` · `a?` | 0 o más · 1 o más · 0 o 1 repeticiones |
| `( )` | agrupación, con anidamiento |
| `ε` | cadena vacía; una alternativa vacía como `(a\|)` también equivale a ε |
| `\*` | la barra invertida escapa un símbolo especial |

Los espacios se ignoran. Precedencia, de mayor a menor: repetición, concatenación, unión.

## Cómo funciona

### 1. Análisis sintáctico (`motor/analizador.py`)

Analizador recursivo descendente con una función por regla de la gramática:

```
expresion     := concatenacion ('|' concatenacion)*
concatenacion := repeticion*
repeticion    := atomo ('*' | '+' | '?')*
atomo         := '(' expresion ')' | '\' simbolo | 'ε' | simbolo
```

La recursión está en `atomo`, que vuelve a llamar a `expresion` al encontrar un paréntesis; por eso los grupos anidados funcionan. Los errores (paréntesis sin cerrar, operador sin operando, etc.) se informan con su posición.

### 2. AFN de Thompson (`motor/afn.py`)

Cada nodo del árbol se convierte, también de forma recursiva, en un fragmento con un estado inicial y uno final, y los fragmentos se enlazan con transiciones ε. El resultado siempre tiene un único estado de aceptación. La simulación calcula el cierre‑ε y avanza con el conjunto de estados activos.

### 3. Subconjuntos (`motor/afd.py`)

Cada estado del AFD es un conjunto de estados del AFN (se ve al pasar el cursor sobre el estado). No se incluye el estado muerto, así que el AFD es parcial. Si supera 400 estados se aborta con un mensaje claro.

### 4. Minimización (`motor/afd.py`)

Algoritmo de Moore: se parte de aceptación/no aceptación y se refina hasta que ningún par de estados de una misma clase se distinga. Se descartan los estados muertos y se renumera desde el inicial.

### 5. Dibujo (`web/app.js`)

Diseño por capas: se detectan aristas de retroceso con una búsqueda en profundidad, cada estado se ubica en la capa de su camino más largo desde el inicial y se ordenan las columnas para reducir cruces. Las aristas son curvas cuadráticas, y los bucles y retrocesos se curvan para no solaparse.

## Estructura

```
main.py          punto de entrada (argumentos de línea de comandos)
servidor.py      servidor HTTP local y API JSON
motor/
  arbol.py       nodos del árbol sintáctico
  analizador.py  analizador recursivo descendente
  afn.py         AFN de Thompson y simulación
  afd.py         subconjuntos, minimización y simulación
  __init__.py    clase Resultado que une todas las etapas
web/             interfaz: index.html, estilos.css, app.js
tests/           pruebas con unittest
```

## API

El servidor solo escucha en `127.0.0.1` y solo sirve archivos de `web/`.

| Método y ruta | Cuerpo | Respuesta |
|---------------|--------|-----------|
| `POST /api/analizar` | `{"regex": "(a\|b)*abb"}` | árbol, alfabeto, AFN, AFD, AFD mínimo y cadenas de ejemplo; o `{"ok": false, "error", "posicion"}` |
| `POST /api/probar` | `{"regex": "...", "cadena": "abb"}` | veredicto y recorrido paso a paso en los tres autómatas |

Límites: expresión de hasta 200 caracteres y cadena de hasta 1000.

## Pruebas

```bash
python3 -m unittest discover -s tests -t .
```

Las pruebas comparan el AFN, el AFD y el AFD mínimo contra el módulo `re` de Python con todas las cadenas de hasta 5 símbolos para 19 expresiones. También verifican que `(a|b)*abb` tenga un AFD mínimo de 4 estados, el manejo de ε, del escape y de los espacios, y las posiciones de los errores de sintaxis.

## Limitaciones

- No se soportan clases de caracteres (`[a-z]`), cuantificadores con llaves (`a{2,3}`), anclas ni grupos de captura: solo el núcleo teórico de las expresiones regulares.
- En expresiones muy grandes el diseño por capas puede cruzar aristas largas.
