const express = require('express');
const connectDB = require('./db');
const dotenv = require('dotenv');
const openApiProxy = require('./openApiProxy'); // 추가

dotenv.config();

const app = express();
app.set('port', process.env.PORT || 3000);

// MongoDB 연결
connectDB();

// 기본 라우트
app.get('/', (req, res) => {
  res.send('Hello, Express');
});

// 공공데이터 중계 API 라우터 연결
app.use('/api/open', openApiProxy);

app.listen(app.get('port'), () => {
  console.log(app.get('port'), '번 포트에서 대기 중');
});
