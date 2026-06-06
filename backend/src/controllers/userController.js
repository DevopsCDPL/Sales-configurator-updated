const userService = require('../services/userService');

class UserController {
  async getProfile(req, res, next) {
    try {
      const user = await userService.getUserById(req.user.id);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProfile(req, res, next) {
    try {
      const user = await userService.updateProfile(req.user.id, req.body);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await userService.changePassword(req.user.id, currentPassword, newPassword);
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAll(req, res, next) {
    try {
      const users = await userService.getAllUsers(req.query, req.user);
      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.id, req.user);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      const status = error.message.includes('permission') ? 403 : 404;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async create(req, res, next) {
    try {
      const user = await userService.createUser(req.body, req.user);
      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      const status = error.message === 'Permission denied' ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async update(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      const status = error.message === 'Permission denied' ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async resetPassword(req, res, next) {
    try {
      const result = await userService.resetPassword(req.params.id, req.body.newPassword, req.user);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      const status = error.message.includes('permission') || error.message.includes('cannot') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async delete(req, res, next) {
    try {
      const result = await userService.deleteUser(req.params.id, req.user);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getCompanies(req, res, next) {
    try {
      const companies = await userService.getCompanies(req.user);
      res.json({
        success: true,
        data: companies
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(req, res, next) {
    try {
      const stats = await userService.getStats(req.user);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  // --------- Security Controls ---------------------------------------------------------------------------------------------------------------------------------------------------------

  async forcePasswordReset(req, res) {
    try {
      const result = await userService.forcePasswordReset(req.params.id, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, message: err.message });
    }
  }

  async toggle2FA(req, res) {
    try {
      const result = await userService.toggle2FA(req.params.id, req.body.enabled, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, message: err.message });
    }
  }

  async lockAccount(req, res) {
    try {
      const result = await userService.lockAccount(req.params.id, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, message: err.message });
    }
  }

  async unlockAccount(req, res) {
    try {
      const result = await userService.unlockAccount(req.params.id, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, message: err.message });
    }
  }

  async updateModulePermissions(req, res) {
    try {
      const result = await userService.updateModulePermissions(req.params.id, req.body.permissions, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, message: err.message });
    }
  }

  // --------- Bulk Operations ---------------------------------------------------------------------------------------------------------------------------------------------------------------

  async bulkDeactivate(req, res) {
    try {
      const result = await userService.bulkDeactivate(req.body.userIds, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async bulkImport(req, res) {
    try {
      const result = await userService.bulkImport(req.body.users, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async inviteUser(req, res) {
    try {
      const result = await userService.inviteUser(req.body.email, req.body.role, req.user);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(err.message.includes('already exists') ? 409 : 400).json({ success: false, message: err.message });
    }
  }

  async getLoginHistory(req, res) {
    try {
      const history = await userService.getLoginHistory(req.params.id, parseInt(req.query.limit) || 20, req.user);
      res.json({ success: true, data: history });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // --------- Avatar (Profile Picture) ------------------------------------------------------------------------------------

  async uploadAvatar(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
      if (req.file.size > MAX_SIZE) {
        return res.status(400).json({ success: false, message: 'File size must be under 2 MB' });
      }

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : null;
      if (!mime) {
        return res.status(400).json({ success: false, message: 'Only JPG and PNG files are allowed' });
      }

      const base64 = req.file.buffer.toString('base64');
      const dataUri = `data:${mime};base64,${base64}`;

      const { User } = require('../models');
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      await user.update({ avatar: dataUri });

      res.json({ success: true, data: { avatar: dataUri }, message: 'Profile picture updated' });
    } catch (err) {
      console.error('Avatar upload error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload profile picture' });
    }
  }

  async deleteAvatar(req, res) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      await user.update({ avatar: null });

      res.json({ success: true, message: 'Profile picture removed' });
    } catch (err) {
      console.error('Avatar delete error:', err);
      res.status(500).json({ success: false, message: 'Failed to remove profile picture' });
    }
  }
}

module.exports = new UserController();
