const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Message = sequelize.define('Message', {
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  }
});

// A message has a sender and a recipient, both are Users.
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Recipient', foreignKey: 'recipientId' });

// For convenience, let's say:
// A User can send many messages
User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
// A User can receive many messages
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'recipientId' });

module.exports = Message;
