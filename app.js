const express = require('express');
const mongoose = require('mongoose');

const app = express();

app.set('port', process.env.PORT || 3000);

app.get('/', (req, res) => {
    res.send('Hello, Express')
});

app.listen(app.get('port'), ()=>{
    console.log(app.get('port'), '번 포트에서 대기 중')
});

// 몽고DB 연결
mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/capstonedb?retryWrites=true&w=majority')
  .then(() => console.log('MongoDB가 연결되었다...!'))
  .catch((err) => console.log('MongoDB 연결 실패:', err));
