const calendarEventService = require('../services/calendarEventService');

const calendarEventController = {
  /**
   * GET /calendar-events
   */
  async getEvents(req, res) {
    try {
      const companyId = req.user.company_id;
      const { startDate, endDate, eventType, projectId, userId } = req.query;
      const events = await calendarEventService.getEvents(companyId, {
        startDate, endDate, eventType, projectId, userId,
      });
      // Mark overdue deadlines on each fetch
      await calendarEventService.markOverdueDeadlines(companyId);
      res.json({ data: events });
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      res.status(500).json({ message: 'Failed to fetch calendar events' });
    }
  },

  /**
   * GET /calendar-events/:id
   */
  async getEvent(req, res) {
    try {
      const event = await calendarEventService.getEventById(req.params.id, req.user.company_id);
      if (!event) return res.status(404).json({ message: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      console.error('Error fetching calendar event:', err);
      res.status(500).json({ message: 'Failed to fetch calendar event' });
    }
  },

  /**
   * POST /calendar-events
   */
  async createEvent(req, res) {
    try {
      const { title, description, event_type, project_id, project_module,
              event_date, start_time, end_time, all_day, assigned_users, reminder } = req.body;

      if (!title || !event_date) {
        return res.status(400).json({ message: 'Title and date are required' });
      }

      const event = await calendarEventService.createEvent(
        { title, description, event_type, project_id, project_module,
          event_date, start_time, end_time, all_day, assigned_users, reminder },
        req.user.id,
        req.user.company_id,
      );
      res.status(201).json({ data: event });
    } catch (err) {
      console.error('Error creating calendar event:', err);
      res.status(500).json({ message: 'Failed to create calendar event' });
    }
  },

  /**
   * PUT /calendar-events/:id
   */
  async updateEvent(req, res) {
    try {
      const event = await calendarEventService.updateEvent(
        req.params.id, req.body, req.user.company_id,
      );
      if (!event) return res.status(404).json({ message: 'Event not found' });
      res.json({ data: event });
    } catch (err) {
      console.error('Error updating calendar event:', err);
      res.status(500).json({ message: 'Failed to update calendar event' });
    }
  },

  /**
   * DELETE /calendar-events/:id
   */
  async deleteEvent(req, res) {
    try {
      const deleted = await calendarEventService.deleteEvent(req.params.id, req.user.company_id);
      if (!deleted) return res.status(404).json({ message: 'Event not found' });
      res.json({ message: 'Event deleted' });
    } catch (err) {
      console.error('Error deleting calendar event:', err);
      res.status(500).json({ message: 'Failed to delete calendar event' });
    }
  },
};

module.exports = calendarEventController;
