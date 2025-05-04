const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Lesson = sequelize.define('lesson', {
  date: { type: DataTypes.DATE, allowNull: false },
  endDate: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'upcoming' },
  notes: { type: DataTypes.TEXT, allowNull: true }
});

module.exports = Lesson;