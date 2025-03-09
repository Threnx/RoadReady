const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'student' // 'admin', 'instructor', 'student', 'blocked'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  carType: {
    type: DataTypes.STRING,
    defaultValue: null
  },
  lessonPrice: {
    type: DataTypes.DECIMAL(10,2),
    defaultValue: null
  },
  postcode: {
    type: DataTypes.STRING,
    defaultValue: null
  },
  onHoliday: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  availability: {
    type: DataTypes.TEXT, 
    defaultValue: null
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = User;
