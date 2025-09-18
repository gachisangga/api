// //상권 단위 정보 → storeZoneInRectangle)

// const axios = require('axios');
// const mongoose = require('mongoose');
// const Zone = require('../models/Zone');

// // MongoDB 연결
// mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
//   .then(() => console.log('MongoDB 연결 성공'))
//   .catch(err => console.error('MongoDB 연결 실패:', err));

// async function fetchAndSaveZones(params = {}) {
//   try {
//     const response = await axios.get(
//       'https://apis.data.go.kr/B553077/api/open/sdsc2/storeZoneInRectangle',
//       {
//         params: {
//           serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
//           type: 'json',
//           ...params
//         }
//       }
//     );

//     const data = response.data;
//     console.log('API 응답:', data);

//     const items = data.body?.items || [];
//     if (!Array.isArray(items) || items.length === 0) {
//       console.error('⚠️ 가져온 데이터 없음:', data);
//       return;
//     }

//     for (let item of items) {
//       try {
//         const zone = new Zone({
//           trarNo: item.trarNo,
//           ctprvnCd: item.ctprvnCd,
//           ctprvnNm: item.ctprvnNm,
//           signguCd: item.signguCd,
//           signguNm: item.signguNm,
//           coordNum: item.coordNum,
//           stdrDt: item.stdrDt,
//           description: item.description,
//           resultCode: item.resultCode,
//           resultMsg: item.resultMsg,
//           mainTrarNm: item.mainTrarNm,
//           trarArea: item.trarArea,
//           coords: item.coords
//         });

//         await zone.save();
//         console.log("✅ 저장 성공:", item.mainTrarNm || item.trarNo);
//       } catch (err) {
//         console.error("❌ 저장 실패:", item, err.message);
//       }
//     }

//     console.log('🎉 데이터 저장 완료!');
//     await mongoose.disconnect();
//   } catch (err) {
//     console.error('데이터 수집 오류:', err.response?.data || err.message);
//     await mongoose.disconnect();
//   }
// }

// // 예시 실행
// fetchAndSaveZones({
//   minx: 126.75,   // 서쪽 경도
//   miny: 37.43,    // 남쪽 위도
//   maxx: 126.80,   // 동쪽 경도
//   maxy: 37.48     // 북쪽 위도
// });


// 원형 반경으로 상권 조사하는 건 /storeListInRadius 이거로 대체하기!!!!