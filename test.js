const schedule = require('node-schedule');
const now = new Date();
const testDate = new Date(now.getTime() + 5000); // 5 секунд у майбутньому

schedule.scheduleJob(testDate, function () {
  console.log('Тестове нагадування!');
});
