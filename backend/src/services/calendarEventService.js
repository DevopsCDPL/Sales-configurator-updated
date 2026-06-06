const { Op } = require('sequelize');
const { CalendarEvent, User, Project, Company } = require('../models');

class CalendarEventService {
  /**
   * Create a new calendar event
   */
  async createEvent(data, userId, companyId) {
    const event = await CalendarEvent.create({
      ...data,
      created_by: userId,
      company_id: companyId,
    });
    return this.getEventById(event.id, companyId);
  }

  /**
   * Get a single event by ID
   */
  async getEventById(eventId, companyId) {
    return CalendarEvent.findOne({
      where: { id: eventId, company_id: companyId },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'quotation_number'] },
      ],
    });
  }

  /**
   * Get events for a date range (month/week/day)
   */
  async getEvents(companyId, { startDate, endDate, eventType, projectId, userId } = {}) {
    const where = { company_id: companyId };

    if (startDate && endDate) {
      where.event_date = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.event_date = { [Op.gte]: startDate };
    }

    if (eventType) where.event_type = eventType;
    if (projectId) where.project_id = projectId;

    // Filter by assigned user (JSONB array contains)
    if (userId) {
      where[Op.or] = [
        { created_by: userId },
        { assigned_users: { [Op.contains]: [userId] } },
      ];
    }

    const events = await CalendarEvent.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'quotation_number'] },
      ],
      order: [['event_date', 'ASC'], ['start_time', 'ASC NULLS LAST']],
    });

    return events;
  }

  /**
   * Update an event
   */
  async updateEvent(eventId, data, companyId) {
    const event = await CalendarEvent.findOne({
      where: { id: eventId, company_id: companyId },
    });
    if (!event) return null;

    await event.update(data);
    return this.getEventById(eventId, companyId);
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId, companyId) {
    const event = await CalendarEvent.findOne({
      where: { id: eventId, company_id: companyId },
    });
    if (!event) return false;
    await event.destroy();
    return true;
  }

  /**
   * Mark overdue deadlines (can be called periodically)
   */
  async markOverdueDeadlines(companyId) {
    const today = new Date().toISOString().split('T')[0];
    await CalendarEvent.update(
      { is_overdue: true },
      {
        where: {
          company_id: companyId,
          event_type: 'deadline',
          event_date: { [Op.lt]: today },
          completed: false,
          is_overdue: false,
        },
      }
    );
  }

  /**
   * Get upcoming events for reminders
   */
  async getUpcomingReminders(companyId) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    return CalendarEvent.findAll({
      where: {
        company_id: companyId,
        event_date: today,
        reminder: { [Op.ne]: 'none' },
        completed: false,
      },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
      ],
    });
  }
}

module.exports = new CalendarEventService();
