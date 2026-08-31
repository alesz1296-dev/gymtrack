/* Biblioteca de alimentos del entrenador.

   Misma estructura que la biblioteca de ejercicios: separa los alimentos
   propios, que el entrenador administra, de los generales de la plataforma,
   que solo puede consultar. El mismo formulario sirve para crear y para
   editar; si el campo oculto `id` tiene valor, se está editando.

   Los generales son muchos —arrancan cerca de cincuenta—, así que llevan un
   buscador. Los propios no: quien tiene tres alimentos no busca, mira. */

import { initNavigation } from '../comun/navigation.js';
import { api, formData, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';

await initNavigation();

const form = document.querySelector('#food-form');
const message = document.querySelector('#message');
const cancel = document.querySelector('#cancel');
const formTitle = document.querySelector('#form-title');
const saveButton = document.querySelector('#save');
const search = document.querySelector('#search');

/* Se conserva la última lista recibida para poder rellenar el formulario
   de edición sin volver a preguntarle al servidor. */
let foods = [];

/* ---------- Dibujado ---------- */

/* `serving_size` llega como texto desde PostgreSQL, porque un NUMERIC no cabe
   siempre en un número de JavaScript. Se convierte para no mostrar "100.00 g". */
function servingLabel(food) {
  return `${Number(food.serving_size)} ${food.serving_unit}`;
}

/* Un macro sin dato se muestra como raya y no como cero, porque cero es un
   valor legítimo —el agua no tiene calorías— y confundirlos engañaría. */
function macro(value, unit) {
  return value === null || value === undefined ? '—' : `${Number(value)}${unit}`;
}

function macrosMarkup(food) {
  return `
      <div class="grid four">
        <div><strong>${macro(food.calories, '')}</strong><br><small>kcal</small></div>
        <div><strong>${macro(food.protein_g, ' g')}</strong><br><small>proteína</small></div>
        <div><strong>${macro(food.carbs_g, ' g')}</strong><br><small>carbos</small></div>
        <div><strong>${macro(food.fats_g, ' g')}</strong><br><small>grasas</small></div>
      </div>`;
}

function renderActions(food) {
  /* El botón de eliminar solo aparece si el alimento nunca se ha usado. La
     regla la aplica también el servidor; aquí solo se oculta el botón. */
  const eliminar = food.is_used
    ? ''
    : `<button class="btn danger small" data-delete="${food.id}">Eliminar</button>`;

  return `
      <div class="actions">
        <button class="btn secondary small" data-edit="${food.id}">Editar</button>
        <button
          class="btn secondary small"
          data-status="${food.id}"
          data-active="${food.is_active}"
        >${food.is_active ? 'Desactivar' : 'Activar'}</button>
        ${eliminar}
      </div>`;
}

function foodCard(food, editable) {
  const estado = food.is_active ? 'Activo' : 'Desactivado';
  const enUso = food.is_used ? ' <span class="badge">En uso</span>' : '';
  const categoria = food.category ? ` <span class="badge">${escapeHtml(food.category)}</span>` : '';
  const notas = food.notes ? `<p>${escapeHtml(food.notes)}</p>` : '';
  const fibra =
    food.fiber_g === null || food.fiber_g === undefined
      ? ''
      : `<p><small>Fibra: ${Number(food.fiber_g)} g</small></p>`;

  return `
    <article class="card">
      <div>
        ${editable ? `<span class="badge">${estado}</span>${enUso}` : ''}${categoria}
      </div>
      <h3>${escapeHtml(food.name)}</h3>
      <p class="muted">Por ${escapeHtml(servingLabel(food))}</p>
      ${macrosMarkup(food)}
      ${fibra}
      ${notas}
      ${editable ? renderActions(food) : ''}
    </article>`;
}

/* Los manejadores se vuelven a conectar después de cada dibujado, porque
   al reemplazar el HTML los botones anteriores dejan de existir. */
function bindActions() {
  document.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => editFood(button.dataset.edit);
  });

  document.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = () => changeStatus(button);
  });

  document.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = () => deleteFood(button.dataset.delete);
  });
}

/* El buscador filtra solo la lista de generales y se resuelve en el navegador:
   la biblioteca completa ya está descargada y pedirla otra vez por cada tecla
   sería peor para todos. */
function renderPublic() {
  const term = search.value.trim().toLowerCase();
  const general = foods
    .filter((food) => food.is_public)
    .filter(
      (food) =>
        !term ||
        food.name.toLowerCase().includes(term) ||
        (food.category ?? '').toLowerCase().includes(term),
    );

  document.querySelector('#public-foods').innerHTML = general.length
    ? general.map((food) => foodCard(food, false)).join('')
    : '<div class="empty">Ningún alimento general coincide con la búsqueda.</div>';
}

async function load() {
  ({ foods } = await api('/api/nutrition/foods/library'));

  const custom = foods.filter((food) => !food.is_public);

  document.querySelector('#custom-foods').innerHTML = custom.length
    ? custom.map((food) => foodCard(food, true)).join('')
    : '<div class="empty">Todavía no has creado alimentos propios.</div>';

  renderPublic();
  bindActions();
}

/* ---------- Formulario ---------- */

function resetForm() {
  form.reset();
  form.elements.id.value = '';
  /* `reset` devuelve los campos a sus valores del HTML, así que la porción
     vuelve sola a 100 g, que es lo que trae casi toda etiqueta. */
  formTitle.textContent = 'Crear alimento';
  saveButton.textContent = 'Guardar alimento';
  cancel.hidden = true;
}

/* Un macro nulo tiene que dejar el campo vacío, no escribir "null" dentro. */
const fieldValue = (value) => (value === null || value === undefined ? '' : String(Number(value)));

function editFood(id) {
  const food = foods.find((item) => item.id === id);

  form.elements.id.value = id;
  form.elements.name.value = food.name;
  form.elements.category.value = food.category || '';
  form.elements.servingSize.value = fieldValue(food.serving_size);
  form.elements.servingUnit.value = food.serving_unit;
  form.elements.calories.value = fieldValue(food.calories);
  form.elements.proteinG.value = fieldValue(food.protein_g);
  form.elements.carbsG.value = fieldValue(food.carbs_g);
  form.elements.fatsG.value = fieldValue(food.fats_g);
  form.elements.fiberG.value = fieldValue(food.fiber_g);
  form.elements.notes.value = food.notes || '';

  formTitle.textContent = 'Editar alimento';
  saveButton.textContent = 'Guardar cambios';
  cancel.hidden = false;

  form.scrollIntoView({ behavior: 'smooth' });
}

/* ---------- Acciones sobre un alimento ---------- */

async function changeStatus(button) {
  const estabaActivo = button.dataset.active === 'true';

  try {
    await api(`/api/nutrition/foods/${button.dataset.status}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !estabaActivo }),
    });
    showMessage(message, estabaActivo ? 'Alimento desactivado.' : 'Alimento activado.');
    await load();
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

async function deleteFood(id) {
  if (!confirm('¿Eliminar definitivamente este alimento? Esta acción no se puede deshacer.')) {
    return;
  }

  try {
    await api(`/api/nutrition/foods/${id}`, { method: 'DELETE' });
    showMessage(message, 'Alimento eliminado.');
    resetForm();
    await load();
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

cancel.onclick = resetForm;
search.oninput = renderPublic;

/* Un campo numérico vacío se envía como nulo y no como cero: "sin dato" y
   "cero gramos" son cosas distintas y sumarlas igual falsearía el total. */
const number = (value) => (value === '' ? null : Number(value));

form.onsubmit = async (event) => {
  event.preventDefault();

  const data = formData(form);
  const id = data.id;

  try {
    await api(id ? `/api/nutrition/foods/${id}` : '/api/nutrition/foods', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: data.name,
        category: data.category,
        servingSize: Number(data.servingSize),
        servingUnit: data.servingUnit,
        calories: number(data.calories),
        proteinG: number(data.proteinG),
        carbsG: number(data.carbsG),
        fatsG: number(data.fatsG),
        fiberG: number(data.fiberG),
        notes: data.notes,
      }),
    });
    showMessage(message, id ? 'Alimento actualizado.' : 'Alimento creado.');
    resetForm();
    await load();
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
};

await load();
