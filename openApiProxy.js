const express = require('express');
const axios = require('axios');
const router = express.Router();

// 행정구역 코드 조회 중계 (/baroApi)
router.get('/baroApi', async (req, res) => {
  try {
    const response = await axios.get('https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi', {
      params: {
        serviceKey: process.env.SERVICE_KEY,
        type: 'json',
        ...req.query
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('/baroApi 중계 오류:', err.message);
    res.status(500).json({ error: '공공데이터 API 요청 실패', detail: err.message });
  }
});

module.exports = router;
