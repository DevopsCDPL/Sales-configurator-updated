const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Document = sequelize.define('Document', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    folder_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'file_manager_folders',
        key: 'id'
      }
    },
    module_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'project / procurement / inventory / part_master'
    },
    reference_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Generic FK: project_id / rfq_id / stock_id / part_id'
    },
    document_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft'
    },
    file_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'generated',
      comment: 'generated / uploaded'
    },
    uploaded_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    generated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    generated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'companies',
        key: 'id'
      }
    },
    r2_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Cloudflare R2 object key / URL for cloud-stored copy'
    },
    part_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Part UUID — identifies which part this document belongs to (for R2 path scoping)',
      references: {
        model: 'parts',
        key: 'id'
      }
    },
    workflow_stage: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'R2 stage path for this document e.g. quotation, quality/coc, logistics/tracking'
    }
  }, {
    tableName: 'documents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Document;
};
