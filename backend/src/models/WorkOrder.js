const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WorkOrder = sequelize.define('WorkOrder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    work_order_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    production_traveler_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Auto-generated production traveler number (PT-XXXX)'
    },
    release_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    operations: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of operations with completion status'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    target_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    approved_by: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    quality_requirements: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of quality requirement strings; null means use defaults'
    },
    special_instructions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of special instruction strings; null means use defaults'
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
      defaultValue: 'pending'
    },
    revision: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Work order revision number'
    },
    dimensional_report: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Dimensional report status'
    },
    materials: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of material specifications'
    },
    external_processes: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of external processes'
    },
    prepared_by: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    job_ids: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of job indices assigned to this work order'
    },
    production_forms: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Per-job Production Traveller form data'
    },
    job_requirements: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Per-job requirement strings, keyed by job index'
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'work_orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return WorkOrder;
};
