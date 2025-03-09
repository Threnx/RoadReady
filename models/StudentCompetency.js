// FILE: models/StudentCompetency.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');
const Competency = require('./Competency');

const StudentCompetency = sequelize.define('StudentCompetency', {
  status: {
    type: DataTypes.STRING, // e.g. 'not_started', 'in_progress', 'mastered'
    defaultValue: 'not_started'
  }
});

// Associate
StudentCompetency.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });
StudentCompetency.belongsTo(Competency, { foreignKey: 'competencyId' });

module.exports = StudentCompetency;
