import * as service from '../services/nutrition.service.js';

/* ---------- Biblioteca de alimentos ---------- */

export async function foods(req, res) {
  res.json({ foods: await service.listFoods(req.session.user.id) });
}
export async function library(req, res) {
  res.json({ foods: await service.foodLibrary(req.session.user.id) });
}
export async function createFood(req, res) {
  res.status(201).json({ food: await service.createFood(req.session.user.id, req.body) });
}
export async function updateFood(req, res) {
  res.json({ food: await service.updateFood(req.params.id, req.session.user.id, req.body) });
}
export async function setFoodStatus(req, res) {
  res.json({
    food: await service.setFoodStatus(req.params.id, req.session.user.id, req.body.isActive),
  });
}
export async function deleteFood(req, res) {
  await service.deleteFood(req.params.id, req.session.user.id);
  res.status(204).end();
}

/* ---------- Planes alimentarios ---------- */

export async function plans(req, res) {
  /* Solo el entrenador puede pedir las archivadas; el repositorio ignora el
     parámetro cuando quien pregunta es el atleta. */
  res.json({ plans: await service.listPlans(req.session.user, req.query.archived === 'true') });
}
export async function plan(req, res) {
  res.json({ plan: await service.getPlan(req.params.id, req.session.user) });
}
export async function createPlan(req, res) {
  res.status(201).json({ plan: await service.createPlan(req.session.user.id, req.body) });
}
export async function updatePlan(req, res) {
  res.json({ plan: await service.updatePlan(req.params.id, req.session.user.id, req.body) });
}
export async function setPlanStatus(req, res) {
  res.json({
    plan: await service.setPlanStatus(req.params.id, req.session.user.id, req.body.status),
  });
}
