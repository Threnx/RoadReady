const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./user');

const Notification = sequelize.define('Notification', {
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

Notification.belongsTo(User, { as: 'User', foreignKey: 'userId' });
User.hasMany(Notification, { as: 'Notifications', foreignKey: 'userId' });

module.exports = Notification;
