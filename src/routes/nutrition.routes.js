import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/nutrition.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(requireAuth);

/* Un macro sin valor es nulo, no cero. El formulario envía `null` cuando el
   campo queda vacío y el repositorio lo guarda así. */
const optionalNumber = (min, max) => z.union([z.number().min(min).max(max), z.null()]).optional();

/* ---------- Biblioteca de alimentos ---------- */

/* Las unidades son las mismas del tipo `food_unit` de la base. Repetirlas aquí
   permite rechazar una unidad inventada con un 400 legible en lugar de dejar
   que PostgreSQL responda con un error de tipo. */
const foodInput = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().max(80).optional(),
  servingSize: z.number().positive().max(100_000),
  servingUnit: z.enum(['g', 'ml', 'unidad', 'taza', 'cucharada', 'rebanada', 'porción']),
  calories: optionalNumber(0, 10_000),
  proteinG: optionalNumber(0, 2000),
  carbsG: optionalNumber(0, 3000),
  fatsG: optionalNumber(0, 2000),
  fiberG: optionalNumber(0, 500),
  notes: z.string().max(3000).optional(),
});

/* Lo que ofrece el selector al armar un plan. Lo consultan los dos roles: el
   atleta necesita leer el alimento que aparece dentro de su plan. */
router.get('/foods', asyncHandler(controller.foods));

/* La pantalla de administración, solo del entrenador.
   Antes de `/foods/:id`, o Express tomaría "library" por un identificador. */
router.get('/foods/library', requireRole('trainer'), asyncHandler(controller.library));

router.post(
  '/foods',
  requireRole('trainer'),
  validate(foodInput),
  asyncHandler(controller.createFood),
);
router.put(
  '/foods/:id',
  requireRole('trainer'),
  validate(foodInput),
  asyncHandler(controller.updateFood),
);
router.put(
  '/foods/:id/status',
  requireRole('trainer'),
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(controller.setFoodStatus),
);
router.delete('/foods/:id', requireRole('trainer'), asyncHandler(controller.deleteFood));

/* ---------- Planes ---------- */

/* Un renglón es un alimento con su cantidad o un texto libre, nunca las dos
   cosas ni ninguna. La base lo exige con una restricción; aquí se rechaza
   antes, con un mensaje que se puede mostrar. */
const itemInput = z
  .object({
    foodId: z.uuid().optional(),
    quantity: z.union([z.number().positive().max(100_000), z.null()]).optional(),
    freeText: z.string().trim().max(300).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (item) =>
      item.foodId
        ? item.quantity != null && !item.freeText
        : Boolean(item.freeText && item.freeText.length),
    { message: 'Cada renglón es un alimento con cantidad o un texto libre' },
  );

const mealInput = z.object({
  name: z.string().trim().min(1).max(100),
  details: z.string().max(5000).optional(),
  items: z.array(itemInput).max(40).default([]),
});

/* La posición dentro de `days` es la franja de la semana: el primer elemento
   es el Día 1 y el último, como mucho, el Día 7. */
const dayInput = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(1000).optional(),
  dayType: z.enum(['planned', 'free']).default('planned'),
  mirrorsDayOrder: z.union([z.number().int().min(1).max(7), z.null()]).optional(),
  meals: z.array(mealInput).max(12).default([]),
});

/* Se exporta para poder comprobar las reglas de la semana sin servidor ni
   base de datos: viven aquí porque es aquí donde se aplican. */
export const planInput = z
  .object({
    athleteId: z.uuid(),
    name: z.string().trim().min(2).max(140),
    description: z.string().max(3000).optional(),
    status: z.enum(['draft', 'active', 'archived']).default('active'),
    startDate: z.string().optional(),
    weeks: z.number().int().min(1).max(52).default(1),
    /* Objetivos diarios del plan entero, independientes de lo que sumen las
       comidas: son la meta, no el cálculo. */
    calories: optionalNumber(1, 20_000),
    proteinG: optionalNumber(0, 2000),
    carbsG: optionalNumber(0, 3000),
    fatsG: optionalNumber(0, 2000),
    fiberG: optionalNumber(0, 500),
    waterMl: optionalNumber(0, 20_000),
    days: z.array(dayInput).min(1).max(7),
  })
  /* Reglas que dependen de varios días a la vez y que Zod no puede expresar
     campo por campo. Se validan aquí para que el repositorio pueda confiar
     en la forma de los datos que recibe. */
  .superRefine((input, context) => {
    input.days.forEach((day, index) => {
      const dayOrder = index + 1;
      const at = (field) => ({ path: ['days', index, field] });

      if (day.dayType !== 'planned') {
        if (day.meals.length)
          context.addIssue({
            code: 'custom',
            message: 'Un día libre no puede tener comidas',
            ...at('meals'),
          });
        return;
      }

      /* Una comida vacía del todo no se sabría dibujar. Con renglones o con
         una nota basta; lo que no vale es ni una cosa ni la otra. */
      day.meals.forEach((meal, mealIndex) => {
        if (!meal.items.length && !meal.details?.trim())
          context.addIssue({
            code: 'custom',
            message: 'Una comida necesita al menos un alimento o una descripción',
            path: ['days', index, 'meals', mealIndex, 'items'],
          });
      });

      if (day.mirrorsDayOrder == null) {
        if (!day.meals.length)
          context.addIssue({
            code: 'custom',
            message: 'Un día con plan necesita al menos una comida',
            ...at('meals'),
          });
        return;
      }

      /* El día espejado tiene que existir y estar definido antes, para poder
         copiar su contenido en una sola pasada. */
      if (day.mirrorsDayOrder >= dayOrder) {
        context.addIssue({
          code: 'custom',
          message: 'Un día solo puede repetir un día anterior de la misma semana',
          ...at('mirrorsDayOrder'),
        });
        return;
      }
      if (input.days[day.mirrorsDayOrder - 1].dayType !== 'planned')
        context.addIssue({
          code: 'custom',
          message: 'No se puede repetir un día libre',
          ...at('mirrorsDayOrder'),
        });
    });
  });

router.get('/plans', asyncHandler(controller.plans));
router.post(
  '/plans',
  requireRole('trainer'),
  validate(planInput),
  asyncHandler(controller.createPlan),
);
/* Antes de `/plans/:id` no hace falta ningún cuidado especial porque no hay
   segmentos literales bajo `/plans/`, pero sí importa que `/logs` se declare
   fuera de esa rama: un registro no es un plan. */
router.get('/plans/:id', asyncHandler(controller.plan));
/* La cuadrícula de cumplimiento. La consultan los dos roles: el atleta para
   ver qué días lleva y el entrenador para ver la adherencia. */
router.get('/plans/:id/progress', asyncHandler(controller.progress));
router.put(
  '/plans/:id',
  requireRole('trainer'),
  validate(planInput),
  asyncHandler(controller.updatePlan),
);
/* Archivar o restaurar. Es una operación aparte de `PUT /plans/:id` porque
   aquella crea una versión nueva y archiva la anterior; esta solo cambia el
   estado. */
router.put(
  '/plans/:id/status',
  requireRole('trainer'),
  validate(z.object({ status: z.enum(['active', 'archived']) })),
  asyncHandler(controller.setPlanStatus),
);

/* ---------- Registro del atleta ---------- */

/* Abre el día del plan y devuelve lo que ya estuviera marcado. Es el
   equivalente de `POST /workouts/start` en las rutinas. */
router.post(
  '/logs',
  requireRole('athlete'),
  validate(
    z.object({
      nutritionDayId: z.uuid(),
      weekNumber: z.number().int().min(1).max(52).default(1),
    }),
  ),
  asyncHandler(controller.openDay),
);

/* Marcar una comida es la acción más frecuente de toda la aplicación: pasa
   entre tres y seis veces al día, todos los días. Por eso el estado tiene
   valor por defecto y la nota es opcional: el caso normal es un solo toque
   sin escribir nada. */
router.put(
  '/logs/:id/meals/:mealId',
  requireRole('athlete'),
  validate(
    z.object({
      status: z.enum(['done', 'swapped', 'skipped']).default('done'),
      notes: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(controller.logMeal),
);

router.delete(
  '/logs/:id/meals/:mealId',
  requireRole('athlete'),
  asyncHandler(controller.unlogMeal),
);

export default router;
