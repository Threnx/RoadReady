// FILE: db.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL || {
  dialect: 'sqlite',
  storage: 'database.sqlite'
}, {
  dialect: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
  logging: false
});

module.exports = sequelize;