/* Cálculo y presentación de los macros de un plan de alimentación.

   Este módulo no conoce el DOM ni llama a la API. Lo usan la pantalla del
   entrenador y la del atleta, y mantenerlo aislado permite comprobar la
   aritmética sin crear datos temporales en PostgreSQL.

   Los macros del alimento vienen POR PORCIÓN, y la porción la define el
   propio alimento (`servingSize` + `servingUnit`). La cantidad del renglón
   está expresada en esa misma unidad, así que el factor de escala es
   `quantity / servingSize`: 150 g de un alimento medido por 100 g son 1,5
   porciones; 3 unidades de uno medido por 1 unidad son 3. */

export const MACROS = ['calories', 'proteinG', 'carbsG', 'fatsG', 'fiberG'];

/* PostgreSQL devuelve los NUMERIC como texto, porque no siempre caben en un
   número de JavaScript. Todo lo que llega de la API pasa por aquí. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/* Los macros de un renglón, ya escalados a su cantidad.

   Devuelve `null` cuando no hay nada que calcular: un texto libre no tiene
   macros, y un alimento sin porción válida tampoco se puede escalar. Un macro
   concreto sin dato se queda en `null` y no en cero, porque cero es un valor
   legítimo y sumarlo como si lo fuera falsearía el total. */
export function itemMacros(item) {
  if (!item?.foodId) return null;

  const quantity = toNumber(item.quantity);
  const serving = toNumber(item.servingSize);
  if (quantity === null || serving === null || serving === 0) return null;

  const factor = quantity / serving;
  const scaled = {};
  for (const macro of MACROS) {
    const value = toNumber(item[macro]);
    scaled[macro] = value === null ? null : value * factor;
  }
  return scaled;
}

/* Suma una lista de renglones.

   `incomplete` avisa de que en la suma falta algo: un texto libre, un
   alimento sin datos o un macro concreto sin valor. Sin esa bandera la
   pantalla mostraría "1.200 kcal" con la misma seguridad tanto si están
   contados todos los renglones como si solo la mitad, que es mentir. */
export function sumItems(items = []) {
  const total = Object.fromEntries(MACROS.map((macro) => [macro, 0]));
  let incomplete = false;

  for (const item of items) {
    const macros = itemMacros(item);
    if (!macros) {
      incomplete = true;
      continue;
    }
    for (const macro of MACROS) {
      if (macros[macro] === null) incomplete = true;
      else total[macro] += macros[macro];
    }
  }

  return { ...total, incomplete };
}

export function mealMacros(meal) {
  return sumItems(meal?.items ?? []);
}

/* El total del día es la suma de sus comidas. Se recorren los renglones de
   todas a la vez en lugar de sumar los totales de cada comida, para que la
   bandera de incompleto no haya que ir juntándola a mano. */
export function dayMacros(day) {
  if (!day || day.day_type === 'free') return { ...sumItems([]), incomplete: false };
  return sumItems((day.meals ?? []).flatMap((meal) => meal.items ?? []));
}

/* ---------- Presentación ---------- */

/* Los gramos y mililitros no se pluralizan; el resto sí. Escribir
   "3 unidad" o "2 porción" se lee como un error de la aplicación. */
const PLURALES = {
  unidad: 'unidades',
  taza: 'tazas',
  cucharada: 'cucharadas',
  rebanada: 'rebanadas',
  porción: 'porciones',
};

export function formatUnit(unit, quantity) {
  return Number(quantity) === 1 ? unit : (PLURALES[unit] ?? unit);
}

/* Las cantidades se redondean a un decimal y se les quita el ".0": nadie
   escribe "150,0 g". */
export function formatAmount(value) {
  const number = toNumber(value);
  if (number === null) return '';
  return String(Math.round(number * 10) / 10);
}

/* "150 g", "3 unidades". El texto libre se devuelve tal cual. */
export function formatQuantity(item) {
  if (!item?.foodId) return '';
  const amount = formatAmount(item.quantity);
  return `${amount} ${formatUnit(item.servingUnit, item.quantity)}`;
}

/* Un macro para mostrar. Sin dato devuelve una raya, no un cero. */
export function formatMacro(value, decimals = 0) {
  const number = toNumber(value);
  if (number === null) return '—';
  const factor = 10 ** decimals;
  return String(Math.round(number * factor) / factor);
}

/* Cuánto se ha cubierto del objetivo diario, para la barra de progreso.
   Sin objetivo no hay porcentaje que enseñar. */
export function goalProgress(total, goal) {
  const objetivo = toNumber(goal);
  if (objetivo === null || objetivo === 0) return null;
  return Math.round((toNumber(total) ?? 0) * 100) / 100 / objetivo;
}
