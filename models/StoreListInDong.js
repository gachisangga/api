const mongoose = require('mongoose');

const storeListInDongSchema = new mongoose.Schema({
  bizesId: String,     // 상가업소번호
  bizesNm: String,     // 상호명
  brchNm: String,      // 지점명
  indsLclsCd: String,  // 상권업종대분류코드
  indsLclsNm: String,  // 상권업종대분류명
  indsMclsCd: String,  // 상권업종중분류코드
  indsMclsNm: String,  // 상권업종중분류명
  indsSclsCd: String,  // 상권업종소분류코드
  indsSclsNm: String,  // 상권업종소분류명
  lnoAdr: String,      // 지번주소
  rdnmAdr: String,     // 도로명주소
  signguCd: String,    // 시군구코드
  signguNm: String,    // 시군구명
  adongCd: String,     // 행정동코드
  adongNm: String,     // 행정동명
  lon: String,         // 경도
  lat: String,         // 위도
  stdrDt: String       // 기준일자
}, { collection: 'StoreListInDong' });

module.exports = mongoose.model('StoreListInDong', storeListInDongSchema);
