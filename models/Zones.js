//상권 단위 정보 → storeZoneInRectangle

// models/Zone.js
const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  trarNo: String,       // 상권 코드
  ctprvnCd: String,     // 시도 코드
  ctprvnNm: String,     // 시도명
  signguCd: String,     // 시군구 코드
  signguNm: String,     // 시군구명
  coordNum: String,     // 좌표 개수
  stdrDt: String,       // 기준일자
  description: String,  
  resultCode: String,   
  resultMsg: String,
  mainTrarNm: String,   // 대표 상권명
  trarArea: String,     // 상권 면적
  coords: String        // 좌표값
}, { timestamps: true });

module.exports = mongoose.model('Zone', zoneSchema);
