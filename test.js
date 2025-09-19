const axios = require('axios');

const API_BASE = 'https://apis.data.go.kr/B553077/api/open/sdsc2';
const SERVICE_KEY = 'fe47853c17d4d907eeeb757ec0c1a4ddafeea523709c2be90ecdee9e9b99cd25';

// 👉 /baroApi 요청 테스트
async function fetchBaroApi(params) {
  try {
    const res = await axios.get(`${API_BASE}/baroApi`, {
      params: { ServiceKey: SERVICE_KEY, type: 'json', ...params }
    });
    console.log("📌 /baroApi 응답 확인:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("❌ /baroApi 오류:", err.message);
  }
}

// 👉 /storeListInDong 요청 테스트
async function fetchStoreListInDong(params) {
  try {
    const res = await axios.get(`${API_BASE}/storeListInDong`, {
      params: { ServiceKey: SERVICE_KEY, type: 'json', ...params }
    });
    console.log("📌 /storeListInDong 응답 확인:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("❌ /storeListInDong 오류:", err.message);
  }
}

// 테스트 실행
(async () => {
  await fetchBaroApi({ resId: 'dong123', catId: 'admi' });
  await fetchStoreListInDong({ pageNo: 1, numOfRows: 5, divId: 'adongCd', key: '11110' });
})();
