//대/중/소 업종 코드 → large/middle/smallUpjongListconst mongoose = require('mongoose');

const storeListInUpjongSchema = new mongoose.Schema({
  bizesId: String,       // 상가업소 ID
  bizesNm: String,       // 상호명
  brchNm: String,        // 지점명
  indsLclsCd: String,    // 대분류 코드
  indsLclsNm: String,    // 대분류명
  indsMclsCd: String,    // 중분류 코드
  indsMclsNm: String,    // 중분류명
  indsSclsCd: String,    // 소분류 코드
  indsSclsNm: String,    // 소분류명
  ksicCd: String,        // 표준산업분류 코드
  ksicNm: String,        // 표준산업분류명
  ctprvnCd: String,      // 시도 코드
  ctprvnNm: String,      // 시도 명
  signguCd: String,      // 시군구 코드
  signguNm: String,      // 시군구 명
  adongCd: String,       // 행정동 코드
  adongNm: String,       // 행정동 명
  ldongCd: String,       // 법정동 코드
  ldongNm: String,       // 법정동 명
  lnoCd: String,         // 지번코드
  plotSctCd: String,     // 대지구분 코드
  plotSctNm: String,     // 대지구분 명
  lnoMnno: Number,       // 지번 본번
  lnoSlno: Number,       // 지번 부번
  lnoAdr: String,        // 지번 주소
  rdnmCd: String,        // 도로명 코드
  rdnm: String,          // 도로명
  bldMnno: String,       // 건물 본번
  bldSlno: String,       // 건물 부번
  bldMngNo: String,      // 건물 관리번호
  bldNm: String,         // 건물명
  rdnmAdr: String,       // 도로명 주소
  oldZipcd: String,      // 구우편번호
  newZipcd: String,      // 신우편번호
  lon: Number,           // 경도
  lat: Number            // 위도
}, { collection: 'StoreListInUpjong' });

module.exports = mongoose.model('StoreListInUpjong', storeListInUpjongSchema);
