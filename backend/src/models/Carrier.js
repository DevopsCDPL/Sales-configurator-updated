const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Carrier = sequelize.define('Carrier', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },

        carrier: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
    }, {
        tableName: 'carriers',
        timestamps: false,
    }
    );

    return Carrier;
}

// module.exports = Carrier;