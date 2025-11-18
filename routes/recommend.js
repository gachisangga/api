// routes/recommend.js
import { Router } from "express";
import { MongoClient } from "mongodb";
import { z } from "zod";
import "dotenv/config";

import { buildStoreSummary } from "../utils/buildStoreSummary.js";
import { buildAreaSummary } from "../utils/buildAreaSummary.js";

// 🔹 ESM 환경에서 JSON 파일 읽기용
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

/** ====== __filename / __dirname (ESM) ====== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 🔹 좌표까지 붙인 82개 상권 JSON 로드 */
const areasPath = path.join(__dirname, "../areas-82-with-coords.json");
const areas = JSON.parse(fs.readFileSync(areasPath, "utf8"));

/** ====== Mongo 연결 (싱글톤) ====== */
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "CapstoneDB";
const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 5,
  // 디버깅 & Fail-fast용 (필요 없으면 제거 가능)
  serverSelectionTimeoutMS: 5000,
});
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
  areaCd: z.string().optional(), // 클라이언트가 직접 넣을 수도 있음
  radius: z.coerce
    .number()
    .int()
    .positive()
    .max(1500)
    .optional()
    .default(300),
  topK: z.coerce
    .number()
    .int()
    .positive()
    .max(10)
    .optional()
    .default(5),
  pois: z
    .array(
      z.object({
        lat: z.coerce.number(),
        lon: z.coerce.number(),
        indsLclsNm: z.string().nullable().optional(),
        indsMclsNm: z.string().nullable().optional(),
        indsSclsNm: z.string().nullable().optional(),
        signguNm: z.string().nullable().optional(),
        adongCd: z.string().nullable().optional(),
        ldongCd: z.string().nullable().optional(),
      })
    )
    .nonempty(),
  targetCate: z
    .object({
      level: z.enum(["L", "M", "S"]),
      name: z.string(),
    })
    .optional(),
});

// ✅ 프랜차이즈 추천용 요청 스키마
const BrandRecReqSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  aadmmCd: z.string().nullish(),
  areaCd: z.string().nullish(),
  l: z.string(), // 대분류 이름 (예: "음식")
  m: z.string(), // 중분류 이름 (예: "일식")
  radius: z.coerce
    .number()
    .int()
    .positive()
    .max(1500)
    .optional()
    .default(300),
  pois: z
    .array(
      z.object({
        lat: z.coerce.number(),
        lon: z.coerce.number(),
        indsLclsNm: z.string().nullable().optional(),
        indsMclsNm: z.string().nullable().optional(),
        indsSclsNm: z.string().nullable().optional(),
        signguNm: z.string().nullable().optional(),
        adongCd: z.string().nullable().optional(),
        ldongCd: z.string().nullable().optional(),
        bizesNm: z.string().nullable().optional(),
      })
    )
    .nonempty(),
  topK: z.coerce
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .default(10),
  year: z.string().optional(), // 없으면 최신 연도
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

/** 🔹 프론트 드롭다운용 계층형 분류 목록 수집 */
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
      if (M) {
        mapM2S[M] = mapM2S[M] || new Set();
        mapM2S[M].add(S);
      }
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

/** 🔹 위도/경도 → 가장 가까운 서울 상권(areaCd) 찾기 */
function findNearestAreaCd(lat, lng) {
  if (lat == null || lng == null) return null;
  let best = null;
  let bestDist2 = Infinity;

  for (const a of areas) {
    const aLat = a.lat;
    const aLng = a.lng;
    if (aLat == null || aLng == null) continue;

    const dLat = lat - aLat;
    const dLng = lng - aLng;
    const dist2 = dLat * dLat + dLng * dLng;

    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      best = a;
    }
  }

  if (!best) return null;
  // enrich-areas-with-coords 결과는 AREA_CD/AREA_NM 유지 + lat/lng 추가
  return best.AREA_CD || best.areaCd || null;
}

/** ====== 임계값 ====== */
const THRESHOLDS = {
  RATE20S_HIGH: 0.22,
  RATE30S_HIGH: 0.2,
  FEMALE_RATE_HIGH: 0.5,
  PAY_LOG_HIGH: 6.0,
  PAY_LOG_MID: 5.0,
  CMR_LEVEL_HIGH: 0.6,
  CMR_LEVEL_MID: 0.3,
  ENTROPY_HIGH: 1.5,
  COMP_OVER: 0.5,
  COMP_UNDER: 0.2,
  COMP_MIN_TOTAL: 3,
};

/** 🔹 상권레벨(문자) → 숫자 점수로 매핑 */
function mapCmrclLevelToScore(level) {
  if (!level) return 0;
  const table = {
    매우낮음: 0.1,
    낮음: 0.3,
    보통: 0.5,
    높음: 0.7,
    매우높음: 0.9,
  };
  const key = String(level).trim();
  return table[key] ?? 0.5; // 알 수 없는 값이면 중간 정도로
}

/** ====== 설명 요약(Why this?) ====== */
function buildSummaryLine(features, byCate, topCategory) {
  if (!topCategory) return null;
  const {
    rate_20s = 0,
    rate_30s = 0,
    female_rate = 0,
    cmrcl_level = 0,
    pay_cnt_log = 0,
    poi_entropy = 0,
  } = features || {};

  const reasons = [];
  if (rate_20s >= THRESHOLDS.RATE20S_HIGH) reasons.push("20대 비중 높음");
  if (rate_30s >= THRESHOLDS.RATE30S_HIGH) reasons.push("30대 비중 높음");
  if (female_rate >= THRESHOLDS.FEMALE_RATE_HIGH) reasons.push("여성 비중 높음");

  const payHigh = pay_cnt_log >= THRESHOLDS.PAY_LOG_HIGH;
  const payMid = pay_cnt_log >= THRESHOLDS.PAY_LOG_MID;
  const lvlHigh = cmrcl_level >= THRESHOLDS.CMR_LEVEL_HIGH;
  const lvlMid = cmrcl_level >= THRESHOLDS.CMR_LEVEL_MID;
  if (payHigh || lvlHigh) reasons.push("결제활동 상위권");
  else if (payMid || lvlMid) reasons.push("상권 활력 보통");

  if (poi_entropy >= THRESHOLDS.ENTROPY_HIGH) reasons.push("업종 다양도 높음");

  const total = Object.values(byCate || {}).reduce((a, b) => a + b, 0) || 1;
  const same = (byCate && byCate[topCategory]) || 0;
  const share = same / total;
  if (share >= THRESHOLDS.COMP_OVER) reasons.push("동일 업종 과밀");
  else if (
    share <= THRESHOLDS.COMP_UNDER &&
    total > THRESHOLDS.COMP_MIN_TOTAL
  )
    reasons.push("동일 업종 드묾");

  const left = reasons.length ? `이 지역은 ${reasons.join(" + ")}` : "이 지역은";
  return `${left} → ${topCategory} 추천`;
}

/** ====== 상세 이유 블록 ====== */
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const topN = (obj, n = 5) =>
  Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
const bottomN = (obj, n = 5) =>
  Object.entries(obj || {})
    .sort((a, b) => a[1] - b[1])
    .slice(0, n);

/**
 * 상세 이유 블록
 * @param {object} features        - featureVector
 * @param {object} byCate          - { 카테고리명: 개수, ... }
 * @param {string} topCategory     - 추천 1순위 카테고리
 * @param {boolean} hasCommerceData - 상권/결제 데이터가 DB에 실제로 존재하는지 여부
 */
function buildWhyDetails(
  features,
  byCate,
  topCategory,
  hasCommerceData = false
) {
  const {
    rate_20s = 0,
    rate_30s = 0,
    rate_40s = 0,
    rate_50s = 0,
    rate_60s = 0,
    female_rate = 0,
    cmrcl_level = 0,
    pay_cnt_log = 0,
    poi_entropy = 0,
    poi_total = 0,
    personal_rate = null,
    corp_rate = null,
  } = features || {};

  const total = Object.values(byCate || {}).reduce((a, b) => a + b, 0) || 1;
  const same = byCate && topCategory ? byCate[topCategory] || 0 : 0;
  const share = same / total;

  const many = topN(byCate, 5).map(([k, v]) => ({
    category: k,
    count: v,
    share: v / total,
  }));
  const few = bottomN(byCate, 5).map(([k, v]) => ({
    category: k,
    count: v,
    share: v / total,
  }));

  return {
    demographics: {
      female: { value: female_rate, label: `여성 ${pct(female_rate)}` },
      age20s: { value: rate_20s, label: `20대 ${pct(rate_20s)}` },
      age30s: { value: rate_30s, label: `30대 ${pct(rate_30s)}` },
      age40s: { value: rate_40s, label: `40대 ${pct(rate_40s)}` },
      age50s: { value: rate_50s, label: `50대 ${pct(rate_50s)}` },
      age60s: { value: rate_60s, label: `60대 이상 ${pct(rate_60s)}` },
      flags: {
        femaleHigh: female_rate >= THRESHOLDS.FEMALE_RATE_HIGH,
        age20sHigh: rate_20s >= THRESHOLDS.RATE20S_HIGH,
        age30sHigh: rate_30s >= THRESHOLDS.RATE30S_HIGH,
      },
      b2cB2b: {
        personalRate: personal_rate,
        corpRate: corp_rate,
      },
    },
    commerce: {
      cmrcl_level,
      pay_cnt_log,
      notes: !hasCommerceData
        ? "상권(결제) 데이터 없음/부족"
        : pay_cnt_log === 0 && cmrcl_level === 0
        ? "상권(결제) 데이터가 매우 낮거나 집계되지 않았어요."
        : undefined,
      flags: {
        payHigh: pay_cnt_log >= THRESHOLDS.PAY_LOG_HIGH,
        payMid: pay_cnt_log >= THRESHOLDS.PAY_LOG_MID,
        lvlHigh: cmrcl_level >= THRESHOLDS.CMR_LEVEL_HIGH,
        lvlMid: cmrcl_level >= THRESHOLDS.CMR_LEVEL_MID,
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
            : share <= THRESHOLDS.COMP_UNDER &&
              total > THRESHOLDS.COMP_MIN_TOTAL
            ? "동일 업종 드묾"
            : "보통",
      },
      flags: {
        highDiversity: poi_entropy >= THRESHOLDS.ENTROPY_HIGH,
      },
    },
  };
}

/** ====== 아키타입 가중치 (중분류 M 기준) ====== */
/**
 * w20s~w60s : 연령대별 민감도
 * wf        : 여성 비중 민감도
 * wLvl      : 상권 레벨(AREA_CMRCL_LVL) 민감도
 * wPay      : 전체 결제량(AREA_SH_PAYMENT_CNT) 민감도
 * wEnt      : 업종 다양도 민감도
 * wDemand   : 업종별 "수요/공급"(결제건수/점포수) 민감도
 * wOffice   : 법인 소비 비율(오피스 상권) 민감도
 * wHome     : 개인 소비 비율(주거/라이프스타일 상권) 민감도
 * wComp     : 경쟁도(동일 업종 점포수) 패널티 강도
 */
const ARCHETYPE_WEIGHTS = {
  // 🍚 한식/중식/서양식/동남아/일식/구내식당 등 식사 메인
  FOOD_MAIN: {
    w20s: 0.3,
    w30s: 0.4,
    w40s: 0.2,
    w50s: 0.05,
    w60s: 0.05,
    wf: 0.1,
    wLvl: 0.5,
    wPay: 0.5,
    wEnt: 0.1,
    wDemand: 0.3,
    wOffice: 0.3,
    wHome: 0.2,
    wComp: 1.0,
  },

  // 🍟 분식/간이식/음료 계열 (간편식·간식)
  FOOD_SNACK_DRINK: {
    w20s: 0.6,
    w30s: 0.2,
    w40s: 0.1,
    w50s: 0.05,
    w60s: 0.0,
    wf: 0.1,
    wLvl: 0.3,
    wPay: 0.3,
    wEnt: 0.2,
    wDemand: 0.3,
    wOffice: 0.2,
    wHome: 0.2,
    wComp: 1.0,
  },

  // 🍻 주점/유원지·오락 등 야간·유흥 성격
  FOOD_NIGHT_DRINK: {
    w20s: 0.5,
    w30s: 0.3,
    w40s: 0.1,
    w50s: 0.1,
    w60s: 0.0,
    wf: 0.0,
    wLvl: 0.4,
    wPay: 0.5,
    wEnt: 0.2,
    wDemand: 0.3,
    wOffice: 0.2,
    wHome: 0.2,
    wComp: 1.0,
  },

  // 💇‍♀️ 미용·의료·뷰티·스포츠 건강
  BEAUTY_HEALTH: {
    w20s: 0.3,
    w30s: 0.3,
    w40s: 0.2,
    w50s: 0.1,
    w60s: 0.1,
    wf: 0.6,
    wLvl: 0.3,
    wPay: 0.3,
    wEnt: 0.2,
    wDemand: 0.2,
    wOffice: 0.2,
    wHome: 0.4,
    wComp: 1.0,
  },

  // 🛒 편의점/식료품/생활용품/애완동물 등 일상 소매
  DAILY_RETAIL: {
    w20s: 0.2,
    w30s: 0.2,
    w40s: 0.2,
    w50s: 0.2,
    w60s: 0.2,
    wf: 0.1,
    wLvl: 0.5,
    wPay: 0.5,
    wEnt: 0.1,
    wDemand: 0.4,
    wOffice: 0.3,
    wHome: 0.3,
    wComp: 1.0,
  },

  // 🏢 광고·컨설팅·회계·법무·디자인 등 B2B/전문 서비스
  B2B_PRO_SERVICE: {
    w20s: 0.1,
    w30s: 0.3,
    w40s: 0.3,
    w50s: 0.2,
    w60s: 0.1,
    wf: 0.1,
    wLvl: 0.4,
    wPay: 0.3,
    wEnt: 0.1,
    wDemand: 0.2,
    wOffice: 0.5,
    wHome: 0.1,
    wComp: 1.0,
  },

  // 🎓 학원/교육/교육지원
  EDUCATION: {
    w20s: 0.3,
    w30s: 0.2,
    w40s: 0.2,
    w50s: 0.2,
    w60s: 0.1,
    wf: 0.1,
    wLvl: 0.3,
    wPay: 0.2,
    wEnt: 0.2,
    wDemand: 0.2,
    wOffice: 0.2,
    wHome: 0.3,
    wComp: 1.0,
  },

  // 🧳 숙박/여행
  LODGING_TRAVEL: {
    w20s: 0.2,
    w30s: 0.3,
    w40s: 0.3,
    w50s: 0.1,
    w60s: 0.1,
    wf: 0.1,
    wLvl: 0.4,
    wPay: 0.4,
    wEnt: 0.1,
    wDemand: 0.3,
    wOffice: 0.2,
    wHome: 0.3,
    wComp: 1.0,
  },

  // 🛠 청소·시설·세탁·수리·대여 등 인프라 서비스
  LIVING_INFRA_SERVICE: {
    w20s: 0.2,
    w30s: 0.3,
    w40s: 0.3,
    w50s: 0.1,
    w60s: 0.1,
    wf: 0.1,
    wLvl: 0.3,
    wPay: 0.3,
    wEnt: 0.1,
    wDemand: 0.2,
    wOffice: 0.3,
    wHome: 0.2,
    wComp: 1.0,
  },

  // 🏠 부동산 서비스
  PROPERTY: {
    w20s: 0.1,
    w30s: 0.3,
    w40s: 0.3,
    w50s: 0.2,
    w60s: 0.1,
    wf: 0.1,
    wLvl: 0.3,
    wPay: 0.3,
    wEnt: 0.1,
    wDemand: 0.1,
    wOffice: 0.3,
    wHome: 0.3,
    wComp: 1.0,
  },

  // 기본값 (매핑 안 된 중분류용)
  DEFAULT: {
    w20s: 0.2,
    w30s: 0.2,
    w40s: 0.2,
    w50s: 0.2,
    w60s: 0.2,
    wf: 0.1,
    wLvl: 0.2,
    wPay: 0.2,
    wEnt: 0.1,
    wDemand: 0.2,
    wOffice: 0.2,
    wHome: 0.2,
    wComp: 1.0,
  },
};

/** ====== 중분류(M) 이름 → 아키타입 매핑 ====== */
const CATEGORY_ARCHETYPE = {
  // --- 음식: 메인 식사 (FOOD_MAIN) ---
  "한식": "FOOD_MAIN",
  "중식": "FOOD_MAIN",
  "서양식": "FOOD_MAIN",
  "동남아시아": "FOOD_MAIN",
  "일식": "FOOD_MAIN",
  "구내식당·뷔페": "FOOD_MAIN",

  // --- 간편식/음료 (FOOD_SNACK_DRINK) ---
  "기타 간이": "FOOD_SNACK_DRINK",
  "비알코올": "FOOD_SNACK_DRINK",
  "음료 소매": "FOOD_SNACK_DRINK",

  // --- 술/오락 (FOOD_NIGHT_DRINK) ---
  "주점": "FOOD_NIGHT_DRINK",
  "유원지·오락": "FOOD_NIGHT_DRINK",

  // --- 뷰티/헬스 (BEAUTY_HEALTH) ---
  "의약·화장품 소매": "BEAUTY_HEALTH",
  "이용·미용": "BEAUTY_HEALTH",
  "의원": "BEAUTY_HEALTH",
  "병원": "BEAUTY_HEALTH",
  "안경·정밀기기 소매": "BEAUTY_HEALTH",
  "스포츠 서비스": "BEAUTY_HEALTH",

  // --- 교육 (EDUCATION) ---
  "일반 교육": "EDUCATION",
  "기타 교육": "EDUCATION",
  "교육 지원": "EDUCATION",

  // --- 숙박/여행 (LODGING_TRAVEL) ---
  "기타 숙박": "LODGING_TRAVEL",
  "일반 숙박": "LODGING_TRAVEL",
  "여행사·보조": "LODGING_TRAVEL",

  // --- 일상 소매 (DAILY_RETAIL) ---
  "담배 소매": "DAILY_RETAIL",
  "섬유·의복·신발 소매": "DAILY_RETAIL",
  "기타 생활용품 소매": "DAILY_RETAIL",
  "식료품 소매": "DAILY_RETAIL",
  "종합 소매": "DAILY_RETAIL",
  "장식품 소매": "DAILY_RETAIL",
  "가전·통신 소매": "DAILY_RETAIL",
  "기타 상품 소매": "DAILY_RETAIL",
  "오락용품 소매": "DAILY_RETAIL",
  "시계·귀금속 소매": "DAILY_RETAIL",
  "중고 상품 소매": "DAILY_RETAIL",
  "식물 소매": "DAILY_RETAIL",
  "애완동물·용품 소매": "DAILY_RETAIL",
  "사진 촬영": "DAILY_RETAIL",

  // --- B2B/전문 서비스 (B2B_PRO_SERVICE) ---
  "광고": "B2B_PRO_SERVICE",
  "본사·경영 컨설팅": "B2B_PRO_SERVICE",
  "기타 전문 과학": "B2B_PRO_SERVICE",
  "기술 서비스": "B2B_PRO_SERVICE",
  "전문 디자인": "B2B_PRO_SERVICE",
  "기타 사업 서비스": "B2B_PRO_SERVICE",
  "인쇄·제품제작": "B2B_PRO_SERVICE",
  "회계·세무": "B2B_PRO_SERVICE",
  "법무관련": "B2B_PRO_SERVICE",
  "사무 지원": "B2B_PRO_SERVICE",

  // --- 부동산 (PROPERTY) ---
  "부동산 서비스": "PROPERTY",

  // --- 생활/인프라 서비스 (LIVING_INFRA_SERVICE) ---
  "고용 알선": "LIVING_INFRA_SERVICE",
  "산업용품 대여": "LIVING_INFRA_SERVICE",
  "가정용품 대여": "LIVING_INFRA_SERVICE",
  "기타 가정용품 수리": "LIVING_INFRA_SERVICE",
  "통신장비 수리": "LIVING_INFRA_SERVICE",
  "시설관리": "LIVING_INFRA_SERVICE",
  "세탁": "LIVING_INFRA_SERVICE",
  "청소·방제": "LIVING_INFRA_SERVICE",
  "자동차 수리·세차": "LIVING_INFRA_SERVICE",
};

/** 🔹 RSB(업종별 상권 정보) 정규화 */
function normalizeRsbItem(raw) {
  if (!raw) return null;
  return {
    l: raw.RSB_LRG_CTGR || raw.rsbLrgCtgr || null,
    m: raw.RSB_MID_CTGR || raw.rsbMidCtgr || null,
    paymentCnt: raw.RSB_SH_PAYMENT_CNT ?? raw.rsbShPaymentCnt ?? 0,
    mctCnt: raw.RSB_MCT_CNT ?? raw.rsbMctCnt ?? 0,
    paymentLvl: raw.RSB_PAYMENT_LVL || raw.rsbPaymentLvl || null,
    amtMin: raw.RSB_SH_PAYMENT_AMT_MIN ?? raw.rsbShPaymentAmtMin ?? null,
    amtMax: raw.RSB_SH_PAYMENT_AMT_MAX ?? raw.rsbShPaymentAmtMax ?? null,
  };
}

/** 🔹 scoreByCategory: 연령/성별 + 상권/결제 + 업종 다양도 + 수요/공급 + B2C/B2B + 경쟁도 */
function scoreByCategory(features, poiByCate, rsbByCate) {
  const {
    rate_20s = 0,
    rate_30s = 0,
    rate_40s = 0,
    rate_50s = 0,
    rate_60s = 0,
    female_rate = 0,
    cmrcl_level = 0,
    pay_cnt_log = 0,
    poi_entropy = 0,
    personal_rate = 0,
    corp_rate = 0,
  } = features;

  const total = Object.values(poiByCate).reduce((a, b) => a + b, 0) || 1;
  const categories = Object.keys(poiByCate);
  const scores = {};

  for (const cate of categories) {
    // 1) 중분류 이름을 아키타입으로 매핑
    const archetypeKey = CATEGORY_ARCHETYPE[cate] || "DEFAULT";
    const w = ARCHETYPE_WEIGHTS[archetypeKey] || ARCHETYPE_WEIGHTS.DEFAULT;

    // 2) 경쟁도 (동일 중분류 점포 비중)
    const competition = poiByCate[cate] || 0;
    const compPenalty = Math.max(0, 1 - competition / total);

    // 3) 업종별 RSB 데이터 (중분류/대분류 이름으로 매핑)
    const rsb = rsbByCate[cate] || rsbByCate[cate.trim()] || null;
    let demandPerStoreLog = 0;
    if (rsb) {
      const demandPerStore = rsb.paymentCnt / Math.max(rsb.mctCnt || 0, 1);
      demandPerStoreLog = Math.log(demandPerStore + 1);
    }

    // 4) 기본 점수
    const s =
      w.w20s * rate_20s +
      w.w30s * rate_30s +
      w.w40s * rate_40s +
      w.w50s * rate_50s +
      w.w60s * rate_60s +
      w.wf * female_rate +
      w.wLvl * cmrcl_level +
      w.wPay * pay_cnt_log +
      w.wEnt * poi_entropy +
      w.wDemand * demandPerStoreLog +
      w.wOffice * (corp_rate || 0) +
      w.wHome * (personal_rate || 0);

    // 5) 경쟁도 패널티 적용
    scores[cate] = s * (1 + (w.wComp * compPenalty - w.wComp));
  }

  return scores;
}

/** 🔹 브랜드 전국 Health 점수 (brandStats 한 줄 b 기준) */
function calcBrandHealth(b, norm) {
  const { frcsCnt, avrgSlsAmt, newFrcsRgsCnt, ctrtEndCnt, ctrtCncltnCnt } = b;

  const size = norm.frcsCnt(frcsCnt ?? 0);
  const sales = norm.avrgSlsAmt(avrgSlsAmt ?? 0);
  const growth = frcsCnt > 0 ? newFrcsRgsCnt / frcsCnt : 0;
  const closure =
    frcsCnt > 0 ? (ctrtEndCnt + ctrtCncltnCnt) / frcsCnt : 0;

  // 간단 가중치 (필요하면 나중에 튜닝)
  return (
    0.3 * size +
    0.3 * sales +
    0.2 * growth -
    0.2 * closure
  );
}

/** 🔹 브랜드-상권 Local Fit 점수 */
/** 🔹 브랜드-상권 Local Fit 점수 */
function calcLocalFit({
  brand,
  cateM, // 예: "일식"
  pois,
  byCate,
  rsbByCate,
  cmrcl_level,
  pay_cnt_log,
}) {
  // 1) 이 상권에서 해당 중분류 점포 전체 수
  const localCateStores = byCate[cateM] || 0;

  // 2) 이 상권에서 이 브랜드 점포 수 (매우 단순 버전: 상호명에 브랜드명 포함)
  const brandName = String(brand.brandNm || "").trim();
  let localBrandCount = 0;
  if (brandName) {
    for (const p of pois) {
      const nm = (p?.bizesNm || "").trim();
      const m = (p?.indsMclsNm || "").trim();
      if (!nm || !m) continue;
      if (m === cateM && nm.includes(brandName)) {
        localBrandCount++;
      }
    }
  }

  const brandShare =
    localCateStores > 0 ? localBrandCount / localCateStores : 0;

  // 3) 이 상권에서 해당 업종(중분류)의 수요/공급
  const rsb = rsbByCate[cateM] || null;
  let demandPerStoreLog = 0;
  if (rsb) {
    const demandPerStore =
      rsb.paymentCnt / Math.max(rsb.mctCnt || 0, 1);
    demandPerStoreLog = Math.log(demandPerStore + 1);
  }

  // 4) Local Fit 점수 (상권이 좋고, 수요/공급 좋고, 이미 과밀하지 않을수록 +)
  const s =
    0.4 * demandPerStoreLog +
    0.3 * cmrcl_level +
    0.3 * pay_cnt_log -
    0.4 * brandShare; // 이미 많이 깔린 브랜드면 패널티

  return s;
}

/** 🔹 프랜차이즈 추천 이유(문장) 생성 */
function buildBrandReasons({
  brand,
  cateM,
  pois,
  byCate,
  rsbByCate,
  cmrcl_level,
  pay_cnt_log,
  norm,
}) {
  const reasons = [];

  // 1) 전국 브랜드 규모/매출/성장/해지 비율
  const frcsCnt = brand.frcsCnt ?? 0;
  const avrgSlsAmt = brand.avrgSlsAmt ?? 0;
  const newFrcsRgsCnt = brand.newFrcsRgsCnt ?? 0;
  const ctrtEndCnt = brand.ctrtEndCnt ?? 0;
  const ctrtCncltnCnt = brand.ctrtCncltnCnt ?? 0;

  const sizeNorm = norm.frcsCnt(frcsCnt);
  const salesNorm = norm.avrgSlsAmt(avrgSlsAmt);
  const growth = frcsCnt > 0 ? newFrcsRgsCnt / frcsCnt : 0;
  const closureRate =
    frcsCnt > 0 ? (ctrtEndCnt + ctrtCncltnCnt) / frcsCnt : 0;

  if (sizeNorm >= 0.7) {
    reasons.push("전국 가맹점 수가 많은 안정적인 브랜드입니다.");
  } else if (sizeNorm <= 0.3) {
    reasons.push("전국 가맹점 수가 아직 많지 않은 성장 단계의 브랜드입니다.");
  }

  if (salesNorm >= 0.7) {
    reasons.push("전국 평균 매출이 상위권인 브랜드입니다.");
  } else if (salesNorm <= 0.3) {
    reasons.push("전국 평균 매출이 상대적으로 낮은 편입니다.");
  }

  if (growth >= 0.15) {
    reasons.push("최근 몇 년간 가맹점이 빠르게 증가하고 있는 성장 브랜드입니다.");
  } else if (growth <= 0.03 && frcsCnt > 30) {
    reasons.push("최근 가맹점 수는 크게 변하지 않는 안정적인 브랜드입니다.");
  }

  if (closureRate >= 0.2) {
    reasons.push("계약 해지/종료 비율이 다소 높아 리스크 확인이 필요합니다.");
  } else if (closureRate > 0 && closureRate < 0.1) {
    reasons.push("계약 해지/종료 비율이 낮은 편입니다.");
  }

  // 2) 이 상권에서의 브랜드 비중
  const totalCateStores = byCate[cateM] || 0;
  const brandName = String(brand.brandNm || "").trim();
  let localBrandCount = 0;

  if (brandName) {
    for (const p of pois) {
      const nm = (p?.bizesNm || "").trim();
      const pm = (p?.indsMclsNm || "").trim();
      if (!nm || !pm) continue;
      if (pm === cateM && nm.includes(brandName)) {
        localBrandCount++;
      }
    }
  }

  const brandShare =
    totalCateStores > 0 ? localBrandCount / totalCateStores : 0;

  if (totalCateStores > 0 && localBrandCount === 0) {
    reasons.push("현재 이 상권에는 해당 브랜드 매장이 없어 선도 입점이 가능합니다.");
  } else if (brandShare > 0 && brandShare <= 0.3) {
    reasons.push("이 상권에서 동일 브랜드 비중이 낮아 직접적인 경쟁이 크지 않습니다.");
  } else if (brandShare >= 0.6) {
    reasons.push("이 상권에서 이미 동일 브랜드 점포 비중이 높아 내부 경쟁이 있을 수 있습니다.");
  }

  // 3) 업종별 수요/공급 (RSB)
  const rsb = rsbByCate[cateM] || null;
  if (rsb) {
    const demandPerStore =
      rsb.paymentCnt / Math.max(rsb.mctCnt || 0, 1);
    if (demandPerStore >= 200) {
      reasons.push("해당 업종의 결제 규모 대비 점포 수가 적어 수요 대비 공급이 부족한 편입니다.");
    } else if (demandPerStore <= 50) {
      reasons.push("해당 업종의 결제 규모 대비 점포 수가 많아 경쟁이 다소 치열할 수 있습니다.");
    }
  }

  // 4) 상권 레벨/결제 활동
  if (cmrcl_level >= THRESHOLDS.CMR_LEVEL_HIGH) {
    reasons.push("상권 레벨이 높은 지역으로 유동 인구와 소비 잠재력이 큰 편입니다.");
  } else if (cmrcl_level <= THRESHOLDS.CMR_LEVEL_MID) {
    reasons.push("상권 레벨이 중간 이하로, 초기에는 마케팅과 입지 전략이 중요할 수 있습니다.");
  }

  if (pay_cnt_log >= THRESHOLDS.PAY_LOG_HIGH) {
    reasons.push("이 상권의 전체 결제 활동이 매우 활발한 편입니다.");
  } else if (pay_cnt_log <= THRESHOLDS.PAY_LOG_MID) {
    reasons.push("이 상권의 결제 활동이 상대적으로 적어, 조심스러운 진입이 필요합니다.");
  }

  return reasons;
}


/** ====== DB 조회 ====== */
async function getLatestCommerce(db, areaCd) {
  const col = db.collection("seoulCmrclRaws");

  // 1) areaCd로 먼저 시도
  if (areaCd) {
    const byArea = await col
      .find({ areaCd })
      .sort({ cmrclTime: -1 })
      .limit(1)
      .next();

    if (byArea) {
      return { doc: byArea, from: "area" };
    }
  }

  // 2) areaCd로 못 찾으면, 전체 중 가장 최신 데이터 하나라도 사용 (전역 fallback)
  const latestAny = await col
    .find({})
    .sort({ cmrclTime: -1 })
    .limit(1)
    .next();

  if (latestAny) {
    return { doc: latestAny, from: "global" };
  }

  // 3) 컬렉션이 비어있으면 진짜 데이터 없음
  return { doc: null, from: "none" };
}

async function getLatestPopulation(db, admmCd, fallbackSggNm) {
  const col = db.collection("population_stats");
  if (admmCd) {
    const d = await col
      .find({ admmCd })
      .sort({ statsYm: -1 })
      .limit(1)
      .next();
    if (d) return d;
  }
  if (fallbackSggNm) {
    const d = await col
      .find({ sggNm: fallbackSggNm })
      .sort({ statsYm: -1 })
      .limit(1)
      .next();
    if (d) return d;
  }
  return await col
    .find({ admmCd: "1111000000" })
    .sort({ statsYm: -1 })
    .limit(1)
    .next();
}

/** ====== 프랜차이즈(브랜드) 조회 유틸 with Fallback ====== */
// year가 안 넘어오면 brandStats 컬렉션에서 가장 최신 year를 한 번 조회해서 사용
async function fetchFranchisesByCategory({ l, m, year, limit = 30 }) {
  const db = await getDB();
  const col = db.collection("brandStats");

  // 1) 사용할 year 결정 (요청에 year 없으면 DB에서 최신 year 찾기)
  let useYear = year;
  if (!useYear) {
    const latest = await col
      .find({})
      .sort({ year: -1 }) // year 내림차순 → 가장 최신 연도
      .limit(1)
      .next();

    useYear = latest?.year;
    console.log("[brands] latest year fallback =", useYear);
  }

  const baseFilter = {};
  if (useYear) {
    baseFilter.year = useYear; // ex) "2023", "2024"
  }

  const runQuery = async (filter) => {
    const docs = await col
      .find(filter)
      .sort({ frcsCnt: -1, avrgSlsAmt: -1 })
      .limit(Number(limit) || 30)
      .toArray();

    return docs.map((d) => ({
      brandNm: d.brandNm,
      corpNm: d.corpNm,
      frcsCnt: d.frcsCnt,
      avrgSlsAmt: d.avrgSlsAmt,
      arUnitAvrgSlsAmt: d.arUnitAvrgSlsAmt, // ㎡당 평균 매출
      newFrcsRgsCnt: d.newFrcsRgsCnt, // 신규 가맹
      ctrtCncltnCnt: d.ctrtCncltnCnt, // 계약 해지
      ctrtEndCnt: d.ctrtEndCnt, // 계약 종료
      indutyLclasNm: d.indutyLclasNm,
      indutyMlsfcNm: d.indutyMlsfcNm,
      year: d.year,
    }));
  };

  let brands = [];

  // 1) L + M 둘 다 있는 경우: 가장 타이트한 필터
  if (l && m) {
    brands = await runQuery({
      ...baseFilter,
      indutyLclasNm: l,
      indutyMlsfcNm: m,
    });
  }

  // 2) (결과 없고) M만으로 시도
  if ((!brands || brands.length === 0) && m) {
    brands = await runQuery({
      ...baseFilter,
      indutyMlsfcNm: m,
    });
  }

  // 3) (그래도 없고) L만으로 시도
  if ((!brands || brands.length === 0) && l) {
    brands = await runQuery({
      ...baseFilter,
      indutyLclasNm: l,
    });
  }

  // 4) (그래도 없으면) 그냥 해당 연도 전체 상위 브랜드 반환
  if (!brands || brands.length === 0) {
    brands = await runQuery(baseFilter);
  }

  return brands;
}

/** ====== 라우트 ====== */

// 🔹 프랜차이즈 목록 (단순 목록)
router.get("/brands/by-category", async (req, res) => {
  try {
    // year 기본값 제거 → 안 들어오면 undefined, 위 유틸에서 최신 연도로 대체
    const { l, m, year, limit = "30" } = req.query;

    if (!l && !m) {
      console.log("brands/by-category: no l/m, 연도만으로 조회");
    }

    const brands = await fetchFranchisesByCategory({
      l,
      m,
      year,
      limit: Number(limit) || 30,
    });

    res.json({ brands });
  } catch (e) {
    console.error("브랜드 조회 실패:", e);
    res.status(500).json({ message: "브랜드 조회 실패" });
  }
});

// 🔹 상권 기반 프랜차이즈 추천 (점수화)
router.post("/brands/recommendations", async (req, res) => {
  const t0 = Date.now();
  try {
    // 1) 요청 파싱
    const {
      lat,
      lng,
      admmCd,
      areaCd,
      l,
      m,
      radius,
      pois,
      topK,
      year,
    } = BrandRecReqSchema.parse(req.body);

    const db = await getDB();

    // 2) 상권 코드 찾기
    const resolvedAreaCd = areaCd || findNearestAreaCd(lat, lng);

    // 3) 주변 업종 분포 (중분류 기준)
    const byCate = {};
    for (const p of pois) {
      const cateRaw = p?.indsMclsNm ?? p?.indsLclsNm ?? "기타";
      const cate =
        typeof cateRaw === "string" ? cateRaw.trim() || "기타" : "기타";
      byCate[cate] = (byCate[cate] || 0) + 1;
    }
    const counts = Object.values(byCate);
    const poi_total = counts.reduce((a, b) => a + b, 0);
    const poi_entropy = entropyFromCounts(counts);

    // 4) 상권 데이터 (cmrcl_level, pay_cnt_log, 개인/법인 비율 등)
    const cmrRes = await getLatestCommerce(db, resolvedAreaCd);
    const cmr = cmrRes?.doc || null;
    const commerceSource = cmrRes?.from || "none";
    const hasCommerceData = commerceSource !== "none" && !!cmr;

    let cmrcl_level = 0;
    let pay_cnt_log = 0;

    if (hasCommerceData) {
      const lvlRaw = cmr?.areaCmrclLvl;
      cmrcl_level = mapCmrclLevelToScore(lvlRaw);

      const rawPayCnt = cmr?.areaShPaymentCnt ?? 0;
      pay_cnt_log = rawPayCnt > 0 ? Math.log(rawPayCnt + 1) : 0;
    }

    // 5) RSB → 중분류 기준 매핑
    const rsbList = Array.isArray(cmr?.CMRCL_RSB)
      ? cmr.CMRCL_RSB
      : Array.isArray(cmr?.cmrclRsbList)
      ? cmr.cmrclRsbList
      : [];

    const rsbByCate = {};
    for (const raw of rsbList || []) {
      const n = normalizeRsbItem(raw);
      if (!n) continue;
      const key = n.m || n.l;
      if (!key) continue;
      rsbByCate[key.trim()] = n;
    }

    // 6) 이 업종(l, m)에 해당하는 브랜드 목록 가져오기 (전국 통계)
    const brands = await fetchFranchisesByCategory({
      l,
      m,
      year,
      limit: 200, // 넉넉히 가져와서 그중 상위 topK만 사용
    });

    if (!brands || brands.length === 0) {
      return res.json({ brands: [], debug: { reason: "no brands" } });
    }

    // 7) Health 점수 정규화를 위한 min/max 계산
    const frcsCnts = brands.map((b) => b.frcsCnt ?? 0);
    const avgs = brands.map((b) => b.avrgSlsAmt ?? 0);
    const minF = Math.min(...frcsCnts);
    const maxF = Math.max(...frcsCnts);
    const minA = Math.min(...avgs);
    const maxA = Math.max(...avgs);

    const norm = {
      frcsCnt: (v) =>
        maxF > minF ? (v - minF) / (maxF - minF || 1) : 0,
      avrgSlsAmt: (v) =>
        maxA > minA ? (v - minA) / (maxA - minA || 1) : 0,
    };

    // 8) 브랜드별 최종 점수 계산
    // 8) 브랜드별 최종 점수 계산 + 추천 이유 생성
const scored = brands.map((b) => {
  const health = calcBrandHealth(b, norm);
  const localFit = calcLocalFit({
    brand: b,
    cateM: m,
    pois,
    byCate,
    rsbByCate,
    cmrcl_level,
    pay_cnt_log,
  });

  const rawScore = 0.6 * health + 0.4 * localFit;

  // 👇 여기서 이유(문장 배열) 생성
  const reasons = buildBrandReasons({
    brand: b,
    cateM: m,
    pois,
    byCate,
    rsbByCate,
    cmrcl_level,
    pay_cnt_log,
    norm,
  });

  return {
    ...b,
    healthScore: health,
    localFitScore: localFit,
    rawScore,
    reasons, // 프론트에서 그대로 사용 가능
  };
});

// 9) 0~100 점수로 리스케일 + 한 줄 요약(whyLine)
const rawScores = scored.map((s) => s.rawScore);
const minS = Math.min(...rawScores);
const maxS = Math.max(...rawScores);

const withNorm = scored.map((s) => {
  const normScore =
    maxS > minS
      ? 100 * ((s.rawScore - minS) / (maxS - minS || 1))
      : 50; // 전부 같으면 50점

  const score = Number(normScore.toFixed(1));

  // 상위 1~2개의 reason만 이어붙인 한 줄 요약
  const whyLine =
    s.reasons && s.reasons.length
      ? s.reasons.slice(0, 2).join(" / ")
      : null;

  return {
    ...s,
    score,
    whyLine, // 프론트에서 카드 상단에 한 줄로 보여주기 좋음
  };
});

// 10) 점수 순으로 상위 topK 반환
withNorm.sort((a, b) => b.score - a.score);

res.json({
  brands: withNorm.slice(0, topK),
  debug: {
    resolvedAreaCd,
    commerceSource,
    poi_total,
    poi_entropy,
    cmrcl_level,
    pay_cnt_log,
  },
});


    console.log(
      "[/brands/recommendations] done in",
      Date.now() - t0,
      "ms"
    );
  } catch (err) {
    console.error("[/brands/recommendations] error:", err);
    res.status(400).json({ error: err?.issues ?? String(err) });
  }
});

// 🔹 핑
router.get("/_ping", (_req, res) =>
  res.json({ ok: true, from: "recommend router" })
);

// 🔹 업종 추천 (중분류 기준)
router.post("/recommendations", async (req, res) => {
  const t0 = Date.now();
  console.log(
    "[/recommendations] 요청 수신, body keys:",
    Object.keys(req.body || {})
  );

  try {
    const tParse = Date.now();
    let { lat, lng, radius, admmCd, areaCd, topK, pois, targetCate } =
      ReqSchema.parse(req.body);
    console.log(
      "[/recommendations] ReqSchema.parse 완료, +",
      Date.now() - tParse,
      "ms, pois.length=",
      Array.isArray(pois) ? pois.length : 0
    );

    const tDb = Date.now();
    const db = await getDB();
    console.log(
      "[/recommendations] getDB 완료, +",
      Date.now() - tDb,
      "ms (누적:",
      Date.now() - t0,
      "ms)"
    );

    // 0) areaCd가 없으면 위/경도 기준으로 가장 가까운 서울 상권 찾기
    const resolvedAreaCd = areaCd || findNearestAreaCd(lat, lng);
    console.log("[/recommendations] resolvedAreaCd:", resolvedAreaCd);

    // 1) POI 요약 — "중분류(M)" 기준 (없으면 대분류, 그래도 없으면 '기타')
    const tPoi = Date.now();
    const byCate = {};
    for (const p of pois) {
      const cateRaw = p?.indsMclsNm ?? p?.indsLclsNm ?? "기타";
      const cate =
        typeof cateRaw === "string" ? cateRaw.trim() || "기타" : "기타";
      byCate[cate] = (byCate[cate] || 0) + 1;
    }
    const counts = Object.values(byCate);
    const poi_total = counts.reduce((a, b) => a + b, 0);
    const poi_entropy = entropyFromCounts(counts);

    console.log(
      "[/recommendations] POI 요약 완료, +",
      Date.now() - tPoi,
      "ms, poi_total=",
      poi_total
    );

    // 🔹 주변 상가 분포 요약
    const storeSummary = buildStoreSummary(pois);

    // 2) 실시간 상권 (areaCd 기반 + 전역 fallback)
    const tCmr = Date.now();
    const cmrRes = await getLatestCommerce(db, resolvedAreaCd);
    const cmr = cmrRes?.doc || null;
    const commerceSource = cmrRes?.from || "none";
    const hasCommerceData = commerceSource !== "none" && !!cmr;
    console.log(
      "[/recommendations] getLatestCommerce 끝, source=",
      commerceSource,
      ", +",
      Date.now() - tCmr,
      "ms (누적:",
      Date.now() - t0,
      "ms)"
    );

    let cmrcl_level = 0;
    let pay_cnt_log = 0;
    let personal_rate = null;
    let corp_rate = null;

    if (hasCommerceData) {
      const lvlRaw = cmr?.areaCmrclLvl; // '보통', '높음' 같은 문자열
      cmrcl_level = mapCmrclLevelToScore(lvlRaw); // 숫자로 변환

      const rawPayCnt = cmr?.areaShPaymentCnt ?? 0;
      pay_cnt_log = rawPayCnt > 0 ? Math.log(rawPayCnt + 1) : 0;

      // 개인 / 법인 소비 비율 (0~100 또는 0~1 → 합으로 정규화)
      if (
        cmr?.cmrclPersonalRate != null &&
        cmr?.cmrclCorporationRate != null
      ) {
        const pRaw = Number(cmr.cmrclPersonalRate);
        const cRaw = Number(cmr.cmrclCorporationRate);
        const sumRaw = pRaw + cRaw;
        if (sumRaw > 0) {
          personal_rate = pRaw / sumRaw;
          corp_rate = cRaw / sumRaw;
        }
      }
    }

    console.log("[DEBUG] resolvedAreaCd:", resolvedAreaCd);
    console.log("[DEBUG] commerceSource:", commerceSource);
    console.log(
      "[DEBUG] cmrcl_level:",
      cmrcl_level,
      "pay_cnt_log:",
      pay_cnt_log
    );

    // 3) 인구 (admmCd 없으면 POI의 signguNm로 폴백)
    const tPop = Date.now();
    const sggNmFallback =
      pois.find((p) => p?.signguNm)?.signguNm || undefined;
    const demo = await getLatestPopulation(db, admmCd, sggNmFallback);
    console.log(
      "[/recommendations] getLatestPopulation 끝, +",
      Date.now() - tPop,
      "ms (누적:",
      Date.now() - t0,
      "ms)"
    );

    // 🔹 전체 인구
    const pop_total = demo?.totNmprCnt ?? 0;

    // 🔹 연령대: 인구 DB 기준 (20/30/40/50/60대 이상)
    const sumAges = (ks) =>
      ks.reduce((acc, k) => acc + (demo?.[k] ?? 0), 0);

    const cnt20 = sumAges(["male20AgeNmprCnt", "feml20AgeNmprCnt"]);
    const cnt30 = sumAges(["male30AgeNmprCnt", "feml30AgeNmprCnt"]);
    const cnt40 = sumAges(["male40AgeNmprCnt", "feml40AgeNmprCnt"]);
    const cnt50 = sumAges(["male50AgeNmprCnt", "feml50AgeNmprCnt"]);
    const cnt60 = sumAges(["male60AgeNmprCnt", "feml60AgeNmprCnt"]);

    const rate_20s = safeRate(cnt20, pop_total);
    const rate_30s = safeRate(cnt30, pop_total);
    const rate_40s = safeRate(cnt40, pop_total);
    const rate_50s = safeRate(cnt50, pop_total);
    const rate_60s = safeRate(cnt60, pop_total);

    // 🔹 성별 비율: 상권 결제 데이터(cmrclFemaleRate / MaleRate)를 우선 사용
    let female_rate = null;

    if (cmr?.cmrclFemaleRate != null && cmr?.cmrclMaleRate != null) {
      const fRaw = Number(cmr.cmrclFemaleRate); // 예: 54.1
      const mRaw = Number(cmr.cmrclMaleRate); // 예: 45.9
      const sumRaw = fRaw + mRaw;

      female_rate = sumRaw > 0 ? fRaw / sumRaw : null;
    } else if (demo?.femlNmprCnt != null && pop_total > 0) {
      // fallback: 인구 DB 기반
      female_rate = demo.femlNmprCnt / pop_total;
    } else {
      female_rate = null;
    }

    console.log("[DEBUG gender/B2C-B2B]", {
      pop_total,
      femlNmprCnt: demo?.femlNmprCnt,
      cmrclFemaleRate: cmr?.cmrclFemaleRate,
      cmrclMaleRate: cmr?.cmrclMaleRate,
      final_female_rate: female_rate,
      personal_rate,
      corp_rate,
    });

    // 🔹 areaSummary용 baseInfo 구성
    const baseInfo = {
      AREA_NM: cmr?.areaNm || demo?.dongNm || null, // 위치 라벨
      AREA_CD: resolvedAreaCd || cmr?.areaCd || null,
      ctpvNm: demo?.ctpvNm ?? null,
      sggNm: demo?.sggNm ?? sggNmFallback ?? null,

      // 인구 비율 (0~1)
      CMRCL_20_RATE: rate_20s,
      CMRCL_30_RATE: rate_30s,
      CMRCL_FEMALE_RATE: female_rate,
      CMRCL_MALE_RATE:
        female_rate != null && female_rate <= 1
          ? 1 - female_rate
          : null,

      // 상권/결제
      AREA_SH_PAYMENT_CNT: cmr?.areaShPaymentCnt ?? 0,
      AREA_CMRCL_LVL: cmr?.areaCmrclLvl ?? null,
      LIVE_CMRCL_STTS:
        cmr?.liveCmrclStts ?? cmr?.areaCmrclLvl ?? null,

      // B2C/B2B
      CMRCL_PERSONAL_RATE: personal_rate,
      CMRCL_CORPORATION_RATE: corp_rate,
    };

    // 🔹 상권 유형 리스트 (있으면 사용, 없으면 빈 배열)
    const rsbList = Array.isArray(cmr?.CMRCL_RSB)
      ? cmr.CMRCL_RSB
      : Array.isArray(cmr?.cmrclRsbList)
      ? cmr.cmrclRsbList
      : [];

    // 🔹 RSB를 카테고리별로 매핑 (중분류 → 없으면 대분류)
    const rsbByCate = {};
    for (const raw of rsbList || []) {
      const n = normalizeRsbItem(raw);
      if (!n) continue;
      const key = n.m || n.l;
      if (!key) continue;
      rsbByCate[key.trim()] = n;
    }

    // 🔹 인구 + 상권 기반 요약
    const tArea = Date.now();
    const areaSummary = buildAreaSummary({
      baseInfo,
      populationDoc: demo,
      rsbList,
    });
    console.log(
      "[/recommendations] buildAreaSummary 끝, +",
      Date.now() - tArea,
      "ms (누적:",
      Date.now() - t0,
      "ms)"
    );

    // 4) feature vector
    const featureVector = {
      lat,
      lng,
      radius,
      pop_total,
      rate_20s,
      rate_30s,
      rate_40s,
      rate_50s,
      rate_60s,
      female_rate,
      cmrcl_level,
      pay_cnt_log,
      poi_entropy,
      poi_total,
      personal_rate: personal_rate ?? 0,
      corp_rate: corp_rate ?? 0,
    };

    // 5) 스코어링 → Top-K
    const tScore = Date.now();
    const scored = scoreByCategory(featureVector, byCate, rsbByCate);
    const topCategories = Object.entries(scored)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([category, score]) => ({ category, score }));
    console.log(
      "[/recommendations] scoreByCategory/topCategories 끝, +",
      Date.now() - tScore,
      "ms (누적:",
      Date.now() - t0,
      "ms)"
    );

    // 5-1) Why this? 요약 + 상세
    const top0 = topCategories[0]?.category;
    const summaryLine = buildSummaryLine(featureVector, byCate, top0);
    const whyDetails = buildWhyDetails(
      featureVector,
      byCate,
      top0,
      hasCommerceData
    );

    // 6) 응답
    const tJson = Date.now();
    res.json({
      topCategories,
      why: {
        line: summaryLine,
        details: whyDetails,
      },

      // ✅ 프론트에서 바로 써먹을 상권/상가 요약
      areaSummary,
      storeSummary,

      // 디버깅용 원시 데이터
      debug: {
        inputs: {
          lat,
          lng,
          radius,
          admmCd: admmCd || null,
          areaCdFromClient: areaCd || null,
          resolvedAreaCd: resolvedAreaCd || null,
          targetCate: targetCate || null,
        },
        poi: { byCate, poi_total, poi_entropy },
        commerce: cmr
          ? {
              areaCd: cmr.areaCd,
              cmrclTime: cmr.cmrclTime,
              areaCmrclLvl: cmr.areaCmrclLvl,
              areaShPaymentCnt: cmr.areaShPaymentCnt,
              cmrclPersonalRate: personal_rate,
              cmrclCorporationRate: corp_rate,
              source: commerceSource, // "area" | "global"
            }
          : null,
        demographics: demo
          ? {
              admmCd: demo.admmCd,
              sggNm: demo.sggNm,
              statsYm: demo.statsYm,
              totNmprCnt: demo.totNmprCnt,
              rate_20s,
              rate_30s,
              rate_40s,
              rate_50s,
              rate_60s,
            }
          : null,
        featureVector,
        taxonomy: collectTaxonomy(pois),
        rsbByCate,
      },
    });
    console.log(
      "[/recommendations] res.json 끝, +",
      Date.now() - tJson,
      "ms, 전체:",
      Date.now() - t0,
      "ms"
    );

    console.log("areaSummary(population) =", areaSummary?.population);
  } catch (err) {
    console.error("[/recommendations] 에러:", err);
    console.log(
      "[/recommendations] 에러까지 걸린 시간:",
      Date.now() - t0,
      "ms"
    );
    res.status(400).json({ error: err?.issues ?? String(err) });
  }
});

export default router;
