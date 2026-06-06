const { Op } = require('sequelize');
const { Material, MaterialVendorMapping, Vendor, Company, User, sequelize } = require('../models');

class MaterialService {
  async getAllMaterials(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.search) {
      where[Op.or] = [
        { material_name: { [Op.iLike]: `%${query.search}%` } },
        { grade: { [Op.iLike]: `%${query.search}%` } },
        { form: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.status === 'active') where.is_active = true;
    else if (query.status === 'inactive') where.is_active = false;

    const materials = await Material.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: MaterialVendorMapping,
          as: 'vendorMappings',
          include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] }],
        },
      ],
      order: [['created_at', 'DESC']],
    });
    return materials;
  }

  async getMaterialById(id) {
    const material = await Material.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: MaterialVendorMapping,
          as: 'vendorMappings',
          include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] }],
        },
      ],
    });
    if (!material) throw new Error('Material not found');
    return material;
  }

  async createMaterial(data, user) {
    const t = await sequelize.transaction();
    try {
      const material = await Material.create({
        material_name: data.material_name,
        category: data.category || 'raw_material',
        grade: data.grade || null,
        form: data.form || null,
        shape: data.shape || null,
        unit: data.unit || 'Kg',
        density: data.density != null ? data.density : null,
        default_cost: data.default_cost != null ? data.default_cost : 0,
        description: data.description || null,
        company_id: user.company_id,
        created_by: user.id,
      }, { transaction: t });

      // Save vendor mappings
      if (Array.isArray(data.vendors)) {
        for (const vm of data.vendors) {
          if (!vm.vendor_id) continue;
          await MaterialVendorMapping.create({
            material_id: material.id,
            vendor_id: vm.vendor_id,
            price_per_unit: vm.price_per_unit || 0,
            lead_time: vm.lead_time || null,
            is_default: !!vm.is_default,
          }, { transaction: t });
        }
      }

      await t.commit();
      return this.getMaterialById(material.id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async updateMaterial(id, data, user) {
    const t = await sequelize.transaction();
    try {
      const material = await Material.findByPk(id);
      if (!material) throw new Error('Material not found');

      await material.update({
        material_name: data.material_name !== undefined ? data.material_name : material.material_name,
        category: data.category !== undefined ? data.category : material.category,
        grade: data.grade !== undefined ? data.grade : material.grade,
        form: data.form !== undefined ? data.form : material.form,
        shape: data.shape !== undefined ? data.shape : material.shape,
        unit: data.unit !== undefined ? data.unit : material.unit,
        density: data.density !== undefined ? data.density : material.density,
        default_cost: data.default_cost !== undefined ? data.default_cost : material.default_cost,
        description: data.description !== undefined ? data.description : material.description,
      }, { transaction: t });

      // Replace vendor mappings if provided
      if (Array.isArray(data.vendors)) {
        await MaterialVendorMapping.destroy({
          where: { material_id: id },
          transaction: t,
        });
        for (const vm of data.vendors) {
          if (!vm.vendor_id) continue;
          await MaterialVendorMapping.create({
            material_id: id,
            vendor_id: vm.vendor_id,
            price_per_unit: vm.price_per_unit || 0,
            lead_time: vm.lead_time || null,
            is_default: !!vm.is_default,
          }, { transaction: t });
        }
      }

      await t.commit();
      return this.getMaterialById(id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deleteMaterial(id, user) {
    const material = await Material.findByPk(id);
    if (!material) throw new Error('Material not found');
    // Cascade deletes vendor mappings via FK
    await material.destroy();
    return { message: 'Material deleted' };
  }

  async toggleStatus(id) {
    const material = await Material.findByPk(id);
    if (!material) throw new Error('Material not found');
    await material.update({ is_active: !material.is_active });
    return this.getMaterialById(id);
  }
}

module.exports = new MaterialService();
