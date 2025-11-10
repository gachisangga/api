// routes/recommend.js
import { Router } from "express";
import { MongoClient } from "mongodb";
import { z } from "zod";
import "dotenv/config";

const router = Router();

/** ====== Mongo 연결 (싱글톤) ====== */
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "yourdb";
const client = new MongoClient(MONGO_URI, { maxPoolSize: 5 });
let db;
async function getDB() {
  if (!db) {
    await client.connect();
    db = client.db(DB_NAME);
  }
  return db;
}

/** ====== 요청 스키마 ====== */
const ReqSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  admmCd: z.string().optional(),
  areaCd: z.string().optional(),
  radius: z.coerce.number().int().positive().max(1500).optional().default(300),
  topK: z.coerce.number().int().positive().max(10).optional().default(5),
  pois: z.array(z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    indsLclsNm: z.string().nullable().optional(),
    indsMclsNm: z.string().nullable().optional(),
    indsSclsNm: z.string().nullable().optional(),
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

/** ====== 베이스라인 가중치 ====== */
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
  const { rate_20s, rate_30s, female_rate, cmrcl_level, pay_cnt_log, poi_entropy } = features;
  const total = Object.values(poiByCate).reduce((a, b) => a + b, 0) || 1;

  const categories = Object.keys(poiByCate).length
    ? Object.keys(poiByCate)
    : Object.keys(WEIGHTS);

  const scores = {};
  for (const cate of categories) {
    const w = WEIGHTS[cate] || DEFAULT_W;
    const competition = poiByCate[cate] || 0;
    const compPenalty = Math.max(0, 1 - competition / total);

    const s =
      w.w20s * rate_20s +
      w.w30s * rate_30s +
      w.wf   * female_rate +
      w.wLvl * cmrcl_level +
      w.wPay * pay_cnt_log +
      w.wEnt * poi_entropy;

    scores[cate] = s * (1 + (w.wComp * compPenalty - w.wComp));
  }
  return scores;
}

/** ====== DB 조회 ====== */
async function getLatestCommerce(db, areaCd) {
  if (!areaCd) return null;
  return await db.collection("seoulCmrclRaws")
    .find({ areaCd })
    .sort({ cmrclTime: -1 })
    .limit(1)
    .next();
}

async function getLatestPopulation(db, admmCd, fallbackSggNm) {
  const col = db.collection("population_stats");
  if (admmCd) {
    const d = await col.find({ admmCd }).sort({ statsYm: -1 }).limit(1).next();
    if (d) return d;
  }
  if (fallbackSggNm) {
    const d = await col.find({ sggNm: fallbackSggNm }).sort({ statsYm: -1 }).limit(1).next();
    if (d) return d;
  }
  return await col.find({ admmCd: "1111000000" }).sort({ statsYm: -1 }).limit(1).next();
}

/** ====== 라우트 ====== */
router.get("/_ping", (_req, res) => res.json({ ok: true, from: "recommend router" }));

router.post("/recommendations", async (req, res) => {
  try {
    const { lat, lng, radius, admmCd, areaCd, topK, pois } = ReqSchema.parse(req.body);
    const db = await getDB();

    // 1) POI 요약
    const byCate = {};
    for (const p of pois) {
      const cateRaw = p?.indsLclsNm ?? "기타";
      const cate = (typeof cateRaw === "string" ? cateRaw : "기타").trim();
      byCate[cate] = (byCate[cate] || 0) + 1;
    }
    const counts = Object.values(byCate);
    const poi_total = counts.reduce((a, b) => a + b, 0);
    const poi_entropy = entropyFromCounts(counts);

    // 2) 실시간 상권
    const cmr = await getLatestCommerce(db, areaCd);
    const cmrcl_level = cmr?.areaCmrclLvl ?? 0;
    const pay_cnt_log = Math.log((cmr?.areaShPaymentCnt ?? 0) + 1);

    // 3) 인구 (admmCd 없으면 POI의 signguNm로 폴백)
    const sggNmFallback = pois.find(p => p?.signguNm)?.signguNm || undefined;
    const demo = await getLatestPopulation(db, admmCd, sggNmFallback);

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
    res.status(400).json({ error: err?.issues ?? String(err) });
  }
});

export default router;
