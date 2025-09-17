const mongoose = require('mongoose');

const FranchiseSchema = new mongoose.Schema({
  corpNm: String,          // 회사명
  brandNm: String,         // 브랜드명
  indutyLclasNm: String,   // 업종 대분류
  indutyMlsfcNm: String,   // 업종 중분류
  yr: String,              // 연도

  frcsCnt: Number,         // 가맹점 수
  newFrcsRgsCnt: Number,   // 신규등록 가맹점 수
  ctrtEndCnt: Number,      // 계약 종료 수
  ctrtCncltnCnt: Number,   // 계약 해지 수
  nmChgCnt: Number,        // 상호 변경 수

  avrgSlsAmt: Number,      // 평균 매출
  arUnitAvrgSlsAmt: Number // 면적당 평균 매출
});

module.exports = mongoose.model('Franchise', FranchiseSchema);
