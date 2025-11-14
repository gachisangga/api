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
  // 지금은 알고리즘에는 안 쓰고, 필요하면 나중에 활용 가능
  targetCate: z.object({
    level: z.enum(["L", "M", "S"]), // L=indsLclsNm, M=indsMclsNm, S=indsSclsNm
    name: z.string(),
  }).optional(),
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

/** 🔹 프론트 드롭다운용 계층형 분류 목록 수집
 *
 *  taxonomy = {
 *    L: ["음식", "소매", ...],
 *    M: ["한식", "중식", ...],           // 전체 중분류 목록
 *    S: ["피자", "치킨", ...],          // 전체 소분류 목록
 *    MByL: { "음식": ["한식","중식",...] },
 *    SByM: { "한식": ["한식 일반",...], ... }
 *  }
 */
function collectTaxonomy(pois) {
  const setL = new Set();
  const setM = new Set();
  const setS = new Set();
  const mapL2M = {};
  const mapM2S = {};

  for (const p of pois) {
    const L = p?.indsLclsNm || null;
    const M = p?.indsMclsNm || null;
    const S = p?.indsSclsNm || null;

    if (L) {
      setL.add(L);
      if (!mapL2M[L]) mapL2M[L] = new Set();
    }
    if (M) {
      setM.add(M);
      if (!mapM2S[M]) mapM2S[M] = new Set();
      if (L) mapL2M[L].add(M);
    }
    if (S) {
      setS.add(S);
      if (M) mapM2S[M].add(S);
    }
  }

  const L = Array.from(setL);
  const M = Array.from(setM);
  const S = Array.from(setS);

  const MByL = {};
  for (const [lname, s] of Object.entries(mapL2M)) {
    MByL[lname] = Array.from(s);
  }

  const SByM = {};
  for (const [mname, s] of Object.entries(mapM2S)) {
    SByM[mname] = Array.from(s);
  }

  return { L, M, S, MByL, SByM };
}

/** ====== 임계값(튜닝 가능) ====== */
const THRESHOLDS = {
  RATE20S_HIGH: 0.22,
  RATE30S_HIGH: 0.20,
  FEMALE_RATE_HIGH: 0.50,
  PAY_LOG_HIGH: 6.0,   // ≈ 결제건수 403+
  PAY_LOG_MID: 5.0,    // ≈ 결제건수 148+
  CMR_LEVEL_HIGH: 0.60,
  CMR_LEVEL_MID: 0.30,
  ENTROPY_HIGH: 1.5,
  COMP_OVER: 0.50,
  COMP_UNDER: 0.20,
  COMP_MIN_TOTAL: 3,
};

/** ====== 설명 요약(Why this?) ====== */
function buildSummaryLine(features, byCate, topCategory) {
  if (!topCategory) return null;
  const {
    rate_20s = 0, rate_30s = 0, female_rate = 0,
    cmrcl_level = 0, pay_cnt_log = 0, poi_entropy = 0
  } = features || {};

  const reasons = [];
  if (rate_20s >= THRESHOLDS.RATE20S_HIGH) reasons.push("20대 비중 높음");
  if (rate_30s >= THRESHOLDS.RATE30S_HIGH) reasons.push("30대 비중 높음");
  if (female_rate >= THRESHOLDS.FEMALE_RATE_HIGH) reasons.push("여성 비중 높음");

  const payHigh = pay_cnt_log >= THRESHOLDS.PAY_LOG_HIGH;
  const payMid  = pay_cnt_log >= THRESHOLDS.PAY_LOG_MID;
  const lvlHigh = cmrcl_level >= THRESHOLDS.CMR_LEVEL_HIGH;
  const lvlMid  = cmrcl_level >= THRESHOLDS.CMR_LEVEL_MID;
  if (payHigh || lvlHigh) reasons.push("결제활동 상위권");
  else if (payMid || lvlMid) reasons.push("상권 활력 보통");

  if (poi_entropy >= THRESHOLDS.ENTROPY_HIGH) reasons.push("업종 다양도 높음");

  const total = Object.values(byCate || {}).reduce((a, b) => a + b, 0) || 1;
  const same = (byCate && byCate[topCategory]) || 0;
  const share = same / total;
  if (share >= THRESHOLDS.COMP_OVER) reasons.push("동일 업종 과밀");
  else if (share <= THRESHOLDS.COMP_UNDER && total > THRESHOLDS.COMP_MIN_TOTAL) reasons.push("동일 업종 드묾");

  const left = reasons.length ? `이 지역은 ${reasons.join(" + ")}` : "이 지역은";
  return `${left} → ${topCategory} 추천`;
}

/** ====== 상세 이유 블록(숫자/근거) ====== */
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const topN = (obj, n = 5) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
const bottomN = (obj, n = 5) => Object.entries(obj || {}).sort((a, b) => a[1] - b[1]).slice(0, n);

function buildWhyDetails(features, byCate, topCategory) {
  const {
    rate_20s = 0, rate_30s = 0, female_rate = 0,
    cmrcl_level = 0, pay_cnt_log = 0, poi_entropy = 0, poi_total = 0
  } = features || {};

  const total = Object.values(byCate || {}).reduce((a, b) => a + b, 0) || 1;
  const same = (byCate && topCategory) ? (byCate[topCategory] || 0) : 0;
  const share = same / total;

  const many = topN(byCate, 5).map(([k, v]) => ({ category: k, count: v, share: v / total }));
  const few  = bottomN(byCate, 5).map(([k, v]) => ({ category: k, count: v, share: v / total }));

  return {
    demographics: {
      female: { value: female_rate, label: `여성 ${pct(female_rate)}` },
      age20s: { value: rate_20s,    label: `20대 ${pct(rate_20s)}` },
      age30s: { value: rate_30s,    label: `30대 ${pct(rate_30s)}` },
      flags: {
        femaleHigh: female_rate >= THRESHOLDS.FEMALE_RATE_HIGH,
        age20sHigh: rate_20s >= THRESHOLDS.RATE20S_HIGH,
        age30sHigh: rate_30s >= THRESHOLDS.RATE30S_HIGH,
      },
    },
    commerce: {
      cmrcl_level,
      pay_cnt_log,
      notes:
        (pay_cnt_log === 0 && cmrcl_level === 0)
          ? "상권(결제) 데이터 없음/부족"
          : undefined,
      flags: {
        payHigh: pay_cnt_log >= THRESHOLDS.PAY_LOG_HIGH,
        payMid:  pay_cnt_log >= THRESHOLDS.PAY_LOG_MID,
        lvlHigh: cmrcl_level >= THRESHOLDS.CMR_LEVEL_HIGH,
        lvlMid:  cmrcl_level >= THRESHOLDS.CMR_LEVEL_MID,
      },
    },
    poi: {
      total: poi_total,
      entropy: poi_entropy,
      topMost: many,
      leastCommon: few,
      competition: {
        topCategory,
        sameCount: same,
        sameShare: share,
        label:
          share >= THRESHOLDS.COMP_OVER
            ? "동일 업종 과밀"
            : (share <= THRESHOLDS.COMP_UNDER && total > THRESHOLDS.COMP_MIN_TOTAL)
              ? "동일 업종 드묾"
              : "보통",
      },
      flags: {
        highDiversity: poi_entropy >= THRESHOLDS.ENTROPY_HIGH,
      },
    },
  };
}

/** ====== 베이스라인 가중치 ====== */
const WEIGHTS = {
  // 소분류 이름이 이 중 하나랑 딱 맞는 경우에만 특수 가중치 적용
  "카페/디저트": { w20s: 0.7, w30s: 0.3, wf: 0.3, wLvl: 0.4, wPay: 0.4, wEnt: 0.2, wComp: 1.0 },
  "한식":        { w20s: 0.0, w30s: 0.2, wf: 0.0, wLvl: 0.3, wPay: 0.3, wEnt: 0.1, wComp: 1.0 },
  "분식":        { w20s: 0.6, w30s: 0.2, wf: 0.0, wLvl: 0.2, wPay: 0.3, wEnt: 0.2, wComp: 1.0 },
  "패스트푸드":   { w20s: 0.6, w30s: 0.2, wf: 0.0, wLvl: 0.2, wPay: 0.3, wEnt: 0.2, wComp: 1.0 },
  "편의점":      { w20s: 0.2, w30s: 0.2, wf: 0.0, wLvl: 0.5, wPay: 0.5, wEnt: 0.1, wComp: 1.0 },
  "뷰티/미용":    { w20s: 0.2, w30s: 0.2, wf: 0.6, wLvl: 0.2, wPay: 0.2, wEnt: 0.2, wComp: 1.0 },
};
const DEFAULT_W = { w20s: 0.2, w30s: 0.2, wf: 0.1, wLvl: 0.2, wPay: 0.2, wEnt: 0.1, wComp: 1.0 };

/** ====== 스코어링 (항상 "소분류" 기준) ====== */
function scoreByCategory(features, poiByCate) {
  const { rate_20s, rate_30s, female_rate, cmrcl_level, pay_cnt_log, poi_entropy } = features;
  const total = Object.values(poiByCate).reduce((a, b) => a + b, 0) || 1;

  const categories = Object.keys(poiByCate);

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
    const { lat, lng, radius, admmCd, areaCd, topK, pois, targetCate } = ReqSchema.parse(req.body);
    const db = await getDB();

    // 1) POI 요약 — 🔹 항상 "소분류(S)"로 byCate 구성
    const byCate = {};
    for (const p of pois) {
      const cateRaw = p?.indsSclsNm ?? p?.indsMclsNm ?? p?.indsLclsNm ?? "기타";
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

    // 5) 스코어링 → Top-K (항상 소분류 기준)
    const scored = scoreByCategory(featureVector, byCate);
    const topCategories = Object.entries(scored)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([category, score]) => ({ category, score }));

    // 5-1) Why this? 요약 + 상세
    const top0 = topCategories[0]?.category;
    const summaryLine = buildSummaryLine(featureVector, byCate, top0);
    const whyDetails  = buildWhyDetails(featureVector, byCate, top0);

    // 6) 응답
    res.json({
      topCategories,  // 🔹 항상 소분류 이름 리스트
      why: {
        line: summaryLine,
        details: whyDetails,
      },
      debug: {
        inputs: {
          lat, lng, radius,
          admmCd: admmCd || null,
          areaCd: areaCd || null,
          targetCate: targetCate || null,
        },
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
        taxonomy: collectTaxonomy(pois), // 🔹 계층형 분류
      }
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err?.issues ?? String(err) });
  }
});

export default router;
