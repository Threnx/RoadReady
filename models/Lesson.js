const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Lesson = sequelize.define('Lesson', {
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'upcoming'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

User.hasMany(Lesson, { as: 'InstructorLessons', foreignKey: 'instructorId' });
Lesson.belongsTo(User, { as: 'Instructor', foreignKey: 'instructorId' });

User.hasMany(Lesson, { as: 'StudentLessons', foreignKey: 'studentId' });
Lesson.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });

module.exports = Lesson;
