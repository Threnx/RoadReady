const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Review = sequelize.define('Review', {
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

// A Review belongs to a Student (user with role='student') and an Instructor (user with role='instructor')
Review.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });
Review.belongsTo(User, { as: 'Instructor', foreignKey: 'instructorId' });

User.hasMany(Review, { as: 'ReceivedReviews', foreignKey: 'instructorId' });
User.hasMany(Review, { as: 'WrittenReviews', foreignKey: 'studentId' });

module.exports = Review;
