const stockService = require('../services/stockService');
const ExcelJS = require('exceljs');
const { Stock } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

class StockController {
  async getAll(req, res) {
    try {
      const stocks = await stockService.getAllStock(req.query, req.user);
      res.json({ success: true, data: stocks });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getById(req, res) {
    try {
      const stock = await stockService.getStockById(req.params.id);
      if (!verifyTenantRecord(req, stock)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: stock });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async create(req, res) {
    try {
      const stock = await stockService.createStock(req.body, req.user);
      res.status(201).json({ success: true, data: stock });
    } catch (err) {
      // Log full error server-side for diagnostics (Sequelize validation/FK errors etc.)
      console.error('[stockController.create] failed:', {
        name: err.name,
        message: err.message,
        original: err.original?.message,
        detail: err.original?.detail,
        body: req.body,
        userId: req.user?.id,
        companyId: req.user?.company_id,
      });
      // Prefer Sequelize validation message detail, then PG detail, then top-level message
      const message =
        err.errors?.[0]?.message ||
        err.original?.detail ||
        err.message ||
        'Failed to create stock';
      res.status(400).json({ success: false, message });
    }
  }

  async bulkCreate(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required' });
      }
      const stocks = await stockService.bulkCreateStock(items, req.user);
      res.status(201).json({ success: true, data: stocks });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async update(req, res) {
    try {
      const existing = await Stock.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Stock not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const stock = await stockService.updateStock(req.params.id, req.body);
      res.json({ success: true, data: stock });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async delete(req, res) {
    try {
      const existing = await Stock.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Stock not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const result = await stockService.deleteStock(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getRawMaterialById (req, res) {
    try {
      const { raw_material_id } = req.params;

      if (!raw_material_id) {
        return res.status(400).json({ success:false, message: 'raw_material_id is required' });
      }

      const stock = await Stock.findOne({ where: { raw_material_id } });

      if (!stock) {
        return res.status(404).json({ success: false, message: 'Stock not found for the given raw_material_id' });
      }

      res.json({ success: true, data: stock })
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async addUnused(req, res) {
    try {
      const { part_description, material_grade, quantity } = req.body;
      if (!part_description || !material_grade || quantity == null) {
        return res.status(400).json({ success: false, message: 'part_description, material_grade and quantity are required' });
      }
      const stock = await stockService.addUnusedToStock(part_description, material_grade, Number(quantity), req.user);
      res.json({ success: true, data: stock });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async getHeatNumbers(req, res) {
    try {
      const heatNumbers = await stockService.getHeatNumbers(req.query, req.user);
      res.json({ success: true, data: heatNumbers });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async importStock(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const fileName = (req.file.originalname || '').toLowerCase();
      const isCSV = fileName.endsWith('.csv');

      let headers = [];
      const dataRows = [];

      if (isCSV) {
        // Parse CSV from buffer
        const text = req.file.buffer.toString('utf-8');
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) {
          return res.status(400).json({ success: false, message: 'Empty file' });
        }
        // Simple CSV parse (handles quoted fields)
        const parseCSVLine = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
              else { inQuotes = !inQuotes; }
            } else if (ch === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          result.push(current.trim());
          return result;
        };
        headers = parseCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          dataRows.push(parseCSVLine(lines[i]));
        }
      } else {
        // Parse Excel
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          return res.status(400).json({ success: false, message: 'Empty workbook' });
        }
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] = (cell.value || '').toString().trim();
        });
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const vals = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            vals[colNumber - 1] = cell.value != null ? String(cell.value).trim() : '';
          });
          dataRows.push(vals);
        });
      }

      // Expected columns (same order as export)
      const expectedHeaders = [
        'Stock ID', 'Raw MID', 'Part Description', 'Material & Grade',
        'Condition', 'Shape', 'Dimension', 'Quantity', 'Heat Number', 'Status', 'Last Updated',
      ];

      const missingCols = expectedHeaders.filter(h => !headers.includes(h));
      if (missingCols.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing columns: ${missingCols.join(', ')}. Please use the export template.`,
        });
      }

      // Map header names to column indices
      const colMap = {};
      headers.forEach((h, idx) => { if (h) colMap[h] = idx; });

      const errors = [];
      const items = [];

      dataRows.forEach((rowVals, idx) => {
        const rowNumber = idx + 2; // account for header
        const getCellVal = (colName) => {
          const i = colMap[colName];
          return (i != null && rowVals[i]) ? rowVals[i] : '';
        };

        const partDesc = getCellVal('Part Description');
        const materialGrade = getCellVal('Material & Grade');
        const quantity = parseFloat(getCellVal('Quantity'));

        if (!partDesc && !materialGrade) {
          errors.push({ row: rowNumber, reason: 'Missing Part Description and Material & Grade' });
          return;
        }
        if (isNaN(quantity) || quantity < 0) {
          errors.push({ row: rowNumber, reason: 'Invalid or negative quantity' });
          return;
        }

        items.push({
          part_description: partDesc,
          material_grade: materialGrade,
          condition: getCellVal('Condition'),
          shape: getCellVal('Shape'),
          dimension: getCellVal('Dimension'),
          quantity: quantity,
          heat_number: getCellVal('Heat Number'),
        });
      });

      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid rows found in file',
          errors,
        });
      }

      const stocks = await stockService.bulkCreateStock(items, req.user);
      res.json({
        success: true,
        created: stocks.length,
        errors,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

module.exports = new StockController();
