'use strict';

const { Router } = require('express');
const { handleGenerate, handleType } = require('../controllers/pdfController');

const router = Router();

// Generic endpoint – caller supplies { type: '...' } in body
router.post('/generate',              handleGenerate);

// Convenience typed endpoints
router.post('/quotation',             handleType('quotation'));
router.post('/work-order',            handleType('work_order'));
router.post('/production-traveller',  handleType('production_traveller'));
router.post('/coc',                   handleType('coc'));
router.post('/packing-list',          handleType('packing_list'));
router.post('/rfq',                   handleType('rfq'));
router.post('/vendor-po',             handleType('vendor_po'));
router.post('/invoice',               handleType('invoice'));

module.exports = router;
