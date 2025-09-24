// /capstone/api/scripts/recommendFranchise.js
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // ✅ .env에 반드시 추가해야 함
});

/**
 * 업종 분포 데이터를 받아서 추천 프랜차이즈를 생성하는 함수
 * @param {Object} industrySummary - 업종별 매장 개수 요약 데이터
 * @param {Object} coords - { latitude, longitude }
 * @returns {Promise<string>} AI 추천 결과
 */
export async function recommendFranchise(industrySummary, coords) {
  const prompt = `
  사용자가 선택한 위치(${coords.latitude}, ${coords.longitude}) 반경 내 업종 분포는 다음과 같다:
  ${JSON.stringify(industrySummary, null, 2)}

  이 지역의 업종 포화도와 부족 업종을 고려하여,
  개업하면 좋은 프랜차이즈 업종을 2~3개 추천해줘.
  (예: 카페, 편의점, 치킨, 피자, 독서실 등)
  각 추천에는 간단한 이유를 포함해줘.
  `;

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini", // 또는 "gpt-4o"
      messages: [{ role: "user", content: prompt }],
    });

    return res.choices[0].message.content;
  } catch (err) {
    console.error("❌ AI 추천 실패:", err);
    throw err;
  }
}
