const moment = require('moment-timezone');

// Функція для перевірки коректності часу
function validateTime(time) {
  return moment(time, 'HH:mm', true).isValid();
}

// Форматуємо час під конкретний часовий пояс
function formatTimeToTimezone(time, timezone) {
  return moment.tz(time, 'HH:mm', timezone).format('HH:mm');
}

module.exports = {
  validateTime,
  formatTimeToTimezone
};