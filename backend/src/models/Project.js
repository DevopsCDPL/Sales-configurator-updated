const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Project = sequelize.define('Project', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'clients',
        key: 'id'
      }
    },
    prepared_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'companies',
        key: 'id'
      }
    },
    revision: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'configured',
        'drawing_generated',
        'estimated',
        'quoted',
        'order_confirmed',
        'in_production',
        'inspected',
        'shipped',
        'closed'
      ),
      defaultValue: 'draft'
    },
    ship_to_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    material_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    material_grade: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    heat_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    material_supplied_by: {
      type: DataTypes.ENUM('client', 'vendor', 'manufacturer'),
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quotation_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    quote_info: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    packages_json: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    po_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Purchase Order number from customer'
    },
    part_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Part number from Part Master'
    },
    selected_revision: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Selected estimate revision for quotation and approval'
    },
    production_traveler_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'machining_industry',
      comment: 'Production traveler type captured at project creation (machining_industry or anodizing_industry)'
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    deleted_by: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null
    },
    project_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      // Per-company unique — composite index in DB (see index.js pre-sync).
      comment: 'Auto-generated project number, unique per company'
    }
  }, {
    tableName: 'projects',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Project;
};
