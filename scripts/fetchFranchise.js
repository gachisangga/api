const axios = require('axios');
const mongoose = require('mongoose');
const Franchise = require('../models/franchise');

// MongoDB 연결
mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
  .then(() => console.log('MongoDB 연결 성공'))
  .catch(err => console.error('MongoDB 연결 실패:', err));

async function fetchAndSaveFranchise(year) {
  try {
    let pageNo = 1;
    const numOfRows = 500; // 한 번에 가져올 개수 (최대 1000까지 가능)
    let totalCount = 0;
    let savedCount = 0;

    do {
      const response = await axios.get(
        'https://apis.data.go.kr/1130000/FftcBrandFrcsStatsService/getBrandFrcsStats',
        {
          params: {
            serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
            pageNo,
            numOfRows,
            resultType: 'json',
            yr: year
          }
        }
      );

      const data = response.data;
      totalCount = Number(data.totalCount);

      const items = data.items || [];
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`⚠️ 페이지 ${pageNo}: 데이터 없음`);
        break;
      }

      console.log(`📄 페이지 ${pageNo} 처리 중 (총 ${totalCount}건)`);

      for (let item of items) {
        try {
          const franchise = new Franchise({
            corpNm: item.corpNm,
            brandNm: item.brandNm,
            indutyLclasNm: item.indutyLclasNm,
            indutyMlsfcNm: item.indutyMlsfcNm,
            yr: item.yr,
            frcsCnt: Number(item.frcsCnt),
            newFrcsRgsCnt: Number(item.newFrcsRgsCnt),
            ctrtEndCnt: Number(item.ctrtEndCnt),
            ctrtCncltnCnt: Number(item.ctrtCncltnCnt),
            nmChgCnt: Number(item.nmChgCnt),
            avrgSlsAmt: Number(item.avrgSlsAmt),
            arUnitAvrgSlsAmt: Number(item.arUnitAvrgSlsAmt)
          });

          await franchise.save();
          savedCount++;
          console.log(`✅ 저장 성공: ${item.brandNm}`);
        } catch (err) {
          console.error(`❌ 저장 실패: ${item.brandNm}`, err.message);
        }
      }

      pageNo++;
    } while ((pageNo - 1) * numOfRows < totalCount);

    console.log(`🎉 전체 완료! 총 ${savedCount}건 저장됨.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('데이터 수집 오류:', err.response?.data || err.message);
    await mongoose.disconnect();
  }
}

fetchAndSaveFranchise('2023');
