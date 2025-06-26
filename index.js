const cron = require('node-cron');
const overAllData = require('./overAllData');

cron.schedule('0 0 * * *', () => {
  console.log('Running overAllData at midnight');
  overAllData();
}, {
  scheduled: true,
  timezone: 'Asia/Calcutta'
});

console.log('Cron job scheduled to run daily at midnight.');