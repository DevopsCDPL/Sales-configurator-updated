const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

router.get('/', authenticate, tenantScope, (req, res, next) => searchController.globalSearch(req, res, next));

module.exports = router;
