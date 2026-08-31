/* Convierte un plan de alimentación existente en el borrador de uno nuevo.

   Este módulo no conoce el DOM ni llama a la API, igual que `rutina-copia.js`.
   Mantener la transformación aislada permite comprobar que una copia conserva
   el plan entero sin crear datos temporales en PostgreSQL. */

const DAYS_PER_WEEK = 7;
const COPY_SUFFIX = ' (copia)';
const MAX_NAME_LENGTH = 140;

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* La semana nace con el primer día planificado y los otros seis libres, para
   que el entrenador marque únicamente lo que sí planifica. */
export function emptyDay(index) {
  return {
    name: `Día ${index + 1}`,
    dayType: index === 0 ? 'planned' : 'free',
    mirrorsDayOrder: null,
    notes: '',
    meals: [],
  };
}

export function emptyWeek() {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => emptyDay(index));
}

/* Se conservan los datos del alimento —nombre, porción y macros— además de su
   identificador. El borrador tiene que poder dibujarse y sumar sin volver a
   consultar la biblioteca, y un alimento desactivado ya no vendría en ella. */
function copyItem(item) {
  return {
    foodId: item.foodId ?? null,
    quantity: item.quantity ?? null,
    freeText: item.freeText ?? '',
    notes: item.notes || '',
    name: item.name ?? '',
    category: item.category ?? '',
    isActive: item.isActive ?? true,
    servingSize: item.servingSize ?? null,
    servingUnit: item.servingUnit ?? 'g',
    calories: item.calories ?? null,
    proteinG: item.proteinG ?? null,
    carbsG: item.carbsG ?? null,
    fatsG: item.fatsG ?? null,
    fiberG: item.fiberG ?? null,
  };
}

function copyMeal(meal) {
  return {
    name: meal.name,
    details: meal.details || '',
    items: (meal.items || []).map(copyItem),
  };
}

function copyDay(day) {
  return {
    name: day.name,
    dayType: day.day_type || 'planned',
    mirrorsDayOrder: day.mirrors_day_order ?? null,
    notes: day.notes || '',
    meals: (day.meals || []).map(copyMeal),
  };
}

/* El sufijo no se acumula: copiar una copia sigue diciendo "(copia)" una vez
   en lugar de "(copia) (copia) (copia)". */
export function copiedPlanName(name) {
  const base = String(name || 'Plan').replace(/ \(copia\)$/, '');
  return `${base.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

export function planCopyDraft(plan, today = new Date()) {
  const week = emptyWeek();

  for (const day of plan.days || []) {
    const index = Number(day.day_order) - 1;
    if (index >= 0 && index < DAYS_PER_WEEK) week[index] = copyDay(day);
  }

  return {
    name: copiedPlanName(plan.name),
    athleteId: plan.athlete_id || '',
    description: plan.description || '',
    /* La copia empieza hoy, no el día que empezó el original: se está
       asignando ahora. La fecha se puede cambiar antes de guardar. */
    startDate: localDate(today),
    weeks: plan.weeks || 1,
    calories: plan.calories ?? '',
    proteinG: plan.protein_g ?? '',
    carbsG: plan.carbs_g ?? '',
    fatsG: plan.fats_g ?? '',
    fiberG: plan.fiber_g ?? '',
    waterMl: plan.water_ml ?? '',
    week,
  };
}
