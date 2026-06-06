const materialStockService = require('../services/materialStockService');

class MaterialStockController {
  // ── Stock endpoints ───────────────────────────────────────────────────

  async getAllStock(req, res) {
    try {
      const stocks = await materialStockService.getAllStock(req.query, req.user);
      res.json({ success: true, data: stocks });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async upsertStock(req, res) {
    try {
      const stock = await materialStockService.upsertStock(req.body, req.user);
      res.json({ success: true, data: stock });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // ── Transaction endpoints ─────────────────────────────────────────────

  async getAllTransactions(req, res) {
    try {
      const transactions = await materialStockService.getAllTransactions(req.query, req.user);
      res.json({ success: true, data: transactions });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createTransaction(req, res) {
    try {
      const tx = await materialStockService.createTransaction(req.body, req.user);
      res.status(201).json({ success: true, data: tx });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

module.exports = new MaterialStockController();
