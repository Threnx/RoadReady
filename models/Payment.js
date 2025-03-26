// models/payment.js
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./user');
const Lesson = require('./lesson');

const Payment = sequelize.define('Payment', {
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'completed' // In a real scenario, you might have 'pending', 'completed', 'failed', etc.
  }
});

// Associations
// A payment belongs to a single student (User with role='student')
Payment.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });
// A student can have many payments
User.hasMany(Payment, { as: 'StudentPayments', foreignKey: 'studentId' });

// A payment belongs to a lesson
Payment.belongsTo(Lesson, { as: 'Lesson', foreignKey: 'lessonId' });
// A lesson can have many payments (though typically just one in this scenario)
Lesson.hasMany(Payment, { as: 'Payments', foreignKey: 'lessonId' });

module.exports = Payment;
