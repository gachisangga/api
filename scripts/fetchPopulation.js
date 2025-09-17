// // scripts/fetchPopulation.js
// const axios = require('axios');
// const mongoose = require('mongoose');
// const Population = require('../models/Population'); // scripts에서 한 단계 위 models 폴더

// // MongoDB 연결
// mongoose.connect('mongodb+srv://jiwoodbUser:ESjipZDHM8NNxjnC@capstonedb.yax4eou.mongodb.net/CapstoneDB')
//   .then(() => console.log('MongoDB 연결 성공'))
//   .catch(err => console.error('MongoDB 연결 실패:', err));

// async function fetchAndSavePopulation() {
//   try {
//     // 👉 axios.get에 params 옵션 사용
//     const response = await axios.get('https://apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn', {
//       params: {
//         // serviceKey: 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25',
//         // admmCd: '11110',       // 예: 종로구
//         // srchFrYm: '202406',    // 시작 연월
//         // srchToYm: '202408',    // 종료 연월
//         // lv:'2',
//         // regSeCd:'1',
//         // type: 'json',          // JSON 응답 강제
//         // numOfRows: 100,
//         // pageNo: 1
//       },
//       headers: {
//         'Accept': 'application/json' // JSON으로 받기 위해 헤더 추가
//       }
//     });

//     console.log('API 응답:', response.data); // 응답 확인용 로그

//     // API 응답이 JSON이면 바로 items.item 접근
//     const items = response.data.items?.item;
//     if (!items) {
//       console.error('API에서 item이 없음:', response.data);
//       return;
//     }

//     const itemArray = Array.isArray(items) ? items : [items];

//     for (let item of itemArray) {
//       const population = new Population({
//         statsYm: item.statsYm,
//         admmCd: item.admmCd,
//         ctpvNm: item.ctpvNm,
//         sggNm: item.sggNm,
//         dongNm: item.dongNm,
//         tong: item.tong,
//         ban: item.ban,

//         totNmprCnt: Number(item.totNmprCnt),
//         maleNmprCnt: Number(item.maleNmprCnt),
//         femlNmprCnt: Number(item.femlNmprCnt),

//         maleAge: {
//           "0": Number(item.male0AgeNmprCnt),
//           "10": Number(item.male10AgeNmprCnt),
//           "20": Number(item.male20AgeNmprCnt),
//           "30": Number(item.male30AgeNmprCnt),
//           "40": Number(item.male40AgeNmprCnt),
//           "50": Number(item.male50AgeNmprCnt),
//           "60": Number(item.male60AgeNmprCnt),
//           "70": Number(item.male70AgeNmprCnt),
//           "80": Number(item.male80AgeNmprCnt),
//           "90": Number(item.male90AgeNmprCnt),
//           "100": Number(item.male100AgeNmprCnt)
//         },

//         femlAge: {
//           "0": Number(item.feml0AgeNmprCnt),
//           "10": Number(item.feml10AgeNmprCnt),
//           "20": Number(item.feml20AgeNmprCnt),
//           "30": Number(item.feml30AgeNmprCnt),
//           "40": Number(item.feml40AgeNmprCnt),
//           "50": Number(item.feml50AgeNmprCnt),
//           "60": Number(item.feml60AgeNmprCnt),
//           "70": Number(item.feml70AgeNmprCnt),
//           "80": Number(item.feml80AgeNmprCnt),
//           "90": Number(item.feml90AgeNmprCnt),
//           "100": Number(item.feml100AgeNmprCnt)
//         }
//       });

//       await population.save();
//     }

//     console.log('데이터 저장 완료!');
//     mongoose.connection.close();
//   } catch (err) {
//     console.error('데이터 수집 오류:', err.response?.data || err.message);
//   }
// }

// fetchAndSavePopulation();
