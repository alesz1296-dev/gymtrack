import * as service from '../services/tracking.service.js';
export async function addMeasurement(req, res) {
  res.status(201).json({ measurement: await service.addMeasurement(req.session.user, req.body) });
}
export async function measurements(req, res) {
  res.json({ measurements: await service.listMeasurements(req.session.user, req.query.athleteId) });
}
export async function addCheckin(req, res) {
  res.status(201).json({ checkin: await service.createCheckin(req.session.user, req.body) });
}
export async function checkins(req, res) {
  res.json({ checkins: await service.checkins(req.session.user) });
}
export async function review(req, res) {
  res.json({
    checkin: await service.reviewCheckin(req.session.user, req.params.id, req.body.feedback),
  });
}
