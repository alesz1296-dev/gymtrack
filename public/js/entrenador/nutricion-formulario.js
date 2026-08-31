/* Constructor de planes de alimentación semanales.

   La semana tiene siempre siete franjas. Cada una puede tener plan o ser un
   día libre, y un día con plan puede repetir a otro anterior en vez de
   escribir sus comidas otra vez.

   Un día tiene comidas y una comida tiene renglones, así que hay un nivel más
   que en el constructor de rutinas. Cada renglón es un alimento de la
   biblioteca con su cantidad, o un texto libre para lo que no merece la pena
   catalogar.

   Igual que en las rutinas, el estado vive en JavaScript y no en el DOM: solo
   se dibuja el día seleccionado, así que los otros seis no existen en
   pantalla y no se podrían leer al guardar. El DOM se vuelca al estado con
   `captureCurrentDay()` antes de cualquier redibujado. */

import { initNavigation } from '../comun/navigation.js';
import { api, formData, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { icon } from '../comun/icons.js';
import { planCopyDraft, emptyWeek } from '../comun/plan-copia.js';
import {
  dayMacros,
  mealMacros,
  itemMacros,
  formatMacro,
  formatUnit,
} from '../comun/nutricion-macros.js';

await initNavigation();

const WEEK_PRESETS = [1, 4, 6, 8];
const GOAL_FIELDS = ['calories', 'proteinG', 'carbsG', 'fatsG', 'fiberG', 'waterMl'];

const parameters = new URLSearchParams(location.search);
const planId = parameters.get('id');
/* `id` siempre gana si alguien construye una URL con ambos parámetros: una
   pantalla nunca puede modificar y duplicar al mismo tiempo. */
const sourcePlanId = planId ? null : parameters.get('duplicar');

const form = document.querySelector('#plan');
const message = document.querySelector('#message');
const tabs = document.querySelector('#day-tabs');
const editor = document.querySelector('#day-editor');
const weeksOptions = document.querySelector('#weeks-options');
const weeksInput = document.querySelector('#weeks');

const [{ people }, { foods }] = await Promise.all([
  api('/api/links/people'),
  api('/api/nutrition/foods'),
]);

document.querySelector('#athlete').innerHTML =
  '<option value="">Seleccionar</option>' +
  people
    .map(
      (person) =>
        `<option value="${person.id}">${escapeHtml(person.first_name)} ${escapeHtml(person.last_name)}</option>`,
    )
    .join('');

/* La biblioteca llega en el formato de la base y los renglones de un plan en
   el de la API. Se traduce al elegir un alimento para que el estado tenga una
   sola forma y los macros se puedan sumar sin preguntar de dónde viene. */
function itemFromLibrary(food, quantity) {
  return {
    foodId: food.id,
    quantity,
    freeText: '',
    notes: '',
    name: food.name,
    category: food.category ?? '',
    isActive: food.is_active ?? true,
    servingSize: food.serving_size,
    servingUnit: food.serving_unit,
    calories: food.calories,
    proteinG: food.protein_g,
    carbsG: food.carbs_g,
    fatsG: food.fats_g,
    fiberG: food.fiber_g,
  };
}

/* ---------- Estado de la semana ---------- */

let week = emptyWeek();
let selectedDay = 1;

const DAY_TYPES = [
  { value: 'planned', label: 'Con plan' },
  { value: 'free', label: 'Día libre' },
];

/* Las comidas que le tocan de verdad a una franja: un día espejo muestra las
   del día que repite, y un día libre no tiene ninguna. */
function effectiveMeals(day) {
  if (day.dayType !== 'planned') return [];
  if (day.mirrorsDayOrder == null) return day.meals;
  return week[day.mirrorsDayOrder - 1].meals;
}

/* Solo se puede repetir un día con plan anterior que tenga comidas propias.
   Encadenar espejos complicaría la pantalla sin aportar nada. */
function mirrorCandidates(dayOrder) {
  return week
    .map((day, index) => ({ day, order: index + 1 }))
    .filter(
      (item) =>
        item.order < dayOrder && item.day.dayType === 'planned' && item.day.mirrorsDayOrder == null,
    );
}

/* ---------- Volcado del DOM al estado ---------- */

function readItem(row) {
  const value = (name) => row.querySelector(`[data-name="${name}"]`)?.value ?? '';

  if (row.dataset.kind === 'text')
    return {
      foodId: null,
      quantity: null,
      freeText: value('freeText'),
      notes: '',
    };

  const food = foods.find((item) => item.id === value('foodId'));
  const quantity = Number(value('quantity'));

  /* Si el alimento ya no está en la biblioteca —lo desactivaron después de
     armar el plan— se conserva lo que el renglón traía, para no vaciarlo al
     guardar sin que el entrenador se entere. */
  if (!food) return { ...(row.itemSnapshot ?? {}), quantity };
  return itemFromLibrary(food, quantity);
}

function readMeal(block) {
  return {
    name: block.querySelector('[data-name="mealName"]').value,
    details: block.querySelector('[data-name="mealDetails"]').value,
    items: [...block.querySelectorAll('.item-row')].map(readItem),
  };
}

function captureCurrentDay() {
  const day = week[selectedDay - 1];

  const name = document.querySelector('#day-name');
  if (name) day.name = name.value;
  const notes = document.querySelector('#day-notes');
  if (notes) day.notes = notes.value;

  /* Solo escriben sobre el estado los días que editan su propia lista: un día
     libre no tiene comidas y uno espejo enseña las del día que copia. */
  if (day.dayType === 'planned' && day.mirrorsDayOrder == null)
    day.meals = [...document.querySelectorAll('.meal-block')].map(readMeal);
}

/* ---------- Tira de días ---------- */

function dayBadge(day) {
  if (day.dayType === 'free') return { icon: 'luna', text: 'Libre' };
  if (day.mirrorsDayOrder != null)
    return { icon: 'copiar', text: `Igual al Día ${day.mirrorsDayOrder}` };

  const total = day.meals.length;
  if (!total) return { icon: 'nutricion', text: 'Sin comidas', warn: true };

  const macros = dayMacros({ day_type: 'planned', meals: day.meals });
  return {
    icon: 'nutricion',
    text: `${total} comida${total === 1 ? '' : 's'} · ${formatMacro(macros.calories)} kcal`,
  };
}

function renderTabs() {
  tabs.innerHTML = week
    .map((day, index) => {
      const order = index + 1;
      const badge = dayBadge(day);
      const classes = [
        'day-tab',
        order === selectedDay ? 'active' : '',
        day.dayType !== 'planned' ? 'is-rest' : '',
        badge.warn ? 'is-warn' : '',
      ]
        .filter(Boolean)
        .join(' ');

      /* La línea de estado se oculta en móvil, así que el estado completo va
         también en `aria-label`: quien use lector de pantalla lo oye igual en
         cualquier tamaño. */
      return `
        <button
          type="button"
          class="${classes}"
          role="tab"
          aria-selected="${order === selectedDay}"
          aria-label="Día ${order}: ${escapeHtml(badge.text)}"
          data-day="${order}"
        >
          <span class="day-tab-icon">${icon(badge.icon)}</span>
          <strong
            ><span class="day-tab-short" aria-hidden="true">D</span
            ><span class="day-tab-word">Día </span>${order}</strong
          >
          <small>${escapeHtml(badge.text)}</small>
        </button>`;
    })
    .join('');

  tabs.querySelectorAll('[data-day]').forEach((button) => {
    button.onclick = () => selectDay(Number(button.dataset.day));
  });
}

function selectDay(order) {
  captureCurrentDay();
  selectedDay = order;
  render();
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- Renglones ---------- */

/* La biblioteca solo trae alimentos activos. Si el plan que se está editando
   usa uno desactivado, se añade igualmente como opción para no perderlo al
   guardar sin que el entrenador se entere. */
function foodOptions(selectedId, fallbackName) {
  const known = foods.some((item) => item.id === selectedId);
  const extra =
    selectedId && !known
      ? `<option value="${selectedId}" selected>${escapeHtml(fallbackName || 'Alimento desactivado')} · no disponible</option>`
      : '';

  return (
    extra +
    foods
      .map(
        (food) =>
          `<option value="${food.id}"${food.id === selectedId ? ' selected' : ''}>` +
          `${escapeHtml(food.name)}${food.category ? ` · ${escapeHtml(food.category)}` : ''}` +
          '</option>',
      )
      .join('')
  );
}

/* La unidad y los macros de un renglón se recalculan al cambiar el alimento o
   la cantidad, sin volver a dibujar la fila: reemplazarla haría perder el
   foco justo mientras se escribe la cantidad. */
function refreshItemRow(row) {
  if (row.dataset.kind === 'text') return;

  const item = readItem(row);
  row.itemSnapshot = item;

  const unit = row.querySelector('.item-unit');
  if (unit) unit.textContent = item.servingUnit ? formatUnit(item.servingUnit, item.quantity) : '';

  const macros = itemMacros(item);
  const summary = row.querySelector('.item-macros');
  if (summary)
    summary.textContent = macros
      ? `${formatMacro(macros.calories)} kcal · P ${formatMacro(macros.proteinG)} · ` +
        `C ${formatMacro(macros.carbsG)} · G ${formatMacro(macros.fatsG)}`
      : 'Sin datos nutricionales';
}

function itemMarkup(item, index) {
  const remove = `
      <button type="button" class="icon-btn danger remove-item"
        aria-label="Quitar renglón ${index + 1}" title="Quitar">${icon('basura')}</button>`;

  if (!item.foodId)
    return `
      <div class="list-item item-row" data-kind="text">
        <div class="item-row-line">
          <div class="field">
            <label class="sr-only" for="free-${index}">Texto libre</label>
            <input id="free-${index}" data-name="freeText" maxlength="300"
              placeholder="Escríbelo como quieras" value="${escapeHtml(item.freeText || '')}" required>
          </div>
          ${remove}
        </div>
        <small class="muted">Sin datos nutricionales: no suma en los totales.</small>
      </div>`;

  return `
      <div class="list-item item-row" data-kind="food">
        <div class="item-row-line">
          <div class="field grow">
            <label class="sr-only" for="food-${index}">Alimento</label>
            <select id="food-${index}" data-name="foodId" required>${foodOptions(item.foodId, item.name)}</select>
          </div>
          <div class="field item-quantity">
            <label class="sr-only" for="qty-${index}">Cantidad</label>
            <input id="qty-${index}" data-name="quantity" type="number" step=".01" min=".01"
              value="${item.quantity ?? ''}" required>
          </div>
          <span class="item-unit"></span>
          ${remove}
        </div>
        <small class="muted item-macros"></small>
      </div>`;
}

/* ---------- Comidas ---------- */

function mealMarkup(meal, index) {
  const macros = mealMacros(meal);

  return `
    <section class="card meal-block" data-meal="${index}">
      <div class="meal-head">
        <div class="field grow">
          <label class="sr-only" for="meal-${index}">Nombre de la comida</label>
          <input id="meal-${index}" data-name="mealName" maxlength="100" required
            value="${escapeHtml(meal.name || '')}" placeholder="Desayuno, Comida, Cena...">
        </div>
        <button type="button" class="icon-btn danger remove-meal"
          aria-label="Quitar ${escapeHtml(meal.name || 'comida')}" title="Quitar comida">${icon('basura')}</button>
      </div>

      <div class="list item-rows">
        ${
          meal.items.length
            ? meal.items.map(itemMarkup).join('')
            : '<div class="empty">Todavía no hay nada en esta comida.</div>'
        }
      </div>

      <div class="actions mt">
        <button type="button" class="btn secondary small add-food">${icon('agregar')}Alimento</button>
        <button type="button" class="btn secondary small add-text">${icon('agregar')}Texto libre</button>
      </div>

      <div class="field mt">
        <label for="meal-notes-${index}">Nota de la comida</label>
        <textarea id="meal-notes-${index}" data-name="mealDetails" maxlength="5000"
          placeholder="Opcional: preparación, horario, sustituciones...">${escapeHtml(meal.details || '')}</textarea>
      </div>

      <p class="muted meal-total">
        Suma: ${formatMacro(macros.calories)} kcal · P ${formatMacro(macros.proteinG)} g ·
        C ${formatMacro(macros.carbsG)} g · G ${formatMacro(macros.fatsG)} g
      </p>
    </section>`;
}

/* ---------- Editor del día ---------- */

function renderTypeSelector(day) {
  return `
    <div class="field">
      <label>Tipo de día</label>
      <div class="segmented" role="group" aria-label="Tipo de día">
        ${DAY_TYPES.map(
          (type) => `
          <button
            type="button"
            class="segmented-option${day.dayType === type.value ? ' active' : ''}"
            aria-pressed="${day.dayType === type.value}"
            data-type="${type.value}"
          >${type.label}</button>`,
        ).join('')}
      </div>
    </div>`;
}

function renderMirrorSelector(day) {
  const candidates = mirrorCandidates(selectedDay);
  if (!candidates.length) return '';

  return `
    <div class="field">
      <label for="mirror">Repetir otro día</label>
      <select id="mirror">
        <option value="">No, tiene sus propias comidas</option>
        ${candidates
          .map(
            (item) =>
              `<option value="${item.order}"${day.mirrorsDayOrder === item.order ? ' selected' : ''}>` +
              `Igual al Día ${item.order} · ${escapeHtml(item.day.name)}</option>`,
          )
          .join('')}
      </select>
      <small>El atleta verá el día marcado como copia, con las mismas comidas.</small>
    </div>`;
}

function renderMirrorPreview(day) {
  const copied = effectiveMeals(day);

  return `
    <div class="notice">
      Este día repite el <strong>Día ${day.mirrorsDayOrder}</strong>. Sus comidas se copian solas:
      si cambias el día ${day.mirrorsDayOrder}, este se actualiza también.
    </div>
    <div class="list mt">
      ${
        copied.length
          ? copied
              .map((meal) => {
                const macros = mealMacros(meal);
                return `
        <div class="list-item">
          <strong>${escapeHtml(meal.name || 'Comida')}</strong>
          <p>${meal.items.length} renglón${meal.items.length === 1 ? '' : 'es'} ·
            ${formatMacro(macros.calories)} kcal</p>
        </div>`;
              })
              .join('')
          : '<div class="empty">El día que repites todavía no tiene comidas.</div>'
      }
    </div>`;
}

function renderMealEditor(day) {
  const macros = dayMacros({ day_type: 'planned', meals: day.meals });
  const aviso = macros.incomplete
    ? '<small class="muted">Hay renglones sin datos nutricionales, así que el total es un mínimo.</small>'
    : '';

  return `
    <h3>Comidas del día</h3>
    <div id="meals" class="list">
      ${
        day.meals.length
          ? day.meals.map(mealMarkup).join('')
          : '<div class="empty">Este día todavía no tiene comidas.</div>'
      }
    </div>
    <div class="actions mt">
      <button class="btn secondary" type="button" id="add-meal">${icon('agregar')}Agregar comida</button>
    </div>
    <div class="day-total mt" id="day-total">
      <strong>Total del día</strong>
      <span>${formatMacro(macros.calories)} kcal · P ${formatMacro(macros.proteinG)} g ·
        C ${formatMacro(macros.carbsG)} g · G ${formatMacro(macros.fatsG)} g ·
        F ${formatMacro(macros.fiberG)} g</span>
      ${aviso}
    </div>`;
}

function renderEditor() {
  const day = week[selectedDay - 1];
  const isPlanned = day.dayType === 'planned';
  const isMirror = isPlanned && day.mirrorsDayOrder != null;

  let body = '';
  if (!isPlanned)
    body = '<div class="notice">Día libre. El atleta lo verá sin plan de comidas asignado.</div>';
  else if (isMirror) body = renderMirrorPreview(day);
  else body = renderMealEditor(day);

  /* En móvil las fichas no muestran su línea de estado, así que se repite
     aquí: es la única forma de saber en qué estado está el día abierto. */
  const badge = dayBadge(day);

  editor.innerHTML = `
    <div class="day-editor">
      <div class="day-editor-head">
        <h3>Día ${selectedDay}</h3>
        <span class="badge${badge.warn ? ' warn' : ''}">${escapeHtml(badge.text)}</span>
      </div>
      <div class="form-row">
        <div class="field">
          <label for="day-name">Nombre del día</label>
          <input id="day-name" value="${escapeHtml(day.name)}" maxlength="100" required>
        </div>
        ${renderTypeSelector(day)}
      </div>
      ${isPlanned ? renderMirrorSelector(day) : ''}
      ${body}
      <div class="field mt">
        <label for="day-notes">Notas para el atleta</label>
        <textarea id="day-notes" maxlength="1000">${escapeHtml(day.notes || '')}</textarea>
      </div>
    </div>`;

  bindEditor();
  editor.querySelectorAll('.item-row').forEach(refreshItemRow);
}

/* ---------- Manejadores ---------- */

/* Vuelve a leer el día y actualiza solo lo que depende de la suma: los
   totales y la tira de días. No se redibuja el editor, para no perder el
   foco mientras se escribe una cantidad. */
function refreshTotals() {
  captureCurrentDay();
  const day = week[selectedDay - 1];

  const macros = dayMacros({ day_type: 'planned', meals: day.meals });
  const total = editor.querySelector('#day-total span');
  if (total)
    total.textContent =
      `${formatMacro(macros.calories)} kcal · P ${formatMacro(macros.proteinG)} g · ` +
      `C ${formatMacro(macros.carbsG)} g · G ${formatMacro(macros.fatsG)} g · ` +
      `F ${formatMacro(macros.fiberG)} g`;

  editor.querySelectorAll('.meal-block').forEach((block, index) => {
    const parciales = mealMacros(day.meals[index] ?? { items: [] });
    const linea = block.querySelector('.meal-total');
    if (linea)
      linea.textContent =
        `Suma: ${formatMacro(parciales.calories)} kcal · P ${formatMacro(parciales.proteinG)} g · ` +
        `C ${formatMacro(parciales.carbsG)} g · G ${formatMacro(parciales.fatsG)} g`;
  });

  renderTabs();
}

function bindEditor() {
  editor.querySelectorAll('[data-type]').forEach((button) => {
    button.onclick = () => setDayType(button.dataset.type);
  });

  const mirror = editor.querySelector('#mirror');
  if (mirror) mirror.onchange = () => setMirror(mirror.value ? Number(mirror.value) : null);

  /* El nombre del día aparece también en la tira, así que se refleja mientras
     se escribe en lugar de esperar al cambio de día. */
  const name = editor.querySelector('#day-name');
  if (name)
    name.oninput = () => {
      week[selectedDay - 1].name = name.value;
      renderTabs();
    };

  const addMeal = editor.querySelector('#add-meal');
  if (addMeal)
    addMeal.onclick = () => {
      captureCurrentDay();
      const day = week[selectedDay - 1];
      day.meals.push({ name: sugerirNombre(day.meals.length), details: '', items: [] });
      render();
      /* Se enfoca el nombre de la comida recién creada: es lo primero que hay
         que escribir y ahorra buscarla al final de la lista. */
      editor.querySelector(`#meal-${day.meals.length - 1}`)?.focus();
    };

  editor.querySelectorAll('.meal-block').forEach((block) => {
    const index = Number(block.dataset.meal);

    block.querySelector('.remove-meal').onclick = () => {
      captureCurrentDay();
      week[selectedDay - 1].meals.splice(index, 1);
      render();
    };

    block.querySelector('.add-food').onclick = () => addItem(index, null);
    block.querySelector('.add-text').onclick = () => addItem(index, '');

    /* Cambiar el alimento o la cantidad rehace los macros de esa fila y las
       sumas, pero no vuelve a dibujar la fila. */
    block.querySelectorAll('.item-row').forEach((row) => {
      row.querySelector('.remove-item').onclick = () => {
        captureCurrentDay();
        const items = week[selectedDay - 1].meals[index].items;
        items.splice([...block.querySelectorAll('.item-row')].indexOf(row), 1);
        render();
      };

      row.querySelectorAll('[data-name]').forEach((field) => {
        field.oninput = () => {
          refreshItemRow(row);
          refreshTotals();
        };
      });
    });
  });
}

/* Nombres habituales en orden, para no obligar a teclear "Desayuno" cada vez.
   Pasadas las seis se deja en blanco en lugar de inventar. */
const NOMBRES = ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena', 'Antes de dormir'];
const sugerirNombre = (index) => NOMBRES[index] ?? '';

function addItem(mealIndex, freeText) {
  captureCurrentDay();
  const meal = week[selectedDay - 1].meals[mealIndex];

  if (freeText === null) {
    const primero = foods[0];
    if (!primero)
      return showMessage(
        message,
        'Tu biblioteca de alimentos está vacía. Crea alguno desde la pantalla de Alimentos.',
        'error',
      );
    meal.items.push(itemFromLibrary(primero, Number(primero.serving_size)));
  } else {
    meal.items.push({ foodId: null, quantity: null, freeText: '', notes: '' });
  }

  render();

  /* El renglón nuevo es el último de esa comida; se enfoca para poder
     escribir sin buscarlo. */
  const block = editor.querySelector(`.meal-block[data-meal="${mealIndex}"]`);
  const filas = block?.querySelectorAll('.item-row');
  filas?.[filas.length - 1]?.querySelector('[data-name]')?.focus();
}

function setDayType(type) {
  captureCurrentDay();
  const day = week[selectedDay - 1];
  day.dayType = type;

  if (type !== 'planned') {
    day.mirrorsDayOrder = null;
    /* Los días que repetían a este se quedan sin nada que copiar. */
    week.forEach((other) => {
      if (other.mirrorsDayOrder === selectedDay) other.mirrorsDayOrder = null;
    });
  }

  render();
}

function setMirror(source) {
  captureCurrentDay();
  const day = week[selectedDay - 1];
  day.mirrorsDayOrder = source;

  /* Solo se ofrecen días con lista propia, así que al convertir este en
     espejo hay que soltar a los que lo repetían. */
  if (source != null)
    week.forEach((other) => {
      if (other.mirrorsDayOrder === selectedDay) other.mirrorsDayOrder = null;
    });

  render();
}

function render() {
  renderTabs();
  renderEditor();
}

/* ---------- Duración del plan ---------- */

function renderWeeks() {
  const value = Number(weeksInput.value) || 1;
  const isPreset = WEEK_PRESETS.includes(value);

  weeksOptions.innerHTML =
    WEEK_PRESETS.map(
      (weeks) => `
      <button
        type="button"
        class="chip${isPreset && weeks === value ? ' active' : ''}"
        aria-pressed="${isPreset && weeks === value}"
        data-weeks="${weeks}"
      >${weeks} ${weeks === 1 ? 'semana' : 'semanas'}</button>`,
    ).join('') +
    `<button
        type="button"
        class="chip${isPreset ? '' : ' active'}"
        aria-pressed="${!isPreset}"
        data-weeks="otro"
      >Otro</button>`;

  weeksInput.hidden = isPreset;

  weeksOptions.querySelectorAll('[data-weeks]').forEach((button) => {
    button.onclick = () => {
      if (button.dataset.weeks === 'otro') {
        if (WEEK_PRESETS.includes(Number(weeksInput.value))) weeksInput.value = 12;
      } else weeksInput.value = button.dataset.weeks;
      renderWeeks();
      if (!weeksInput.hidden) weeksInput.focus();
    };
  });
}

weeksInput.oninput = () => {
  const value = Number(weeksInput.value);
  weeksOptions.querySelectorAll('[data-weeks]').forEach((button) => {
    const active = button.dataset.weeks === 'otro' && !WEEK_PRESETS.includes(value);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
};

/* ---------- Carga inicial ---------- */

/* Escribe un borrador en el formulario y en el estado semanal. Se comparte
   entre edición y duplicación; la diferencia es cómo se construye el borrador
   y qué método HTTP se usa después al guardar. */
function loadDraft(draft) {
  form.elements.name.value = draft.name;
  form.elements.athleteId.value = draft.athleteId;
  form.elements.description.value = draft.description;
  form.elements.startDate.value = draft.startDate;
  for (const field of GOAL_FIELDS) form.elements[field].value = draft[field] ?? '';
  weeksInput.value = draft.weeks;
  week = draft.week;

  const firstPlanned = week.findIndex((day) => day.dayType === 'planned');
  selectedDay = firstPlanned >= 0 ? firstPlanned + 1 : 1;
}

function editableDraft(plan) {
  const draft = planCopyDraft(plan);
  draft.name = plan.name;
  draft.startDate = plan.start_date ? plan.start_date.slice(0, 10) : '';
  return draft;
}

if (planId) {
  document.title = 'Modificar plan';
  document.querySelector('#page-title').textContent = 'Modificar plan de alimentación';
  document.querySelector('#page-description').textContent =
    'Revisa la semana y guarda los cambios que necesites.';
  document.querySelector('#submit-button').textContent = 'Guardar cambios';

  try {
    const { plan } = await api(`/api/nutrition/plans/${planId}`);
    loadDraft(editableDraft(plan));
  } catch (error) {
    showMessage(message, error.message, 'error');
    form.hidden = true;
  }
} else if (sourcePlanId) {
  document.title = 'Duplicar plan';
  document.querySelector('#page-title').textContent = 'Duplicar plan de alimentación';
  document.querySelector('#page-description').textContent =
    'Revisa la copia, cambia lo que necesites y guárdala como un plan independiente.';
  document.querySelector('#submit-button').textContent = 'Crear copia';
  document.querySelector('#copy-notice').hidden = false;

  try {
    const { plan } = await api(`/api/nutrition/plans/${sourcePlanId}`);
    loadDraft(planCopyDraft(plan));
  } catch (error) {
    showMessage(message, error.message, 'error');
    form.hidden = true;
  }
}

renderWeeks();
render();

/* ---------- Guardado ---------- */

/* Un campo numérico vacío se envía como nulo y no como cero: "sin objetivo" y
   "cero calorías" son cosas distintas. */
const number = (value) => (value === '' || value === undefined ? null : Number(value));

/* El servidor rechazaría un día con plan sin comidas, o una comida vacía del
   todo. Se avisa antes y se abre el día que falta, para no mandar a nadie a
   adivinar dónde está el problema. */
function findProblem() {
  for (let index = 0; index < week.length; index += 1) {
    const day = week[index];
    if (day.dayType !== 'planned' || day.mirrorsDayOrder != null) continue;

    if (!day.meals.length)
      return {
        day: index + 1,
        text: `El Día ${index + 1} tiene plan pero no tiene comidas. Agrega una, márcalo como libre o haz que repita otro día.`,
      };

    const vacia = day.meals.findIndex((meal) => !meal.items.length && !meal.details.trim());
    if (vacia >= 0)
      return {
        day: index + 1,
        text: `En el Día ${index + 1}, la comida “${day.meals[vacia].name || vacia + 1}” está vacía. Agrégale un alimento, un texto libre o una nota.`,
      };
  }
  return null;
}

form.onsubmit = async (event) => {
  event.preventDefault();
  captureCurrentDay();

  const problem = findProblem();
  if (problem) {
    selectDay(problem.day);
    return showMessage(message, problem.text, 'error');
  }

  const raw = formData(form);
  const body = {
    athleteId: raw.athleteId,
    name: raw.name,
    description: raw.description,
    status: 'active',
    startDate: raw.startDate,
    weeks: Number(weeksInput.value) || 1,
    ...Object.fromEntries(GOAL_FIELDS.map((field) => [field, number(raw[field])])),
    days: week.map((day) => ({
      name: day.name,
      notes: day.notes,
      dayType: day.dayType,
      mirrorsDayOrder: day.dayType === 'planned' ? day.mirrorsDayOrder : null,
      /* Un día espejo se envía vacío a propósito: el servidor copia las
         comidas del día repetido, que es la versión buena aunque se acabe de
         editar. */
      meals:
        day.dayType === 'planned' && day.mirrorsDayOrder == null
          ? day.meals.map((meal) => ({
              name: meal.name,
              details: meal.details || '',
              items: meal.items.map((item) =>
                item.foodId
                  ? { foodId: item.foodId, quantity: Number(item.quantity) }
                  : { freeText: item.freeText },
              ),
            }))
          : [],
    })),
  };

  try {
    await api(planId ? `/api/nutrition/plans/${planId}` : '/api/nutrition/plans', {
      method: planId ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    location.href = '/entrenador/nutricion.html';
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
};
