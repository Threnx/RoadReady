const { Sequelize } = require('sequelize');

// Initialize a Sequelize instance with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite' // This will create a file named database.sqlite in your project
});

module.exports = sequelize;
