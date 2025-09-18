//상점 단위 데이터 전부 모음 = storeList 계열
const axios = require('axios');
const mongoose = require('mongoose');
const StoreListInDong = require('../models/StoreListInDong');

// MongoDB 연결
mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
  .then(() => console.log('✅ MongoDB 연결 성공'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

// 소사동 코드 (행정동 코드)
const SOSA_DONG_CODE = '41192560';  // 소사동 코드

async function fetchStoreListInDong(params = {}) {
  try {
    const response = await axios.get(
      'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong',
      {
        params: {
          serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
          type: 'json',
          pageNo: 1,
          numOfRows: 1000,     // 한 번에 최대치
          divId: 'adongCd',    // 행정동 코드 기준
          key: SOSA_DONG_CODE,
          ...params
        }
      }
    );

    const data = response.data;
    const items = data.body?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      console.error('⚠️ 가져온 데이터 없음:', data);
      return;
    }

    for (let item of items) {
      try {
        const store = new StoreListInDong(item);
        await store.save();
        console.log("✅ 저장 성공:", item.bizesNm, `(${item.adongNm})`);
      } catch (err) {
        console.error("❌ 저장 실패:", item, err.message);
      }
    }

    console.log('🎉 소사동 데이터 저장 완료!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ 데이터 수집 오류:', err.response?.data || err.message);
    await mongoose.disconnect();
  }
}

// 실행
fetchStoreListInDong();
