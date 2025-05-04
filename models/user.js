const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const User = sequelize.define('user', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'student' },
  password: { type: DataTypes.STRING, allowNull: false },
  carType: { type: DataTypes.STRING, defaultValue: null },
  lessonPrice: { type: DataTypes.DECIMAL(10,2), defaultValue: null },
  postcode: { type: DataTypes.STRING, defaultValue: null },
  onHoliday: { type: DataTypes.BOOLEAN, defaultValue: false },
  availability: { type: DataTypes.TEXT, defaultValue: null },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  xp: { type: DataTypes.INTEGER, defaultValue: 0 },
  level: { type: DataTypes.INTEGER, defaultValue: 1 },
  badges: { type: DataTypes.TEXT, defaultValue: null }
});

module.exports = User;