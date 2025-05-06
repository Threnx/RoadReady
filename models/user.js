const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const NodeGeocoder = require('node-geocoder');

// Geocoder configuration (using OpenStreetMap)
const geocoder = NodeGeocoder({
  provider: 'openstreetmap'
});

const User = sequelize.define('user', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'student' },
  password: { type: DataTypes.STRING, allowNull: false },
  carType: { type: DataTypes.STRING, defaultValue: null },
  lessonPrice: { type: DataTypes.DECIMAL(10,2), defaultValue: null },
  postcode: { type: DataTypes.STRING, defaultValue: null },
  latitude: { type: DataTypes.FLOAT, defaultValue: null },
  longitude: { type: DataTypes.FLOAT, defaultValue: null },
  onHoliday: { type: DataTypes.BOOLEAN, defaultValue: false },
  availability: { type: DataTypes.TEXT, defaultValue: null },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  xp: { type: DataTypes.INTEGER, defaultValue: 0 },
  level: { type: DataTypes.INTEGER, defaultValue: 1 },
  badges: { type: DataTypes.TEXT, defaultValue: null }
});

// Hook: geocode postcode before saving
User.beforeSave(async (user, options) => {
  if (user.changed('postcode') && user.postcode) {
    try {
      const res = await geocoder.geocode(user.postcode);
      if (res && res.length > 0) {
        user.latitude = res[0].latitude;
        user.longitude = res[0].longitude;
      }
    } catch (err) {
      console.error('Geocoding failed for postcode', user.postcode, err);
    }
  }
});

module.exports = User;
