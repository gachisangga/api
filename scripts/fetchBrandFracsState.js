import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ✅ .env 파일에서 불러올 값들
const { SERVICE_KEY, MONGO_URI } = process.env;

// ✅ MongoDB 스키마 정의
const brandStatsSchema = new mongoose.Schema(
  {
    year: String,
    brandNm: String,
    corpNm: String,
    frcsCnt: Number, // 가맹점 수
    newFrcsRgsCnt: Number, // 신규 등록
    ctrtCncltnCnt: Number, // 계약 해지
    ctrtEndCnt: Number, // 계약 종료
    avrgSlsAmt: Number, // 평균 매출액
    arUnitAvrgSlsAmt: Number, // 면적당 평균 매출액
    indutyLclasNm: String, // 업종 대분류
    indutyMlsfcNm: String, // 업종 중분류
  },
  { collection: "brandStats" }
);

const BrandStats = mongoose.model("BrandStats", brandStatsSchema);

// ✅ items 저장 함수 (frcsCnt >= 50만 저장)
async function saveItems(items) {
  if (!items || items.length === 0) return;

  const filtered = items.filter((item) => Number(item.frcsCnt) >= 50);

  for (const item of filtered) {
    await BrandStats.updateOne(
      { year: item.yr, brandNm: item.brandNm }, // 고유 조건
      {
        $set: {
          year: item.yr,
          brandNm: item.brandNm,
          corpNm: item.corpNm,
          frcsCnt: Number(item.frcsCnt) || 0,
          newFrcsRgsCnt: Number(item.newFrcsRgsCnt) || 0,
          ctrtCncltnCnt: Number(item.ctrtCncltnCnt) || 0,
          ctrtEndCnt: Number(item.ctrtEndCnt) || 0,
          nmChgCnt: Number(item.nmChgCnt) || 0,
          avrgSlsAmt: Number(item.avrgSlsAmt) || 0,
          arUnitAvrgSlsAmt: Number(item.arUnitAvrgSlsAmt) || 0,
          indutyLclasNm: item.indutyLclasNm,
          indutyMlsfcNm: item.indutyMlsfcNm,
        },
      },
      { upsert: true }
    );
  }

  console.log(`✅ 저장 완료: ${filtered.length}/${items.length} (frcsCnt >= 50)`);
}

// ✅ 데이터 가져오기 함수 (병렬 페이지네이션)
async function fetchBrandStats(year = "2023") {
  try {
    const url =
      "https://apis.data.go.kr/1130000/FftcBrandFrcsStatsService/getBrandFrcsStats";

    // 1페이지 호출 → totalCount 확인
    const firstRes = await axios.get(url, {
      params: {
        serviceKey: SERVICE_KEY,
        pageNo: 1,
        numOfRows: 10,
        resultType: "json",
        yr: year,
      },
    });

    const totalCount = Number(firstRes.data?.totalCount) || 0;
    const totalPages = Math.ceil(totalCount / 10);

    console.log(`📊 ${year} 전체 건수: ${totalCount}, 총 ${totalPages} 페이지`);

    // 첫 페이지 저장
    await saveItems(firstRes.data?.items || []);

    // 2페이지 이후 병렬 처리
    const batchSize = 5; // 동시에 5개 페이지 요청
    for (let start = 2; start <= totalPages; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalPages);

      const requests = [];
      for (let pageNo = start; pageNo <= end; pageNo++) {
        requests.push(
          axios.get(url, {
            params: {
              serviceKey: SERVICE_KEY,
              pageNo,
              numOfRows: 10,
              resultType: "json",
              yr: year,
            },
          })
        );
      }

      // 병렬 실행
      const responses = await Promise.all(requests);

      // 각 페이지 데이터 저장
      for (const res of responses) {
        await saveItems(res.data?.items || []);
      }

      console.log(`📦 ${year} ${start}~${end}페이지 저장 완료`);
    }

    console.log(`✅ ${year} 전체 데이터 저장 완료`);
  } catch (err) {
    console.error("❌ API 호출 오류:", err.response?.data || err.message);
  }
}

// 실행 스크립트
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB 연결 성공");

    for (const year of ["2021", "2022", "2023", "2024"]) {
      await fetchBrandStats(year);
    }

    mongoose.connection.close();
    console.log("✅ 모든 작업 완료, 연결 종료");
  } catch (err) {
    console.error("❌ MongoDB 연결 실패:", err.message);
  }
})();
