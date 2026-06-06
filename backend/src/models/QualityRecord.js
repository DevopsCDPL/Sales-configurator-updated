const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QualityRecord = sequelize.define('QualityRecord', {
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
    dimensional_verification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    visual_inspection: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hardness_testing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ndt_testing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    pressure_testing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    mtr_verification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    inspection_data_json: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Detailed inspection data and measurements'
    },
    inspection_checklist: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of inspection checklist items with pass/fail status'
    },
    inspector_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    overall_result: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      comment: 'pass, fail, or pending'
    },
    is_finalized: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    report_files: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of uploaded report file paths'
    },
    coc_generated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    inspection_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    inspector_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    job_quality_forms: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Per-job quality inspection data array'
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'quality_records',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return QualityRecord;
};
