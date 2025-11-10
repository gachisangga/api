// server.js
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { z } from "zod";

/** ====== 환경설정 ====== */
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "yourdb";
const PORT = process.env.PORT || 3000;

/** ====== Mongo 연결 ====== */
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(DB_NAME);

/** ====== 앱 기본 설정 ====== */
const app = express();
app.use(cors());
app.use(express.json());

/** ====== 요청 스키마 (coerce로 문자열도 숫자로 허용) ====== */
const ReqSchema = z.object({
  lat: z.coerce.number(),        // "37.5"도 OK
  lng: z.coerce.number(),
  admmCd: z.string().optional(), // 행정동 코드
  areaCd: z.string().optional(), // 상권 코드(있으면 seoulCmrclRaws 조회)
  radius: z.coerce.number().int().positive().max(1500).optional().default(300),
  topK: z.coerce.number().int().positive().max(10).optional().default(5),
  // 프론트에서 온 반경 내 상가 배열
  pois: z.array(z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    indsLclsNm: z.string().nullable().optional(), // 대분류
    indsMclsNm: z.string().nullable().optional(), // 중분류
    indsSclsNm: z.string().nullable().optional(), // 소분류
    signguNm: z.string().nullable().optional(),
    adongCd: z.string().nullable().optional(),
    ldongCd: z.string().nullable().optional(),
  })).nonempty(),
});

/** ====== 유틸 ====== */
function entropyFromCounts(counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.reduce((e, c) => {
    if (!c) return e;
    const p = c / total;
    return e - p * Math.log(p);
  }, 0);
}
const safeRate = (n, d) => (d > 0 ? n / d : 0);

/** ====== 베이스라인 가중치 (필요하면 숫자만 조정) ====== */
const WEIGHTS = {
  "카페/디저트": { w20s: 0.7, w30s: 0.3, wf: 0.3, wLvl: 0.4, wPay: 0.4, wEnt: 0.2, wComp: 1.0 },
  "한식":        { w20s: 0.0, w30s: 0.2, wf: 0.0, wLvl: 0.3, wPay: 0.3, wEnt: 0.1, wComp: 1.0 },
  "분식":        { w20s: 0.6, w30s: 0.2, wf: 0.0, wLvl: 0.2, wPay: 0.3, wEnt: 0.2, wComp: 1.0 },
  "패스트푸드":   { w20s: 0.6, w30s: 0.2, wf: 0.0, wLvl: 0.2, wPay: 0.3, wEnt: 0.2, wComp: 1.0 },
  "편의점":      { w20s: 0.2, w30s: 0.2, wf: 0.0, wLvl: 0.5, wPay: 0.5, wEnt: 0.1, wComp: 1.0 },
  "뷰티/미용":    { w20s: 0.2, w30s: 0.2, wf: 0.6, wLvl: 0.2, wPay: 0.2, wEnt: 0.2, wComp: 1.0 },
};
const DEFAULT_W = { w20s: 0.2, w30s: 0.2, wf: 0.1, wLvl: 0.2, wPay: 0.2, wEnt: 0.1, wComp: 1.0 };

function scoreByCategory(features, poiByCate) {
  const {
    rate_20s, rate_30s, female_rate,
    cmrcl_level, pay_cnt_log, poi_entropy,
  } = features;

  const total = Object.values(poiByCate).reduce((a, b) => a + b, 0) || 1;

  const categories = Object.keys(poiByCate).length
    ? Object.keys(poiByCate)   // 주변에 있는 업종 우선
    : Object.keys(WEIGHTS);    // 없으면 사전 정의 셋

  const scores = {};
  for (const cate of categories) {
    const w = WEIGHTS[cate] || DEFAULT_W;
    const competition = poiByCate[cate] || 0;
    const compPenalty = Math.max(0, 1 - competition / total); // 동종 많으면 ↓

    const s =
      w.w20s * rate_20s +
      w.w30s * rate_30s +
      w.wf   * female_rate +
      w.wLvl * cmrcl_level +
      w.wPay * pay_cnt_log +
      w.wEnt * poi_entropy;

    // compPenalty=1 → 그대로, 0 → 패널티
    scores[cate] = s * (1 + (w.wComp * compPenalty - w.wComp));
  }
  return scores;
}

/** ====== DB 조회 ====== */
async function getLatestCommerce(areaCd) {
  if (!areaCd) return null;
  return await db.collection("seoulCmrclRaws")
    .find({ areaCd })
    .sort({ cmrclTime: -1 })
    .limit(1)
    .next();
}

async function getLatestPopulation(admmCd, fallbackSggNm) {
  const col = db.collection("population_stats");
  if (admmCd) {
    const d = await col.find({ admmCd }).sort({ statsYm: -1 }).limit(1).next();
    if (d) return d;
  }
  if (fallbackSggNm) {
    const d = await col.find({ sggNm: fallbackSggNm }).sort({ statsYm: -1 }).limit(1).next();
    if (d) return d;
  }
  return await col.find({ admmCd: "1111000000" }).sort({ statsYm: -1 }).limit(1).next(); // 서울 전체 폴백
}

/** ====== 라우트 ====== */
// 헬스체크
app.get("/health", (_req, res) => res.json({ ok: true }));

// 업종 Top-N 추천
app.post("/api/v1/recommendations", async (req, res) => {
  try {
    const { lat, lng, radius, admmCd, areaCd, topK, pois } = ReqSchema.parse(req.body);

    // 1) POI 요약 (프론트 배열로 집계)
    const byCate = {};
    for (const p of pois) {
      const cateRaw = p?.indsLclsNm ?? "기타";
      const cate = (typeof cateRaw === "string" ? cateRaw : "기타").trim();
      byCate[cate] = (byCate[cate] || 0) + 1;
    }
    const counts = Object.values(byCate);
    const poi_total = counts.reduce((a, b) => a + b, 0);
    const poi_entropy = entropyFromCounts(counts);

    // 2) 실시간 상권 (옵션)
    const cmr = await getLatestCommerce(areaCd);
    const cmrcl_level = cmr?.areaCmrclLvl ?? 0;
    const pay_cnt_log = Math.log((cmr?.areaShPaymentCnt ?? 0) + 1);

    // 3) 인구 (행정동 없으면, POI에서 sggNm 폴백)
    const sggNmFallback = pois.find((p) => p?.signguNm)?.signguNm || undefined;
    const demo = await getLatestPopulation(admmCd, sggNmFallback);

    const pop_total = demo?.totNmprCnt ?? 0;
    const sum = (ks) => ks.reduce((acc, k) => acc + (demo?.[k] ?? 0), 0);
    const cnt20 = sum(["male20AgeNmprCnt", "feml20AgeNmprCnt"]);
    const cnt30 = sum(["male30AgeNmprCnt", "feml30AgeNmprCnt"]);
    const female_total = demo?.femlNmprCnt ?? 0;

    const rate_20s = safeRate(cnt20, pop_total);
    const rate_30s = safeRate(cnt30, pop_total);
    const female_rate = safeRate(female_total, pop_total);

    // 4) feature vector
    const featureVector = {
      lat, lng, radius,
      pop_total,
      rate_20s, rate_30s, female_rate,
      cmrcl_level, pay_cnt_log,
      poi_entropy, poi_total,
    };

    // 5) 스코어링 → Top-K
    const scored = scoreByCategory(featureVector, byCate);
    const topCategories = Object.entries(scored)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([category, score]) => ({ category, score }));

    // 6) 응답
    res.json({
      topCategories,
      debug: {
        inputs: { lat, lng, radius, admmCd: admmCd || null, areaCd: areaCd || null },
        poi: { byCate, poi_total, poi_entropy },
        commerce: cmr ? {
          areaCd: cmr.areaCd,
          cmrclTime: cmr.cmrclTime,
          areaCmrclLvl: cmr.areaCmrclLvl,
          areaShPaymentCnt: cmr.areaShPaymentCnt
        } : null,
        demographics: demo ? {
          admmCd: demo.admmCd,
          sggNm: demo.sggNm,
          statsYm: demo.statsYm,
          totNmprCnt: demo.totNmprCnt
        } : null,
        featureVector,
      }
    });
  } catch (err) {
    console.error(err);
    // Zod 스키마 에러면 400으로 보냄
    res.status(400).json({ error: err?.issues ?? String(err) });
  }
});

/** ====== 서버 시작 ====== */
app.listen(PORT, () => {
  console.log(`recommend API running on http://localhost:${PORT}`);
});
