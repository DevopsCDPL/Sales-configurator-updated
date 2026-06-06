const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// File paths (kept as cache / fallback only)
const settingsFilePath = path.join(__dirname, '../../data/settings.json');
const logoDir = path.join(__dirname, '../../uploads/logo');

const defaultSettings = {
  company: {
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    tax_id: '',
  },
  system: {
    projectNumberPrefix: 'PRJ',
    soNumberPrefix: 'SO',
    woNumberPrefix: 'WO',
    defaultMargin: 15,
    defaultPaymentTerms: 'Net 30',
    quotationValidity: 30,
    emailNotifications: true,
    autoBackup: true,
    quotationNotes: '',
    quotationTerms: '',
    workOrderQualityReqs: '',
    logisticsInstructions: '',
    invoicePaymentTerms: '',
    invoiceNotes: '',
    invoiceTerms: '',
    qualityNotes: '',
    woPreparedByNames: '',
    woApprovedByNames: '',
    productionInspectorInitials: '',
    productionOperatorInitials: '',
  }
};

class SettingsService {
  constructor() {
    this._Setting = null; // lazy-loaded to avoid circular dependency
    this._dbReady = false; // true after initialize() succeeds
  }

  /** Lazy-load the Setting model (avoids require at module-level before sequelize.sync) */
  _getModel() {
    if (!this._Setting) {
      this._Setting = require('../models').Setting;
    }
    return this._Setting;
  }

  // --------- DB helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------

  /**
   * Read a setting by key and optional company_id from the database.
   * company_id = null reads global (platform-level) rows.
   * Returns the value if found, null if the key doesn't exist.
   * THROWS on DB errors so callers never confuse "missing" with "DB down".
   */
  async _dbGet(key, companyId = null) {
    const Setting = this._getModel();
    const row = await Setting.findOne({
      where: { key, company_id: companyId },
      // INTERNAL_ONLY — do NOT copy this flag to controllers or routes.
      // This service is on the _SKIP_TENANT_SCOPE_ALLOWLIST in models/index.js
      // because it always provides an explicit company_id in the WHERE clause
      // above. Copying this flag without that explicit scoping is a cross-tenant
      // data leak. See Phase 3 in the security hardening notes.
      _skipTenantScope: true,
    });
    return row ? row.value : null;
  }

  /**
   * Write a setting by key and optional company_id to the database.
   * company_id = null writes to global (platform-level) row.
   * THROWS on failure so callers know the write did not succeed.
   */
  async _dbSet(key, value, companyId = null) {
    const Setting = this._getModel();
    const where = { key, company_id: companyId };
    const [row, created] = await Setting.findOrCreate({ where, defaults: { value } });
    if (!created) await row.update({ value });
  }

  /**
   * Read a company-scoped setting.
   * Phase 3: reads directly from (key, company_id) — NO fallback to global row.
   * If no company-specific row exists, callers should use in-memory defaults.
   */
  async _dbGetScoped(baseKey, companyId) {
    return this._dbGet(baseKey, companyId || null);
  }

  /**
   * Write a company-scoped setting.
   * Phase 3: writes directly to (key, company_id) row.
   */
  async _dbSetScoped(baseKey, value, companyId) {
    return this._dbSet(baseKey, value, companyId || null);
  }

  // --------- JSON file helpers (cache only — never used to seed DB) --------------------------------------------------------

  async _ensureDataDir() {
    try { await fs.mkdir(path.dirname(settingsFilePath), { recursive: true }); } catch { /* exists */ }
  }

  async _saveFile(settings) {
    try {
      await this._ensureDataDir();
      await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.warn('Settings file cache write failed:', err.message);
    }
  }

  /** Read logo file from disk and store as base64 in DB (company-scoped) */
  async _persistLogoToDB(logoRelPath, companyId) {
    try {
      const absPath = this.getLogoAbsolutePath(logoRelPath);
      if (!absPath) return;
      const buf = await fs.readFile(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const data = {
        data: buf.toString('base64'),
        ext,
        mime: ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
      };
      await this._dbSetScoped('logo_binary', data, companyId);
    } catch (err) {
      console.warn('Logo binary persist failed:', err.message);
    }
  }

  /** Restore logo file to disk from DB (after container restart) — company-scoped */
  async _restoreLogoFile(companyId) {
    try {
      const blob = await this._dbGetScoped('logo_binary', companyId);
      if (!blob?.data) return null;
      await fs.mkdir(logoDir, { recursive: true });
      const filename = `company-logo${blob.ext || '.png'}`;
      const dest = path.join(logoDir, filename);
      if (!fsSync.existsSync(dest)) {
        await fs.writeFile(dest, Buffer.from(blob.data, 'base64'));
        console.log('Restored logo file from database:', dest);
      }
      return `/uploads/logo/${filename}`;
    } catch (err) {
      console.warn('Logo file restore failed:', err.message);
      return null;
    }
  }

  // --------- Public API ------------------------------------------------------------------------------

  /**
   * Called once from initDatabase() after sequelize.sync().
   * Seeds defaults ONLY if the key truly doesn't exist yet in the DB.
   * Restores the logo file to disk and rebuilds the JSON file cache.
   */
  async initialize() {
    try {
      // Seed global company/system defaults (company_id = null) only if truly missing
      let company = await this._dbGet('company', null);
      if (!company) {
        company = { ...defaultSettings.company };
        await this._dbSet('company', company, null);
        console.log('Settings: seeded default company settings into database.');
      }

      let system = await this._dbGet('system', null);
      if (!system) {
        system = { ...defaultSettings.system };
        await this._dbSet('system', system, null);
        console.log('Settings: seeded default system settings into database.');
      }

      // Restore logo file from DB to disk (survives container restarts)
      await this._restoreLogoFile();

      // Rebuild the JSON file cache from DB data
      await this._saveFile({ company, system });

      this._dbReady = true;
      console.log('Settings: initialized from database ---');
    } catch (err) {
      console.error('Settings initialization failed:', err.message);
    }
  }

  async getCompanySettings(companyId) {
    console.log(`[getCompanySettings] Called with companyId=${companyId}`);
    const company = await this._dbGet('company');
    const settings = company ? { ...company } : { ...defaultSettings.company };

    // If a specific companyId is provided, overlay that Company model's data
    if (companyId) {
      let companyRecord = null;
      try {
        const { Company } = require('../models');
        companyRecord = await Company.findByPk(companyId);
        console.log(`[getCompanySettings] findByPk(${companyId}):`, companyRecord ? `found "${companyRecord.name}", has logo_data=${!!companyRecord.logo_data}, logo_url=${companyRecord.logo_url}` : 'NOT FOUND');
      } catch (err) {
        console.warn(`[getCompanySettings] Company.findByPk failed: ${err.message}`);
        // Model findByPk may fail if columns are missing — try raw query with SELECT *
        try {
          const { sequelize } = require('../models');
          const [rows] = await sequelize.query(
            'SELECT * FROM companies WHERE id = :id LIMIT 1',
            { replacements: { id: companyId } }
          );
          if (rows && rows.length > 0) {
            companyRecord = rows[0];
            console.log(`[getCompanySettings] Raw fallback found company "${companyRecord.name}"`);
          }
        } catch (rawErr) {
          console.warn(`[getCompanySettings] All company lookups failed: ${rawErr.message}`);
        }
      }
      if (companyRecord) {
        // Overlay company-specific fields (prefer Company model over global settings)
        const get = (field) => companyRecord.dataValues ? companyRecord[field] : companyRecord[field];
        if (get('name')) settings.name = get('name');
        if (get('address')) settings.address = get('address');
        if (get('phone')) settings.phone = get('phone');
        if (get('email')) settings.email = get('email');
        if (get('website')) settings.website = get('website');
        if (get('tax_id')) settings.tax_id = get('tax_id');
        // Use company-specific logo — prefer base64 data (always works, no file dependency)
        const logoData = get('logo_data');
        const logoUrl = get('logo_url');
        if (logoData) {
          console.log(`[getCompanySettings] Returning logo_data for company ${companyId} (${logoData.length} chars)`);
          settings.logo_data = logoData;
          settings.logo = logoUrl || '';
          delete settings.logo_missing;
          return settings;
        }
        if (logoUrl) {
          const absPath = this.getLogoAbsolutePath(logoUrl);
          if (absPath) {
            settings.logo = logoUrl;
            delete settings.logo_missing;
            return settings;
          }
        }
      }
    }

    // Ensure logo file exists on disk (restore from DB if missing)
    if (settings.logo) {
      const absPath = this.getLogoAbsolutePath(settings.logo);
      if (!absPath) {
        const restored = await this._restoreLogoFile(companyId);
        if (restored) {
          settings.logo = restored;
        } else {
          // File can't be restored --- try serving inline from DB
          try {
            const blob = await this._dbGetScoped('logo_binary', companyId);
            if (blob?.data) {
              settings.logo_data = `data:${blob.mime || 'image/png'};base64,${blob.data}`;
            }
          } catch { /* logo binary read failed, not critical */ }
          // If we couldn't get logo_data either, clear the broken logo path
          if (!settings.logo_data) {
            delete settings.logo;
          }
          settings.logo_missing = true;
        }
      }
    } else if (settings.logo !== '') {
      // Logo was never set (undefined/null) — try restoring from DB
      // But if logo === '' it was explicitly cleared — don't restore
      const restored = await this._restoreLogoFile(companyId);
      if (restored) settings.logo = restored;
    }

    return settings;
  }

  async updateCompanySettings(companyData, companyId) {
    // Validate required fields
    if (companyData.name !== undefined && !companyData.name.trim()) {
      throw new Error('Company name is required');
    }
    if (companyData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyData.email)) {
      throw new Error('Invalid email format');
    }
    if (companyData.phone && !/^[+]?[\d\s().\-]{7,20}$/.test(companyData.phone)) {
      throw new Error('Invalid phone number format');
    }
    if (companyData.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(companyData.website)) {
      throw new Error('Invalid website URL format');
    }

    const allowedFields = ['name', 'address', 'phone', 'email', 'website', 'tax_id', 'logo'];

    // ── Per-company path: write directly to Company model ──
    if (companyId) {
      const { Company } = require('../models');
      let companyRecord;
      try {
        companyRecord = await Company.findByPk(companyId);
      } catch (err) {
        console.warn(`[updateCompanySettings] Company.findByPk failed: ${err.message}, trying raw query`);
        const { sequelize } = require('../models');
        const [rows] = await sequelize.query('SELECT * FROM companies WHERE id = :id LIMIT 1', { replacements: { id: companyId } });
        if (rows && rows.length > 0) {
          companyRecord = await Company.build(rows[0], { isNewRecord: false });
        }
      }
      if (!companyRecord) throw new Error('Company not found');

      const oldLogoPath = companyRecord.logo_url;
      const updateData = {};
      for (const field of allowedFields) {
        if (companyData[field] !== undefined) {
          if (field === 'logo') {
            updateData.logo_url = companyData.logo;
          } else {
            updateData[field] = companyData[field];
          }
        }
      }
      await companyRecord.update(updateData);

      // If logo is being cleared, fully purge
      if (companyData.logo === '') {
        await companyRecord.update({ logo_data: null, logo_url: null });
        try { await this._dbSetScoped('logo_binary', null, companyId); } catch { /* non-critical */ }
        // Delete logo files from disk
        try {
          const files = await fs.readdir(logoDir);
          for (const f of files) await fs.unlink(path.join(logoDir, f));
        } catch { /* logo dir may not exist */ }
        // Remove from R2
        try {
          const r2 = require('./r2StorageService');
          if (r2.isConfigured && oldLogoPath) {
            const key = r2.keyFromDbPath(oldLogoPath);
            if (key) r2.remove(key).catch(() => {});
          }
        } catch { /* R2 cleanup non-critical */ }
      }

      // Return settings in expected format
      return {
        name: companyRecord.name, address: companyRecord.address,
        phone: companyRecord.phone, email: companyRecord.email,
        website: companyRecord.website, tax_id: companyRecord.tax_id,
        logo: companyRecord.logo_url || '',
      };
    }

    // ── Fallback: no companyId (legacy global path) ──
    let company = (await this._dbGet('company')) || { ...defaultSettings.company };
    const oldLogoPath = company.logo;
    for (const field of allowedFields) {
      if (companyData[field] !== undefined) company[field] = companyData[field];
    }
    await this._dbSet('company', company);

    if (companyData.logo === '') {
      try { await this._dbSet('logo_binary', null); } catch { /* non-critical */ }
      try {
        const files = await fs.readdir(logoDir);
        for (const f of files) await fs.unlink(path.join(logoDir, f));
      } catch { /* logo dir may not exist */ }
    }

    const all = await this._buildAllSettings(company);
    await this._saveFile(all);
    return company;
  }

  async uploadLogo(file, companyId) {
    await fs.mkdir(logoDir, { recursive: true });

    const ext = path.extname(file.originalname);
    const filename = `company-logo${ext}`;
    const destPath = path.join(logoDir, filename);

    // Remove old logos
    try {
      const files = await fs.readdir(logoDir);
      for (const f of files) {
        const fp = path.join(logoDir, f);
        if (fp !== file.path) await fs.unlink(fp);
      }
    } catch { /* empty */ }

    if (file.path !== destPath) {
      await fs.rename(file.path, destPath);
    }

    const logoRelPath = `/uploads/logo/${filename}`;

    // Persist logo binary to DB for recovery (company-scoped)
    await this._persistLogoToDB(logoRelPath, companyId);

    // Update the Company model so PDF generation uses the correct logo
    if (companyId) {
      try {
        const { Company } = require('../models');
        const companyRecord = await Company.findByPk(companyId);
        if (companyRecord) {
          const fileBuffer = await fs.readFile(destPath);
          const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
          const base64Data = `data:${mime};base64,${fileBuffer.toString('base64')}`;
          await companyRecord.update({ logo_data: base64Data, logo_url: logoRelPath });
        }
      } catch (err) {
        console.warn('Failed to update Company model logo:', err.message);
      }
    } else {
      // Legacy: no companyId, write to global setting
      let company = (await this._dbGet('company')) || { ...defaultSettings.company };
      company.logo = logoRelPath;
      await this._dbSet('company', company);
    }

    // Sync to R2 cloud storage
    const r2 = require('./r2StorageService');
    r2.syncFileToR2(destPath, { companyId: companyId || null, section: 'logos' })
      .catch(err => console.error('[R2] Logo sync failed:', err.message));

    return { logo: logoRelPath };
  }

  getLogoAbsolutePath(logoRelativePath) {
    if (!logoRelativePath) return null;
    const absPath = path.join(__dirname, '../../', logoRelativePath);
    if (fsSync.existsSync(absPath)) return absPath;
    // No generic fallback — each company must use its own logo only
    return null;
  }

  async getSystemSettings(companyId) {
    // Phase 3: reads only from company-specific row — NO fallback to global DB row.
    // Falls back to in-memory defaults if no company-specific row exists yet.
    const system = await this._dbGet('system', companyId || null);
    return system || { ...defaultSettings.system };
  }

  async updateSystemSettings(systemData, companyId) {
    // Read current company-scoped settings, fall back to in-memory defaults
    const current = (await this._dbGet('system', companyId || null)) || { ...defaultSettings.system };
    const updated = { ...current, ...systemData };

    // Write to company-scoped key
    await this._dbSet('system', updated, companyId || null);

    return updated;
  }

  async getAllSettings(companyId) {
    const company = await this.getCompanySettings(companyId);
    const system  = await this.getSystemSettings(companyId);
    return { company, system };
  }

  /** Build combined settings object for file cache */
  async _buildAllSettings(company, system) {
    return {
      company: company || (await this._dbGet('company')) || { ...defaultSettings.company },
      system:  system  || (await this._dbGet('system'))  || { ...defaultSettings.system },
    };
  }
}

module.exports = new SettingsService();
