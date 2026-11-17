"use strict";

/* ====================================================================
   Utilidades
   ==================================================================== */
const $ = (sel) => document.querySelector(sel);
const NS = "http://www.w3.org/2000/svg";
const RADIO = 24;

function el(tag, attrs = {}, padre = null, texto = null) {
  const nodo = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, v);
  if (texto !== null) nodo.textContent = texto;
  if (padre) padre.appendChild(nodo);
  return nodo;
}

function html(tag, props = {}, hijos = []) {
  const nodo = document.createElement(tag);
  Object.assign(nodo, props);
  hijos.forEach((h) => nodo.append(h));
  return nodo;
}

async function api(ruta, cuerpo) {
  const r = await fetch(ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return r.json();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ====================================================================
   Estado de la aplicación
   ==================================================================== */
const app = {
  datos: null,        // respuesta de /api/analizar
  pestana: "afn",
  prueba: null,       // respuesta de /api/probar
  cadena: "",
  tocada: false,      // el usuario ya escribió en el probador
  paso: 0,
  disposiciones: {},  // caché de layouts por pestaña
  t: { x: 0, y: 0, k: 1 },
  reproduciendo: null,
  ticket: 0,          // descarta respuestas viejas
};

const EJEMPLOS_REGEX = ["(a|b)*abb", "a*b|c*|a", "(ab)+c?", "((a|b)c)*d", "a(b|c)*a", "(0|1)*1(0|1)"];

/* ====================================================================
   Disposición (layout) de un grafo por capas
   ==================================================================== */
function disponerGrafo(g) {
  const salidas = new Map(g.estados.map((e) => [e.id, []]));
  g.aristas.forEach((a) => salidas.get(a.de).push(a.a));
  const inicial = g.estados.find((e) => e.inicial).id;

  // DFS: detecta aristas de retroceso y da un orden topológico
  const marca = new Map();
  const postorden = [];
  const atras = new Set();
  (function dfs(u) {
    marca.set(u, 1);
    for (const v of salidas.get(u)) {
      if (!marca.has(v)) dfs(v);
      else if (marca.get(v) === 1) atras.add(`${u}>${v}`);
    }
    marca.set(u, 2);
    postorden.push(u);
  })(inicial);
  g.estados.forEach((e) => { if (!marca.has(e.id)) { marca.set(e.id, 0); postorden.push(e.id); } });

  // Capas: camino más largo ignorando retrocesos
  const orden = [...postorden].reverse();
  const capa = new Map(orden.map((id) => [id, 0]));
  for (const u of orden) {
    for (const v of salidas.get(u)) {
      if (!atras.has(`${u}>${v}`) && u !== v) capa.set(v, Math.max(capa.get(v), capa.get(u) + 1));
    }
  }
  const entradas = new Map(g.estados.map((e) => [e.id, []]));
  g.aristas.forEach((a) => { if (!atras.has(`${a.de}>${a.a}`) && a.de !== a.a) entradas.get(a.a).push(a.de); });

  const columnas = [];
  orden.forEach((id) => (columnas[capa.get(id)] ||= []).push(id));
  const fila = new Map();
  columnas.forEach((col) => col.forEach((id, i) => fila.set(id, i - (col.length - 1) / 2)));

  // Reducir cruces: ordenar cada columna por el promedio de sus predecesores
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    for (let c = 1; c < columnas.length; c++) {
      const col = columnas[c];
      const clave = (id) => {
        const p = entradas.get(id);
        return p.length ? p.reduce((s, x) => s + fila.get(x), 0) / p.length : fila.get(id);
      };
      col.sort((a, b) => clave(a) - clave(b));
      col.forEach((id, i) => fila.set(id, i - (col.length - 1) / 2));
    }
  }

  const GAP_X = 130, GAP_Y = 96;
  const pos = new Map();
  g.estados.forEach((e) => pos.set(e.id, { x: capa.get(e.id) * GAP_X, y: fila.get(e.id) * GAP_Y, capa: capa.get(e.id) }));
  return { pos };
}

/* ====================================================================
   Dibujo de un autómata
   ==================================================================== */
function geometriaArista(a, b, bulto) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const mx = (a.x + b.x) / 2 + nx * bulto * 2;
  const my = (a.y + b.y) / 2 + ny * bulto * 2;
  const unit = (px, py, qx, qy) => { const l = Math.hypot(qx - px, qy - py) || 1; return [(qx - px) / l, (qy - py) / l]; };
  const [ux, uy] = unit(a.x, a.y, mx, my);
  const [vx, vy] = unit(b.x, b.y, mx, my);
  const s = { x: a.x + ux * RADIO, y: a.y + uy * RADIO };
  const e = { x: b.x + vx * (RADIO + 1), y: b.y + vy * (RADIO + 1) };
  return {
    d: `M${s.x},${s.y} Q${mx},${my} ${e.x},${e.y}`,
    lx: 0.25 * s.x + 0.5 * mx + 0.25 * e.x,
    ly: 0.25 * s.y + 0.5 * my + 0.25 * e.y,
  };
}

function dibujarGrafo(g, disp, activos, veredicto) {
  const mundo = $("#mundo");
  mundo.replaceChildren();
  const { pos } = disp;
  const existe = new Set(g.aristas.map((a) => `${a.de}>${a.a}`));

  const capaAristas = el("g", {}, mundo);
  const capaNodos = el("g", {}, mundo);
  const capaEtiquetas = el("g", {}, mundo);

  g.aristas.forEach((a) => {
    const p = pos.get(a.de), q = pos.get(a.a);
    const esEps = a.etiqueta.split(", ").every((t) => t === "ε");
    let d, lx, ly;
    if (a.de === a.a) {
      const y0 = p.y - Math.sqrt(RADIO * RADIO - 81);
      d = `M${p.x - 9},${y0} C${p.x - 30},${p.y - RADIO - 46} ${p.x + 30},${p.y - RADIO - 46} ${p.x + 9},${y0}`;
      lx = p.x; ly = p.y - RADIO - 36;
    } else {
      const salto = q.capa - p.capa;
      const inverso = existe.has(`${a.a}>${a.de}`);
      let bulto = 0;
      if (salto === 1) bulto = inverso ? 22 : 0;
      else if (salto > 1) bulto = 34 + 20 * (salto - 1);
      else if (salto === 0) bulto = 42;
      else bulto = 34 + 18 * Math.abs(salto);
      ({ d, lx, ly } = geometriaArista(p, q, bulto));
    }
    el("path", { d, class: "arista" + (esEps ? " eps" : "") }, capaAristas);
    el("text", { x: lx, y: ly, class: "etiqueta-arista" }, capaEtiquetas, a.etiqueta);
  });

  g.estados.forEach((e, i) => {
    const p = pos.get(e.id);
    const activo = activos && activos.has(e.id);
    let clase = "nodo" + (e.aceptacion ? " final" : "");
    if (activo) {
      clase += " activo";
      if (veredicto === true && e.aceptacion) clase += " bien";
      if (veredicto === false) clase += " mal";
    }
    const ext = el("g", { transform: `translate(${p.x},${p.y})` }, capaNodos);
    const nodo = el("g", { class: clase, style: `animation-delay:${Math.min(i * 25, 500)}ms` }, ext);
    el("circle", { r: RADIO, class: "cuerpo" }, nodo);
    if (e.aceptacion) el("circle", { r: RADIO - 5, class: "anillo" }, nodo);
    el("text", {}, nodo, e.etiqueta);
    const titulo = e.detalle ? `${e.etiqueta} = ${e.detalle}` : e.etiqueta;
    el("title", {}, nodo, titulo);
    if (e.inicial) {
      el("path", { d: `M${p.x - RADIO - 36},${p.y} L${p.x - RADIO - 1},${p.y}`, class: "entrada-flecha" }, capaAristas);
    }
  });
}

/* ====================================================================
   Dibujo del árbol sintáctico
   ==================================================================== */
const NOMBRES_NODO = {
  literal: "Símbolo", epsilon: "Cadena vacía ε", concat: "Concatenación",
  union: "Unión", estrella: "Cerradura de Kleene (0 o más)", mas: "Una o más repeticiones", opcional: "Opcional (0 o 1)",
};

function disponerArbol(raiz) {
  let hojas = 0;
  const nodos = [], aristas = [];
  (function recorrer(n, prof) {
    n.prof = prof;
    n.hijos.forEach((h) => recorrer(h, prof + 1));
    n.x = n.hijos.length ? (n.hijos[0].x + n.hijos[n.hijos.length - 1].x) / 2 : hojas++;
    nodos.push(n);
    n.hijos.forEach((h) => aristas.push([n, h]));
  })(raiz, 0);
  return { nodos, aristas };
}

function dibujarArbol(raiz) {
  const mundo = $("#mundo");
  mundo.replaceChildren();
  const { nodos, aristas } = disponerArbol(JSON.parse(JSON.stringify(raiz)));
  const GX = 74, GY = 86;
  const capaA = el("g", {}, mundo), capaN = el("g", {}, mundo);
  aristas.forEach(([p, h]) => {
    const x1 = p.x * GX, y1 = p.prof * GY + 20, x2 = h.x * GX, y2 = h.prof * GY - 20;
    const m = (y1 + y2) / 2;
    el("path", { d: `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`, class: "t-arista" }, capaA);
  });
  nodos
    .sort((a, b) => a.prof - b.prof)
    .forEach((n, i) => {
      const ext = el("g", { transform: `translate(${n.x * GX},${n.prof * GY})` }, capaN);
      const g = el("g", { class: `t-nodo t-${n.tipo}`, style: `animation-delay:${Math.min(i * 30, 600)}ms` }, ext);
      el("circle", { r: 20 }, g);
      el("text", {}, g, n.valor || "ε");
      el("title", {}, g, NOMBRES_NODO[n.tipo] || n.tipo);
    });
  return { nodos: nodos.map((n) => ({ x: n.x * GX, y: n.prof * GY })), profundidad: Math.max(...nodos.map((n) => n.prof)) + 1, cantidad: nodos.length };
}

/* ====================================================================
   Zoom y desplazamiento
   ==================================================================== */
function aplicarTransformacion() {
  const { x, y, k } = app.t;
  $("#mundo").setAttribute("transform", `translate(${x},${y}) scale(${k})`);
}

function ajustarVista(puntos) {
  const svg = $("#svg");
  const W = svg.clientWidth, H = svg.clientHeight;
  if (!puntos.length || !W) return;
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 60;
  const minY = Math.min(...ys) - 90, maxY = Math.max(...ys) + 90;
  const k = Math.min(W / (maxX - minX), H / (maxY - minY), 1.3);
  app.t = { k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (H - (maxY - minY) * k) / 2 - minY * k };
  aplicarTransformacion();
}

function zoomEn(factor, px, py) {
  const svg = $("#svg");
  if (px === undefined) { px = svg.clientWidth / 2; py = svg.clientHeight / 2; }
  const k = Math.min(3, Math.max(0.2, app.t.k * factor));
  const r = k / app.t.k;
  app.t = { k, x: px - (px - app.t.x) * r, y: py - (py - app.t.y) * r };
  aplicarTransformacion();
}

function iniciarInteraccion() {
  const svg = $("#svg");
  let arrastre = null;
  svg.addEventListener("pointerdown", (e) => {
    arrastre = { x: e.clientX, y: e.clientY, tx: app.t.x, ty: app.t.y };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("arrastrando");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    app.t.x = arrastre.tx + e.clientX - arrastre.x;
    app.t.y = arrastre.ty + e.clientY - arrastre.y;
    aplicarTransformacion();
  });
  const soltar = () => { arrastre = null; svg.classList.remove("arrastrando"); };
  svg.addEventListener("pointerup", soltar);
  svg.addEventListener("pointercancel", soltar);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomEn(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  $("#z-mas").onclick = () => zoomEn(1.25);
  $("#z-menos").onclick = () => zoomEn(0.8);
  $("#z-ajustar").onclick = () => ajustarVista(puntosActuales());
  window.addEventListener("resize", debounce(() => ajustarVista(puntosActuales()), 150));
}

/* ====================================================================
   Vista principal
   ==================================================================== */
let puntosVista = [];
const puntosActuales = () => puntosVista;

function nombreTraza() { return app.pestana === "arbol" ? "afn" : app.pestana; }

function pasoActual() {
  if (!app.prueba) return null;
  const pasos = app.prueba[nombreTraza()].pasos;
  return { pasos, paso: Math.min(app.paso, pasos.length - 1) };
}

function renderLeyenda() {
  const cont = $("#leyenda");
  cont.replaceChildren();
  const item = (svgHijo, texto) => {
    const s = el("svg", { viewBox: "-14 -14 28 28" });
    svgHijo(s);
    cont.append(html("span", { className: "item" }, [s, texto]));
  };
  if (app.pestana === "arbol") {
    [["literal", "Símbolo"], ["concat", "Concatenación"], ["union", "Unión"], ["estrella", "Repetición (* + ?)"], ["epsilon", "ε"]]
      .forEach(([tipo, texto]) => item((s) => { const g = el("g", { class: `t-nodo t-${tipo}`, style: "animation:none" }, s); el("circle", { r: 10 }, g); }, texto));
    return;
  }
  item((s) => { el("circle", { r: 10, fill: "none", stroke: "var(--acento)", "stroke-width": 2 }, s); }, "Estado");
  item((s) => { el("circle", { r: 10, fill: "none", stroke: "var(--acento-2)", "stroke-width": 2 }, s); el("circle", { r: 6, fill: "none", stroke: "var(--acento-2)", "stroke-width": 2 }, s); }, "Estado de aceptación");
  item((s) => { el("path", { d: "M-12,0 L12,0", stroke: "var(--trazo)", "stroke-width": 2, "stroke-dasharray": "4 3" }, s); }, "Transición ε");
  item((s) => { el("circle", { r: 10, fill: "var(--aviso)", opacity: .55, stroke: "var(--aviso)", "stroke-width": 2 }, s); }, "Estado activo en la prueba");
}

function renderResumen() {
  const cont = $("#resumen");
  cont.replaceChildren();
  const d = app.datos;
  if (!d) return;
  const chip = (txt, n) => cont.append(html("span", {}, [txt + " ", html("b", { textContent: n })]));
  if (app.pestana === "arbol") {
    chip("Nodos", puntosVista.length);
    return;
  }
  const g = d[app.pestana];
  chip("Estados", g.estados.length);
  chip("Transiciones", g.aristas.length);
}

function renderVista() {
  const d = app.datos;
  $("#vacio").hidden = !!d;
  if (!d) { $("#mundo").replaceChildren(); puntosVista = []; renderResumen(); renderLeyenda(); return; }

  const reajustar = !app.disposiciones[app.pestana];
  if (app.pestana === "arbol") {
    const info = dibujarArbol(d.arbol);
    app.disposiciones.arbol = true;
    puntosVista = info.nodos;
  } else {
    const g = d[app.pestana];
    const disp = app.disposiciones[app.pestana] || (app.disposiciones[app.pestana] = disponerGrafo(g));
    const ps = pasoActual();
    let activos = null, veredicto = null;
    if (ps && app.tocada) {
      activos = new Set(ps.pasos[ps.paso].activos);
      if (ps.paso === ps.pasos.length - 1) veredicto = app.prueba.acepta;
    }
    dibujarGrafo(g, disp, activos, veredicto);
    puntosVista = [...disp.pos.values()];
  }
  if (reajustar || app.pestana === "arbol") ajustarVista(puntosVista); else aplicarTransformacion();
  renderResumen();
  renderLeyenda();
}

/* Cuando solo cambia el paso, se redibuja sin reencuadrar */
function renderPaso() {
  const d = app.datos;
  if (d && app.pestana !== "arbol") {
    const g = d[app.pestana];
    const ps = pasoActual();
    let activos = null, veredicto = null;
    if (ps && app.tocada) {
      activos = new Set(ps.pasos[ps.paso].activos);
      if (ps.paso === ps.pasos.length - 1) veredicto = app.prueba.acepta;
    }
    dibujarGrafo(g, app.disposiciones[app.pestana], activos, veredicto);
    // evita reiniciar la animación de entrada en cada paso
    document.querySelectorAll("#mundo .nodo").forEach((n) => (n.style.animation = "none"));
  }
  renderProbador();
}

/* ====================================================================
   Probador de cadenas
   ==================================================================== */
function textoActivos(ids) {
  return ids.length ? "{" + ids.map((i) => `q${i}`).join(", ") + "}" : "∅";
}

function renderProbador() {
  const ver = $("#veredicto");
  const letras = $("#letras");
  letras.replaceChildren();
  const botones = ["#p-inicio", "#p-atras", "#p-play", "#p-sig", "#p-fin"].map((s) => $(s));

  if (!app.datos || !app.prueba || !app.tocada) {
    ver.className = "veredicto neutro";
    ver.textContent = app.datos ? "Sin probar" : "Sin autómata";
    botones.forEach((b) => (b.disabled = true));
    $("#explicacion").textContent = "Elige o escribe una cadena para seguir su recorrido paso a paso sobre el autómata de la pestaña activa.";
    return;
  }

  const ps = pasoActual();
  const ultimo = ps.pasos.length - 1;
  const p = ps.paso;
  const acepta = app.prueba.acepta;
  ver.className = "veredicto " + (acepta ? "bien" : "mal");
  ver.textContent = (acepta ? "✔ Cadena aceptada" : "✘ Cadena rechazada") + (app.prueba.coinciden ? "" : " · ⚠ los autómatas no coinciden");

  if (app.cadena === "") letras.append(html("span", { className: "letra epsilon leida", textContent: "ε" }));
  [...app.cadena].forEach((c, i) => {
    letras.append(html("span", { className: "letra" + (i < p ? " leida" : "") + (i === p - 1 ? " actual" : ""), textContent: c }));
  });

  botones[0].disabled = botones[1].disabled = p === 0;
  botones[3].disabled = botones[4].disabled = p === ultimo;
  botones[2].disabled = false;
  botones[2].textContent = app.reproduciendo ? "⏸" : "▶";

  // explicación del paso
  const expl = $("#explicacion");
  expl.replaceChildren();
  const paso = ps.pasos[p];
  const esAFN = nombreTraza() === "afn";
  const b = (t) => html("b", { textContent: t });
  if (p === 0) {
    expl.append(...(esAFN ? ["Inicio: estado inicial más su cierre‑ε → ", b(textoActivos(paso.activos))] : ["Inicio en ", b("q0")]));
  } else if (esAFN) {
    expl.append("Se lee «", b(paso.simbolo), "»: mover y aplicar cierre‑ε → ", b(textoActivos(paso.activos)));
    if (!paso.activos.length) expl.append(" Ningún estado puede continuar.");
  } else if (paso.activos.length) {
    expl.append("Se lee «", b(paso.simbolo), "»: δ(", b(`q${ps.pasos[p - 1].activos[0]}`), ", ", b(paso.simbolo), ") = ", b(`q${paso.activos[0]}`));
  } else {
    expl.append("No hay transición para «", b(paso.simbolo), "» desde ", b(`q${ps.pasos[p - 1].activos[0]}`), ".");
  }
  if (p === ultimo) {
    expl.append(" " + (acepta ? "Fin: se llegó a un estado de aceptación ✔" : "Fin: no se alcanzó un estado de aceptación ✘"));
  }
}

function renderDatos() {
  const dl = $("#datos");
  dl.replaceChildren();
  const d = app.datos;
  const fila = (k, v, clase = "") => { dl.append(html("dt", { textContent: k }), html("dd", { textContent: v, className: clase })); };
  if (!d) { fila("Estado", "—"); return; }
  fila("Alfabeto", "{" + d.alfabeto.join(", ") + "}");
  fila("Estados AFN", d.afn.estados.length);
  fila("Estados AFD", d.afd.estados.length);
  fila("Estados mínimo", d.minimo.estados.length);
  if (app.prueba && app.tocada) fila("Los 3 coinciden", app.prueba.coinciden ? "sí ✔" : "no ✘", app.prueba.coinciden ? "bien" : "");
}

function renderEjemplosCadena() {
  const cont = $("#ejemplos-cadena");
  cont.replaceChildren();
  if (!app.datos) return;
  const { aceptadas, rechazadas } = app.datos.ejemplos;
  const poner = (lista, clase) => lista.forEach((c) => {
    cont.append(html("button", { className: `chip ${clase}`, textContent: c === "" ? "ε" : c, title: clase === "ok" ? "Aceptada" : "Rechazada", onclick: () => { $("#cadena").value = c; alProbar(); } }));
  });
  poner(aceptadas.slice(0, 5), "ok");
  poner(rechazadas, "no");
}

/* ====================================================================
   Flujo de datos
   ==================================================================== */
function mostrarError(res, texto) {
  const caja = $("#error");
  const campo = $("#regex").closest(".campo");
  if (!res) { caja.hidden = true; campo.classList.remove("error-campo"); return; }
  caja.hidden = false;
  campo.classList.add("error-campo");
  caja.replaceChildren(`Posición ${res.posicion + 1}: ${res.error}`);
  if (res.posicion !== undefined && texto) {
    caja.append(html("code", { textContent: texto + "\n" + " ".repeat(Math.min(res.posicion, texto.length)) + "^" }));
  }
}

const analizar = async () => {
  const texto = $("#regex").value;
  const ticket = ++app.ticket;
  const res = await api("/api/analizar", { regex: texto });
  if (ticket !== app.ticket) return;
  if (!res.ok) {
    // se conserva el último autómata válido mientras se corrige el error
    mostrarError(res, texto);
    return;
  }
  mostrarError(null);
  app.datos = res;
  app.disposiciones = {};
  app.prueba = null;
  app.paso = 0;
  detener();
  renderEjemplosCadena();
  renderVista();
  await probar();
  renderDatos();
};

async function probar() {
  if (!app.datos) return;
  const ticket = ++app.ticket;
  const res = await api("/api/probar", { regex: $("#regex").value, cadena: app.cadena });
  if (ticket !== app.ticket) return;
  app.prueba = res.ok ? res : null;
  app.paso = 0;
  detener();
  renderPaso();
  renderDatos();
}

function alProbar() {
  app.tocada = true;
  app.cadena = $("#cadena").value;
  probar();
}

/* ====================================================================
   Reproducción paso a paso
   ==================================================================== */
function detener() { if (app.reproduciendo) { clearInterval(app.reproduciendo); app.reproduciendo = null; } }

function irA(n) {
  const ps = pasoActual();
  if (!ps) return;
  app.paso = Math.max(0, Math.min(n, ps.pasos.length - 1));
  renderPaso();
}

function alternarReproduccion() {
  if (app.reproduciendo) { detener(); renderProbador(); return; }
  const ps = pasoActual();
  if (!ps) return;
  if (ps.paso >= ps.pasos.length - 1) app.paso = 0;
  app.reproduciendo = setInterval(() => {
    const act = pasoActual();
    if (act.paso >= act.pasos.length - 1) { detener(); renderPaso(); return; }
    app.paso = act.paso + 1;
    renderPaso();
  }, 750);
  renderPaso();
}

/* ====================================================================
   Inicio
   ==================================================================== */
function insertarEnRegex(texto) {
  const campo = $("#regex");
  const ini = campo.selectionStart ?? campo.value.length, fin = campo.selectionEnd ?? ini;
  campo.setRangeText(texto, ini, fin, "end");
  if (texto === "()") campo.setSelectionRange(ini + 1, ini + 1);
  campo.focus();
  campo.dispatchEvent(new Event("input"));
}

function iniciarTema() {
  let guardado = null;
  try { guardado = localStorage.getItem("tema"); } catch (_) { /* sin almacenamiento */ }
  const tema = guardado || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = tema;
  $("#tema").onclick = () => {
    const nuevo = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem("tema", nuevo); } catch (_) { /* ignorar */ }
  };
}

function iniciar() {
  iniciarTema();
  iniciarInteraccion();

  const ej = $("#ejemplos-regex");
  ej.append(html("span", { className: "etiqueta", textContent: "Ejemplos:" }));
  EJEMPLOS_REGEX.forEach((r) => ej.append(html("button", { className: "chip", textContent: r, onclick: () => { $("#regex").value = r; analizar(); } })));

  document.querySelectorAll("[data-ins]").forEach((b) => (b.onclick = () => insertarEnRegex(b.dataset.ins)));
  document.querySelectorAll("[data-vista]").forEach((b) => (b.onclick = () => {
    document.querySelectorAll("[data-vista]").forEach((x) => x.classList.toggle("activa", x === b));
    app.pestana = b.dataset.vista;
    renderVista();
    renderProbador();
  }));

  $("#regex").addEventListener("input", debounce(analizar, 220));
  $("#cadena").addEventListener("input", debounce(alProbar, 120));
  $("#p-inicio").onclick = () => { detener(); irA(0); };
  $("#p-atras").onclick = () => { detener(); irA(app.paso - 1); };
  $("#p-sig").onclick = () => { detener(); irA(app.paso + 1); };
  $("#p-fin").onclick = () => { detener(); irA(Infinity); };
  $("#p-play").onclick = alternarReproduccion;

  renderProbador();
  renderDatos();
  analizar();
}

iniciar();
