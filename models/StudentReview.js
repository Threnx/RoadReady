// models/StudentReview.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const StudentReview = sequelize.define('StudentReview', {
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min:1, max:5 }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

// A student review is written by an instructor about a student
StudentReview.belongsTo(User, { as: 'Instructor', foreignKey: 'instructorId' });
StudentReview.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });

User.hasMany(StudentReview, { as: 'InstructorStudentReviews', foreignKey: 'instructorId' });
User.hasMany(StudentReview, { as: 'ReceivedStudentReviews', foreignKey: 'studentId' });

module.exports = StudentReview;
