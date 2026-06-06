const { Team, TeamMember, TeamPermission, TeamActivity, User, Company } = require('../models');
const { Op } = require('sequelize');

const PERMISSION_KEYS = [
  'view_projects',
  'edit_projects',
  'view_clients',
  'manage_vendors',
  'view_analytics'
];

const PERMISSION_LABELS = {
  view_projects: 'View Projects',
  edit_projects: 'Edit Projects',
  view_clients: 'View Clients',
  manage_vendors: 'Manage Vendors',
  view_analytics: 'View Analytics'
};

class TeamController {
  // GET /api/teams — list all teams (filtered by tenant scope)
  async getAll(req, res) {
    try {
      const { search, company_id } = req.query;
      const where = {};

      // Tenant scoping
      if (req.user.role === 'platform_admin') {
        if (company_id) where.company_id = company_id;
      } else {
        where.company_id = req.user.company_id;
      }

      if (search) {
        where.name = { [Op.iLike]: `%${search}%` };
      }

      const teams = await Team.findAll({
        where,
        include: [
          { model: Company, as: 'company', attributes: ['id', 'name'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          {
            model: TeamMember, as: 'members',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'position'] }]
          },
          { model: TeamPermission, as: 'permissions' }
        ],
        order: [['created_at', 'DESC']]
      });

      const data = teams.map(t => {
        const plain = t.get({ plain: true });
        return {
          ...plain,
          member_count: plain.members?.length || 0,
          member_avatars: (plain.members || []).slice(0, 5).map(m => ({
            id: m.user?.id,
            name: m.user?.name,
            initial: m.user?.name?.charAt(0)?.toUpperCase() || '?'
          }))
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('TeamController.getAll error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/teams/:id — get team detail
  async getById(req, res) {
    try {
      const team = await Team.findByPk(req.params.id, {
        include: [
          { model: Company, as: 'company', attributes: ['id', 'name'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          {
            model: TeamMember, as: 'members',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'position'] }]
          },
          { model: TeamPermission, as: 'permissions' },
          {
            model: TeamActivity, as: 'activities',
            include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']],
            limit: 20
          }
        ]
      });

      if (!team) {
        return res.status(404).json({ success: false, message: 'Team not found' });
      }

      // Tenant check
      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      res.json({ success: true, data: team });
    } catch (error) {
      console.error('TeamController.getById error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /api/teams — create team
  async create(req, res) {
    try {
      const { name, description, company_id, members } = req.body;
      const resolvedCompanyId = req.user.role === 'platform_admin'
        ? (company_id || req.headers['x-active-company-id'])
        : req.user.company_id;

      if (!resolvedCompanyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
      }

      const team = await Team.create({
        name,
        description,
        company_id: resolvedCompanyId,
        created_by: req.user.id
      });

      // Create default permissions (all enabled)
      await Promise.all(PERMISSION_KEYS.map(key =>
        TeamPermission.create({ team_id: team.id, permission_key: key, enabled: true })
      ));

      // Add members if provided
      if (members && Array.isArray(members) && members.length > 0) {
        await Promise.all(members.map(m =>
          TeamMember.create({
            team_id: team.id,
            user_id: m.user_id,
            role: m.role || 'Member'
          })
        ));
      }

      // Log activity
      await TeamActivity.create({
        team_id: team.id,
        user_id: req.user.id,
        action: `Team "${name}" created by ${req.user.name}`,
        type: 'team'
      });

      // Return full team
      const created = await Team.findByPk(team.id, {
        include: [
          { model: Company, as: 'company', attributes: ['id', 'name'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          {
            model: TeamMember, as: 'members',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'position'] }]
          },
          { model: TeamPermission, as: 'permissions' },
          { model: TeamActivity, as: 'activities', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] }
        ]
      });

      res.status(201).json({ success: true, data: created });
    } catch (error) {
      console.error('TeamController.create error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // PUT /api/teams/:id — update team
  async update(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const { name, description } = req.body;
      await team.update({ name, description });

      await TeamActivity.create({
        team_id: team.id,
        user_id: req.user.id,
        action: `Team updated by ${req.user.name}`,
        type: 'team'
      });

      const updated = await Team.findByPk(team.id, {
        include: [
          { model: Company, as: 'company', attributes: ['id', 'name'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          {
            model: TeamMember, as: 'members',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'position'] }]
          },
          { model: TeamPermission, as: 'permissions' },
          { model: TeamActivity, as: 'activities', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }], order: [['created_at', 'DESC']], limit: 20 }
        ]
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('TeamController.update error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // DELETE /api/teams/:id — soft delete team
  async delete(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      await team.destroy(); // soft delete (paranoid)
      res.json({ success: true, message: 'Team deleted successfully' });
    } catch (error) {
      console.error('TeamController.delete error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /api/teams/:id/members — add member
  async addMember(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const { user_id, role } = req.body;
      const user = await User.findByPk(user_id, { attributes: ['id', 'name'] });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Check if already a member
      const existing = await TeamMember.findOne({ where: { team_id: team.id, user_id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'User is already a member of this team' });
      }

      await TeamMember.create({ team_id: team.id, user_id, role: role || 'Member' });

      await TeamActivity.create({
        team_id: team.id,
        user_id: req.user.id,
        action: `${user.name} added to the team`,
        type: 'member'
      });

      const updated = await this._getTeamFull(team.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('TeamController.addMember error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // DELETE /api/teams/:id/members/:userId — remove member
  async removeMember(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const member = await TeamMember.findOne({
        where: { team_id: team.id, user_id: req.params.userId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }]
      });
      if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

      const memberName = member.user?.name || 'Unknown';
      await member.destroy();

      await TeamActivity.create({
        team_id: team.id,
        user_id: req.user.id,
        action: `${memberName} removed from the team`,
        type: 'member'
      });

      const updated = await this._getTeamFull(team.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('TeamController.removeMember error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // PUT /api/teams/:id/members/:userId — update member role
  async updateMemberRole(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const member = await TeamMember.findOne({
        where: { team_id: team.id, user_id: req.params.userId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }]
      });
      if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

      const { role } = req.body;
      const oldRole = member.role;
      await member.update({ role });

      await TeamActivity.create({
        team_id: team.id,
        user_id: req.user.id,
        action: `${member.user?.name} role changed from ${oldRole} to ${role}`,
        type: 'role'
      });

      const updated = await this._getTeamFull(team.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('TeamController.updateMemberRole error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // PUT /api/teams/:id/permissions — update team permissions
  async updatePermissions(req, res) {
    try {
      const team = await Team.findByPk(req.params.id);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      if (req.user.role !== 'platform_admin' && team.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const { permissions } = req.body; // { permission_key: enabled }
      const changedKeys = [];

      for (const [key, enabled] of Object.entries(permissions)) {
        if (!PERMISSION_KEYS.includes(key)) continue;
        const [perm] = await TeamPermission.findOrCreate({
          where: { team_id: team.id, permission_key: key },
          defaults: { enabled }
        });
        if (perm.enabled !== enabled) {
          changedKeys.push(`${PERMISSION_LABELS[key]}: ${enabled ? 'enabled' : 'disabled'}`);
          await perm.update({ enabled });
        }
      }

      if (changedKeys.length > 0) {
        await TeamActivity.create({
          team_id: team.id,
          user_id: req.user.id,
          action: `Permissions updated: ${changedKeys.join(', ')}`,
          type: 'permission'
        });
      }

      const updated = await this._getTeamFull(team.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('TeamController.updatePermissions error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/teams/:id/activity — get activity feed
  async getActivity(req, res) {
    try {
      const activities = await TeamActivity.findAll({
        where: { team_id: req.params.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        order: [['created_at', 'DESC']],
        limit: 50
      });

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error('TeamController.getActivity error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Helper to load full team data
  async _getTeamFull(teamId) {
    return Team.findByPk(teamId, {
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: TeamMember, as: 'members',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'position'] }]
        },
        { model: TeamPermission, as: 'permissions' },
        {
          model: TeamActivity, as: 'activities',
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
          order: [['created_at', 'DESC']],
          limit: 20
        }
      ]
    });
  }
}

module.exports = new TeamController();
