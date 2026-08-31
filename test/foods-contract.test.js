/* Contrato de la biblioteca de alimentos. Sin servidor ni base de datos:
   comprueba que las piezas encajen entre sí, que es donde están los errores
   que no se ven hasta abrir la pantalla. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('las unidades del formulario, de la validación y de la base coinciden', async () => {
  const [migracion, rutas, pagina] = await Promise.all([
    read('../database/migrations/006_biblioteca_alimentos.sql'),
    read('../src/routes/nutrition.routes.js'),
    read('../public/entrenador/alimentos.html'),
  ]);

  /* Las unidades viven en tres sitios a la vez: el tipo `food_unit` de
     PostgreSQL, el `z.enum` que valida la petición y el desplegable del
     formulario. Si se añade una en uno solo, el guardado revienta con un
     error de tipo en lugar de un mensaje legible. Esta prueba es la que
     obliga a tocar los tres. */
  const enBase = migracion
    .match(/CREATE TYPE food_unit AS ENUM \(([^)]+)\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  const enValidacion = rutas
    .match(/servingUnit: z\.enum\(\[([^\]]+)\]\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  const enFormulario = [...pagina.matchAll(/<option value="([^"]+)">/g)]
    .map((coincidencia) => coincidencia[1])
    /* El formulario tiene además un datalist de categorías, cuyas opciones
       no llevan texto. Se distinguen porque no están en la lista de la base. */
    .filter((valor) => enBase.includes(valor));

  assert.deepEqual(enValidacion, enBase, 'la validación debe aceptar las unidades de la base');
  assert.deepEqual(
    [...new Set(enFormulario)].sort(),
    [...enBase].sort(),
    'el desplegable debe ofrecer exactamente las unidades de la base',
  );
});

test('las rutas de alimentos están declaradas en el orden correcto', async () => {
  const rutas = await read('../src/routes/nutrition.routes.js');

  /* "library" no es un identificador. Si `/foods/:id` se declarara antes,
     Express se lo tragaría y la pantalla recibiría un 404 en lugar de la
     biblioteca. Es el mismo cuidado que ya se tomó con `/compliance` en las
     rutinas y con `read-all` en las notificaciones. */
  assert.ok(
    rutas.indexOf("'/foods/library'") < rutas.indexOf("'/foods/:id'"),
    '/foods/library debe declararse antes que /foods/:id',
  );
});

test('la pantalla y su módulo encajan', async () => {
  const [pagina, modulo, app, navegacion, iconos, estilos] = await Promise.all([
    read('../public/entrenador/alimentos.html'),
    read('../public/js/entrenador/alimentos.js'),
    read('../src/app.js'),
    read('../public/js/comun/navigation.js'),
    read('../public/js/comun/icons.js'),
    read('../public/css/components.css'),
  ]);

  assert.match(app, /app\.use\('\/api\/nutrition'/, 'el módulo debe estar montado');

  /* Cada identificador que busca el JavaScript tiene que existir en el HTML. */
  for (const id of [
    'food-form',
    'message',
    'cancel',
    'form-title',
    'save',
    'search',
    'custom-foods',
    'public-foods',
  ])
    assert.match(pagina, new RegExp(`id="${id}"`), `falta #${id} en la página`);

  /* Y cada campo que el formulario envía tiene que existir como campo. */
  for (const campo of [
    'name',
    'category',
    'servingSize',
    'servingUnit',
    'calories',
    'proteinG',
    'carbsG',
    'fatsG',
    'fiberG',
    'notes',
  ])
    assert.match(pagina, new RegExp(`name="${campo}"`), `falta el campo ${campo}`);

  /* La política de seguridad del servidor bloquea los estilos en línea, así
     que un `style=` no se aplicaría nunca y pasaría inadvertido. */
  assert.ok(!/\sstyle="/.test(pagina), 'no debe haber atributos style en el HTML');

  /* Nombre, categoría y notas los escribe el entrenador. */
  assert.match(modulo, /escapeHtml\(food\.name\)/);
  assert.match(modulo, /escapeHtml\(food\.category\)/);
  assert.match(modulo, /escapeHtml\(food\.notes\)/);

  assert.match(navegacion, /'Alimentos', '\/entrenador\/alimentos\.html', 'alimentos'/);
  assert.match(iconos, /\balimentos:/, 'el icono del menú debe existir');
  assert.match(estilos, /\.grid\.four/, 'los macros usan una rejilla de cuatro');
});

test('ninguna pantalla llama ya al endpoint viejo de nutrición', async () => {
  for (const archivo of [
    '../public/js/entrenador/nutricion.js',
    '../public/js/atleta/nutricion.js',
    '../public/js/entrenador/atleta-detalle.js',
  ]) {
    const source = await read(archivo);
    assert.ok(
      !source.includes('/api/tracking/nutrition'),
      `${archivo} debe pedir /api/nutrition/plans`,
    );
  }
});
