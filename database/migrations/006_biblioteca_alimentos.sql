/* Biblioteca de alimentos.

   Mismo patrón que `exercises`: hay alimentos generales de la plataforma
   (`is_public = TRUE`, sin dueño) y alimentos propios de cada entrenador
   (`created_by` con su identificador). Un entrenador solo administra los
   suyos y puede desactivarlos sin borrarlos, para que los planes que ya los
   usan sigan leyéndose.

   Los macros se guardan POR PORCIÓN, y la porción la define el propio
   alimento con `serving_size` + `serving_unit`. Casi todo se expresa por
   100 g, que es como vienen las etiquetas, pero hay cosas que nadie pesa
   —un huevo, una rebanada de pan, una tortilla— y obligarlas a 100 g haría
   la biblioteca incómoda justo en lo más cotidiano. Al usarlas en un plan
   basta multiplicar por la cantidad, sea cual sea la unidad. */

CREATE TYPE food_unit AS ENUM ('g', 'ml', 'unidad', 'taza', 'cucharada', 'rebanada', 'porción');

CREATE TABLE foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id),
  name VARCHAR(140) NOT NULL,
  category VARCHAR(80),

  serving_size NUMERIC(8, 2) NOT NULL DEFAULT 100 CHECK (serving_size > 0),
  serving_unit food_unit NOT NULL DEFAULT 'g',

  /* Todos los macros son opcionales. Un entrenador puede querer registrar
     "Ensalada de la casa" sin ponerse a calcular nada, y forzarlo a inventar
     números sería peor que no tenerlos: un cero se sumaría como si fuera un
     dato real. Nulo significa "sin dato" y así se muestra. */
  calories NUMERIC(8, 2) CHECK (calories >= 0),
  protein_g NUMERIC(7, 2) CHECK (protein_g >= 0),
  carbs_g NUMERIC(7, 2) CHECK (carbs_g >= 0),
  fats_g NUMERIC(7, 2) CHECK (fats_g >= 0),
  fiber_g NUMERIC(7, 2) CHECK (fiber_g >= 0),

  notes TEXT,

  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  /* Un alimento privado sin dueño no lo vería nadie nunca: sería una fila
     muerta imposible de administrar. O es general, o tiene propietario. */
  CONSTRAINT foods_owner CHECK (is_public OR created_by IS NOT NULL)
);

/* El listado del entrenador filtra siempre por dueño y estado. */
CREATE INDEX idx_foods_created_by_active
  ON foods(created_by, is_active)
  WHERE created_by IS NOT NULL;

/* Y el selector de los planes pide los generales activos ordenados por nombre. */
CREATE INDEX idx_foods_public_active
  ON foods(name)
  WHERE is_public AND is_active;

CREATE TRIGGER foods_touch_updated_at
  BEFORE UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

/* ---------- Alimentos generales de la plataforma ----------

   Valores de referencia aproximados, tomados de tablas de composición
   habituales. Son un punto de partida para que la biblioteca no arranque
   vacía, no una fuente nutricional autorizada: el entrenador puede crear los
   suyos con los datos de las etiquetas que use en su país. Los pesos de carne
   y pescado son en crudo, y los de arroz, pasta y legumbres en cocido, que es
   como se sirven. */

INSERT INTO foods
  (name, category, serving_size, serving_unit, calories, protein_g, carbs_g, fats_g, fiber_g, is_public)
VALUES
  -- Proteínas
  ('Pechuga de pollo',            'Proteínas', 100, 'g',      165,  31.0,  0.0,   3.6,  0.0, TRUE),
  ('Muslo de pollo sin piel',     'Proteínas', 100, 'g',      177,  24.8,  0.0,   8.2,  0.0, TRUE),
  ('Carne de res magra',          'Proteínas', 100, 'g',      176,  20.0,  0.0,  10.0,  0.0, TRUE),
  ('Lomo de cerdo',               'Proteínas', 100, 'g',      143,  26.0,  0.0,   3.5,  0.0, TRUE),
  ('Huevo entero',                'Proteínas',   1, 'unidad',  72,   6.3,  0.4,   4.8,  0.0, TRUE),
  ('Clara de huevo',              'Proteínas',   1, 'unidad',  17,   3.6,  0.2,   0.1,  0.0, TRUE),
  ('Atún en agua escurrido',      'Proteínas', 100, 'g',      116,  25.5,  0.0,   0.8,  0.0, TRUE),
  ('Salmón',                      'Proteínas', 100, 'g',      208,  20.4,  0.0,  13.4,  0.0, TRUE),
  ('Tilapia',                     'Proteínas', 100, 'g',       96,  20.1,  0.0,   1.7,  0.0, TRUE),
  ('Camarón',                     'Proteínas', 100, 'g',       99,  24.0,  0.2,   0.3,  0.0, TRUE),
  ('Proteína de suero en polvo',  'Proteínas',  30, 'g',      120,  24.0,  2.4,   1.8,  0.0, TRUE),

  -- Lácteos
  ('Leche entera',                'Lácteos',   100, 'ml',      61,   3.2,  4.8,   3.3,  0.0, TRUE),
  ('Leche descremada',            'Lácteos',   100, 'ml',      34,   3.4,  5.0,   0.1,  0.0, TRUE),
  ('Yogur griego natural',        'Lácteos',   100, 'g',       59,  10.0,  3.6,   0.4,  0.0, TRUE),
  ('Queso panela',                'Lácteos',   100, 'g',      250,  19.0,  3.0,  18.0,  0.0, TRUE),
  ('Requesón',                    'Lácteos',   100, 'g',       98,  11.1,  3.4,   4.3,  0.0, TRUE),

  -- Carbohidratos
  ('Arroz blanco cocido',         'Carbohidratos', 100, 'g',   130,   2.7, 28.0,  0.3,  0.4, TRUE),
  ('Arroz integral cocido',       'Carbohidratos', 100, 'g',   123,   2.7, 25.6,  1.0,  1.6, TRUE),
  ('Avena en hojuelas',           'Carbohidratos', 100, 'g',   389,  16.9, 66.3,  6.9, 10.6, TRUE),
  ('Pan integral',                'Carbohidratos',   1, 'rebanada', 69, 3.6, 11.5, 0.9,  1.9, TRUE),
  ('Tortilla de maíz',            'Carbohidratos',   1, 'unidad',   65, 1.7, 13.4, 0.9,  1.9, TRUE),
  ('Papa cocida',                 'Carbohidratos', 100, 'g',    87,   1.9, 20.1,  0.1,  1.8, TRUE),
  ('Camote cocido',               'Carbohidratos', 100, 'g',    90,   2.0, 20.7,  0.2,  3.3, TRUE),
  ('Pasta cocida',                'Carbohidratos', 100, 'g',   158,   5.8, 30.9,  0.9,  1.8, TRUE),
  ('Frijoles negros cocidos',     'Carbohidratos', 100, 'g',   132,   8.9, 23.7,  0.5,  8.7, TRUE),
  ('Lentejas cocidas',            'Carbohidratos', 100, 'g',   116,   9.0, 20.1,  0.4,  7.9, TRUE),
  ('Quinoa cocida',               'Carbohidratos', 100, 'g',   120,   4.4, 21.3,  1.9,  2.8, TRUE),

  -- Frutas
  ('Plátano',                     'Frutas',    100, 'g',       89,   1.1, 22.8,  0.3,  2.6, TRUE),
  ('Manzana',                     'Frutas',    100, 'g',       52,   0.3, 13.8,  0.2,  2.4, TRUE),
  ('Naranja',                     'Frutas',    100, 'g',       47,   0.9, 11.8,  0.1,  2.4, TRUE),
  ('Fresas',                      'Frutas',    100, 'g',       32,   0.7,  7.7,  0.3,  2.0, TRUE),
  ('Piña',                        'Frutas',    100, 'g',       50,   0.5, 13.1,  0.1,  1.4, TRUE),
  ('Papaya',                      'Frutas',    100, 'g',       43,   0.5, 10.8,  0.3,  1.7, TRUE),

  -- Verduras
  ('Brócoli',                     'Verduras',  100, 'g',       34,   2.8,  6.6,  0.4,  2.6, TRUE),
  ('Espinaca',                    'Verduras',  100, 'g',       23,   2.9,  3.6,  0.4,  2.2, TRUE),
  ('Zanahoria',                   'Verduras',  100, 'g',       41,   0.9,  9.6,  0.2,  2.8, TRUE),
  ('Tomate',                      'Verduras',  100, 'g',       18,   0.9,  3.9,  0.2,  1.2, TRUE),
  ('Lechuga',                     'Verduras',  100, 'g',       15,   1.4,  2.9,  0.2,  1.3, TRUE),
  ('Calabacín',                   'Verduras',  100, 'g',       17,   1.2,  3.1,  0.3,  1.0, TRUE),

  -- Grasas
  ('Aguacate',                    'Grasas',    100, 'g',      160,   2.0,  8.5, 14.7,  6.7, TRUE),
  ('Aceite de oliva',             'Grasas',      1, 'cucharada', 119, 0.0,  0.0, 13.5,  0.0, TRUE),
  ('Almendras',                   'Grasas',    100, 'g',      579,  21.2, 21.6, 49.9, 12.5, TRUE),
  ('Maní',                        'Grasas',    100, 'g',      567,  25.8, 16.1, 49.2,  8.5, TRUE),
  ('Crema de maní',               'Grasas',      1, 'cucharada', 94, 4.0,  3.2,  8.1,  0.9, TRUE),
  ('Nueces',                      'Grasas',    100, 'g',      654,  15.2, 13.7, 65.2,  6.7, TRUE),

  -- Bebidas
  ('Agua',                        'Bebidas',   100, 'ml',        0,   0.0,  0.0,  0.0,  0.0, TRUE);
