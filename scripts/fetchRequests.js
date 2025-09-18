const axios = require("axios");

const indsCodes = {
  "G2": ["G201", "G202", "G212", "G222"],  // 소매업
  "I2": ["I201", "I202", "I203", "I205"],  // 음식업
  "S2": ["S207", "S208", "S203"]           // 수리·개인
};

async function fetchStoreListInUpjong() {
  const serviceKey = "fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25"; // 🔑

  for (const [lcls, mclsList] of Object.entries(indsCodes)) {
    for (const mcls of mclsList) {
      try {
        const response = await axios.get(
          "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong",
          {
            params: {
              serviceKey,
              type: "json",
              ctprvnCd: "41",   // 경기도
              signguCd: "41192", // 부천시 원미구
              adongCd: "41192560", // 소사동
              indsLclsCd: lcls,
              indsMclsCd: mcls
            }
          }
        );

        console.log(`✅ ${lcls} - ${mcls} 응답:`, response.data);
      } catch (err) {
        console.error(`❌ ${lcls} - ${mcls} 실패:`, err.message);
      }
    }
  }
}

fetchStoreListInUpjong();
