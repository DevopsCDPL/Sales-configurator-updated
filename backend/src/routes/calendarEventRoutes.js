const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const calendarEventController = require('../controllers/calendarEventController');

router.use(authenticate);
router.use(tenantScope);

router.get('/', calendarEventController.getEvents);
router.get('/:id', calendarEventController.getEvent);
router.post('/', calendarEventController.createEvent);
router.put('/:id', calendarEventController.updateEvent);
router.delete('/:id', calendarEventController.deleteEvent);

module.exports = router;
