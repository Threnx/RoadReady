// FILE: models/Competency.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Competency = sequelize.define('Competency', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = Competency;
