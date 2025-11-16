// scripts/enrich-areas-with-coords.js
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

// __dirname 흉내 (ESM에서는 직접 만들어야 함)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 로드 (api/.env 기준)
dotenv.config({ path: path.join(__dirname, "../.env") });

const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
if (!KAKAO_REST_KEY) {
  console.error("KAKAO_REST_KEY 가 .env에 없습니다.");
  process.exit(1);
}

const inputPath = path.join(__dirname, "../areas-82.json");
const outputPath = path.join(__dirname, "../areas-82-with-coords.json");

// 원본 areas-82.json 읽기
const areas = JSON.parse(fs.readFileSync(inputPath, "utf8"));

async function geocode(name) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const query = `서울 ${name}`; // 서울 + 상권명으로 검색

  const { data } = await axios.get(url, {
    params: { query, size: 1 },
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });

  const doc = data.documents?.[0];
  if (!doc) return null;

  // Kakao: x = 경도(lng), y = 위도(lat)
  return {
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
  };
}

async function main() {
  const enriched = [];

  for (const a of areas) {
    try {
      console.log("geocoding:", a.AREA_NM);
      const coord = await geocode(a.AREA_NM);

      if (!coord) {
        console.warn("  -> 좌표 못 찾음, 원본 그대로 유지");
        enriched.push(a);
      } else {
        enriched.push({
          ...a,
          lat: coord.lat,
          lng: coord.lng,
        });
      }
    } catch (e) {
      console.error("  에러:", e.message);
      enriched.push(a);
    }

    // 카카오 API 너무 털지 않게 살짝 딜레이
    await new Promise((r) => setTimeout(r, 200));
  }

  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), "utf8");
  console.log("완료. 결과 파일:", outputPath);
}

main().catch((e) => {
  console.error("스크립트 전체 에러:", e);
  process.exit(1);
});
