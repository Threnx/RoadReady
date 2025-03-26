// FILE: models/studentcompetency.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./user');
const Competency = require('./competency');

const studentcompetency = sequelize.define('studentsompetency', {
  status: {
    type: DataTypes.STRING, // e.g. 'not_started', 'in_progress', 'mastered'
    defaultValue: 'not_started'
  }
});

// Associate
studentcompetency.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });
studentcompetency.belongsTo(Competency, { foreignKey: 'competencyId' });

module.exports = studentcompetency;
