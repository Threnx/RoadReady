// db.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  // Production / Railway Postgres
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      // if your host requires SSL:
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false,  // or console.log if you want SQL logs
  });
} else {
  // Local development with SQLite
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite',
    logging: false
  });
}

module.exports = sequelize;
