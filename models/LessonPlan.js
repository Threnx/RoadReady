// models/LessonPlan.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./user');

/**
 * A LessonPlan is created by an instructor for a student.
 * Fields:
 * - title
 * - content
 * - instructorId
 * - studentId
 */
const LessonPlan = sequelize.define('LessonPlan', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

User.hasMany(LessonPlan, { as: 'InstructorPlans', foreignKey: 'instructorId' });
LessonPlan.belongsTo(User, { as: 'Instructor', foreignKey: 'instructorId' });

User.hasMany(LessonPlan, { as: 'StudentPlans', foreignKey: 'studentId' });
LessonPlan.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });

module.exports = LessonPlan;
