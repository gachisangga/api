//행정구역 코드 → baroApi

//상점 단위 데이터 전부 모음 → storeList~ 계열

// models/Regions.js
const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
  ctprvnCd: String,   // 시도 코드
  ctprvnNm: String,   // 시도명
  signguCd: String,   // 시군구 코드
  signguNm: String,   // 시군구명
  adongCd: String,    // 행정동 코드
  adongNm: String,    // 행정동명
  IdongCd: String,    // 법정동 코드
  IdongNm: String,    // 법정동명
  stdrDt: String,     // 기준일자
  description: String,
  columns: String,
  resultCode: String,
  resultMsg: String,
}, { timestamps: true });

// ✅ 스키마 변수(regionSchema)를 정확히 지정해야 함
module.exports = mongoose.model('Region', regionSchema);
