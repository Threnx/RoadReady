// models/InstructorStudent.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

/**
 * This model tracks the relationship (roster) between an instructor and a student.
 * Fields:
 * - instructorId (FK to User with role='instructor')
 * - studentId (FK to User with role='student')
 * - status: 'pending', 'accepted', 'declined'
 * - message: optional message from instructor when declining, or from student
 */
const InstructorStudent = sequelize.define('InstructorStudent', {
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending' // can be 'pending', 'accepted', 'declined'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

User.hasMany(InstructorStudent, { as: 'InstructorRoster', foreignKey: 'instructorId' });
InstructorStudent.belongsTo(User, { as: 'Instructor', foreignKey: 'instructorId' });

User.hasMany(InstructorStudent, { as: 'StudentRoster', foreignKey: 'studentId' });
InstructorStudent.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });

module.exports = InstructorStudent;
