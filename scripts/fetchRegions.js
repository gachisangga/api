const axios = require('axios');
const mongoose = require('mongoose');
const Region = require('../models/Regions'); // ✅ Store 대신 Region 모델 사용

// MongoDB 연결
mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
  .then(() => console.log('MongoDB 연결 성공'))
  .catch(err => console.error('MongoDB 연결 실패:', err));

async function fetchAndSaveRegion(endpoint, params = {}) {
  try {
    const response = await axios.get(
      `https://apis.data.go.kr/B553077/api/open/sdsc2${endpoint}`,
      {
        params: {
          serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
          type: 'json',
          ...params
        }
      }
    );

    const data = response.data;
    console.log('API 응답:', data);

    const items = data.body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      console.error('⚠️ 가져온 데이터 없음:', data);
      return;
    }

    // ✅ 소사동(adongCd=41192560) 필터링
    const filtered = items.filter(item => item.adongCd === '41192560');

    if (filtered.length === 0) {
      console.error('❌ 소사동 데이터 없음');
      return;
    }

    for (let item of filtered) {
      try {
        const region = new Region({
          ctprvnCd: item.ctprvnCd,
          ctprvnNm: item.ctprvnNm,
          signguCd: item.signguCd,
          signguNm: item.signguNm,
          adongCd: item.adongCd,
          adongNm: item.adongNm,
          IdongCd: item.IdongCd,
          IdongNm: item.IdongNm,
          stdrDt: item.stdrDt,
        });

        await region.save();
        console.log("✅ 저장 성공:", item.adongNm, `(${item.adongCd})`);
      } catch (err) {
        console.error("❌ 저장 실패:", item, err.message);
      }
    }

    console.log('🎉 소사동 데이터 저장 완료!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('데이터 수집 오류:', err.response?.data || err.message);
    await mongoose.disconnect();
  }
}

// 👉 실행: 소사동만 저장
fetchAndSaveRegion('/baroApi', { resId: 'dong', catId: 'admi' });
