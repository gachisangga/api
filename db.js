const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(
      'mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/capstonedb?retryWrites=true&w=majority'
    );
    console.log('✅ MongoDB 연결 성공');
  } catch (err) {
    console.error('❌ MongoDB 연결 실패:', err);
  }
}

module.exports = connectDB;
