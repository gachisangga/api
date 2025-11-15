const mongoose = require('mongoose');

const FranchiseSchema = new mongoose.Schema(
  {
    corpNm: String,
    brandNm: String,
    indutyLclasNm: String,
    indutyMlsfcNm: String,
    yr: String,
    frcsCnt: Number,
    newFrcsRgsCnt: Number,
    ctrtEndCnt: Number,
    ctrtCncltnCnt: Number,
    nmChgCnt: Number,
    avrgSlsAmt: Number,
    arUnitAvrgSlsAmt: Number,
  },
  { collection: "brandStats" }   // 🔹 이 줄만 추가
);
