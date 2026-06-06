const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'projects', key: 'id' },
    },
    invoice_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    invoice_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'Commercial',
    },
    invoice_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    customer_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    customer_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    customer_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    customer_phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    client_po_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    project_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    revision: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    line_items: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    tax_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Exempt',
    },
    tax_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
    },
    payment_terms: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: 'Net 30 days from invoice date. Payment via bank transfer.',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: 'Thank you for your business.',
    },
    terms_conditions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    shipping_charges: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    subtotal: {
      type: DataTypes.DECIMAL(14, 2),
      defaultValue: 0,
    },
    tax_amount: {
      type: DataTypes.DECIMAL(14, 2),
      defaultValue: 0,
    },
    final_total: {
      type: DataTypes.DECIMAL(14, 2),
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'Draft',
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    },
  }, {
    tableName: 'invoices',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return Invoice;
};
