const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  bizesId: { type: String, unique: true },
  bizesNm: String,
  indsLclsNm: String,
  indsMclsNm: String,
  indsSclsNm: String,
  ksicNm: String,
  flrNo: String,
  hoNo: String,
  rdnmAdr: String,
  lon: Number,
  lat: Number,
});

const buildingSchema = new mongoose.Schema({
  bldMngNo: { type: String, unique: true }, // 건물 고유번호
  bldNm: String,
  adongCd: String,
  adongNm: String,
  rdnmAdr: String,
  lon: Number,
  lat: Number,

  // 점포들을 Building 안에 포함
  stores: [storeSchema],
});

module.exports = mongoose.model('BuildingWithStores', buildingSchema);
