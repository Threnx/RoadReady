// FILE: models/competency.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Competency = sequelize.define('competency', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = Competency;
