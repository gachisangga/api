//앱 실행 순서가 지역 → 건물 → 점포 흐름이기 때문에, 
// 건물을 먼저 MongoDB에 저장해 두고, 
// 이후 건물 관리번호를 이용해 점포를 불러와 연결하는 방식으로 설계했다.
//건물만 먼저 저장한 이유는, 건물이 상위 엔터티라서 
// 점포 데이터를 불러오려면 건물 관리번호가 필요하기 때문

const axios = require('axios');
const mongoose = require('mongoose');
const Building = require('../models/StoreListInBuilding');

// MongoDB 연결
mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
  .then(() => console.log('✅ MongoDB 연결 성공'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

async function fetchStoreListInBuilding(bldMngNo) {
  try {
    const response = await axios.get(
      'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInBuilding',
      {
        params: {
          serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
          type: 'json',
          bldMngNo
        }
      }
    );

    const data = response.data;
    console.log(`📦 API 응답 (건물: ${bldMngNo}):`, data);

    const items = data.body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      console.warn(`⚠️ 데이터 없음 (건물: ${bldMngNo})`);
      return;
    }

    // 1️⃣ 건물 정보 저장 (첫 번째 점포의 건물 데이터 활용)
    const first = items[0];
    const building = await Building.findOneAndUpdate(
      { bldMngNo: first.bldMngNo },
      {
        bldMngNo: first.bldMngNo,
        bldNm: first.bldNm,
        adongCd: first.adongCd,
        adongNm: first.adongNm,
        rdnmAdr: first.rdnmAdr,
        lon: first.lon,
        lat: first.lat,
      },
      { upsert: true, new: true }
    );
    console.log("🏢 건물 저장 완료:", building.bldNm || building.bldMngNo);

    // 2️⃣ 점포 정보 저장
    for (let item of items) {
      try {
        await Store.findOneAndUpdate(
          { bizesId: item.bizesId },
          {
            bizesId: item.bizesId,
            bizesNm: item.bizesNm,
            indsLclsNm: item.indsLclsNm,
            indsMclsNm: item.indsMclsNm,
            indsSclsNm: item.indsSclsNm,
            ksicNm: item.ksicNm,
            flrNo: item.flrNo,
            hoNo: item.hoNo,
            rdnmAdr: item.rdnmAdr,
            lon: item.lon,
            lat: item.lat,
            bldMngNo: item.bldMngNo,
          },
          { upsert: true, new: true }
        );
        console.log("✅ 점포 저장 성공:", item.bizesNm);
      } catch (err) {
        console.error("❌ 점포 저장 실패:", item.bizesNm, err.message);
      }
    }

  } catch (err) {
    console.error(`❌ API 오류 (건물: ${bldMngNo}):`, err.response?.data || err.message);
  }
}

// 예시 실행 (소사동 건물 하나)
fetchStoreListInBuilding("4119510600100800083014589").then(() => mongoose.disconnect());
