// fetch-seoul-cmrcl.js
require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const mongoose = require('mongoose');
const Bottleneck = require('bottleneck');
const areas = require('../areas-82.json'); 

const { SEOUL_API_KEY, MONGO_URI } = process.env;
if (!SEOUL_API_KEY || !MONGO_URI) {
  console.error('Missing SEOUL_API_KEY or MONGO_URI in .env');
  process.exit(1);
}

// ----- Mongoose Schema (원시 행 저장, A안) -----
const RawSchema = new mongoose.Schema(
  {
    areaNm: String,
    areaCd: String,
    liveCmrclStts: String,
    areaCmrclLvl: String,
    areaShPaymentCnt: Number,
    areaShPaymentAmtMin: Number,
    areaShPaymentAmtMax: Number,
    rsbLrgCtgr: String,
    rsbMidCtgr: String,
    rsbPaymentLvl: String,
    rsbShPaymentCnt: Number,
    rsbShPaymentAmtMin: Number,
    rsbShPaymentAmtMax: Number,
    rsbMctCnt: Number,
    rsbMctTime: String,
    cmrclMaleRate: Number,
    cmrclFemaleRate: Number,
    cmrcl10Rate: Number,
    cmrcl20Rate: Number,
    cmrcl30Rate: Number,
    cmrcl40Rate: Number,
    cmrcl50Rate: Number,
    cmrcl60Rate: Number,
    cmrclPersonalRate: Number,
    cmrclCorporationRate: Number,
    cmrclTime: Date,            // 가능한 경우 ISO로 파싱
    cmrclTimeRaw: String,       // 원문 보존
    _src: Object                // 응답 원문 일부(디버깅용)
  },
  { timestamps: true }
);

// 업서트 유니크 키: areaCd(or areaNm) + rsbMidCtgr + cmrclTime
RawSchema.index(
  { areaCd: 1, areaNm: 1, rsbMidCtgr: 1, cmrclTime: 1 },
  { unique: true, partialFilterExpression: { rsbMidCtgr: { $exists: true } } }
);

const Raw = mongoose.model('seoul_cmrcl_raw', RawSchema);

// ----- 유틸 -----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toNum(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? undefined : n;
}

function parseTimeMaybe(s) {
  if (!s) return { iso: undefined, raw: undefined };
  const raw = String(s);
  const d1 = new Date(raw);
  if (!isNaN(d1.getTime())) return { iso: d1, raw };
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})\s?(\d{2})(\d{2})?$/);
  if (m) {
    const [_, y, M, d, h, m2] = m.map(Number);
    const d2 = new Date(y, M - 1, d, h || 0, m2 || 0);
    if (!isNaN(d2.getTime())) return { iso: d2, raw };
  }
  return { iso: undefined, raw };
}

function normalizeRow(r) {
  const g = (k) => r[k] ?? r[k.toUpperCase()] ?? r[k.toLowerCase()];
  const { iso, raw } = parseTimeMaybe(g('CMRCL_TIME'));

  return {
    areaNm: g('AREA_NM'),
    areaCd: g('AREA_CD'),
    liveCmrclStts: g('LIVE_CMRCL_STTS'),
    areaCmrclLvl: g('AREA_CMRCL_LVL'),
    areaShPaymentCnt: toNum(g('AREA_SH_PAYMENT_CNT')),
    areaShPaymentAmtMin: toNum(g('AREA_SH_PAYMENT_AMT_MIN')),
    areaShPaymentAmtMax: toNum(g('AREA_SH_PAYMENT_AMT_MAX')),
    rsbLrgCtgr: g('RSB_LRG_CTGR'),
    rsbMidCtgr: g('RSB_MID_CTGR'),
    rsbPaymentLvl: g('RSB_PAYMENT_LVL'),
    rsbShPaymentCnt: toNum(g('RSB_SH_PAYMENT_CNT')),
    rsbShPaymentAmtMin: toNum(g('RSB_SH_PAYMENT_AMT_MIN')),
    rsbShPaymentAmtMax: toNum(g('RSB_SH_PAYMENT_AMT_MAX')),
    rsbMctCnt: toNum(g('RSB_MCT_CNT')),
    rsbMctTime: g('RSB_MCT_TIME'),
    cmrclMaleRate: toNum(g('CMRCL_MALE_RATE')),
    cmrclFemaleRate: toNum(g('CMRCL_FEMALE_RATE')),
    cmrcl10Rate: toNum(g('CMRCL_10_RATE')),
    cmrcl20Rate: toNum(g('CMRCL_20_RATE')),
    cmrcl30Rate: toNum(g('CMRCL_30_RATE')),
    cmrcl40Rate: toNum(g('CMRCL_40_RATE')),
    cmrcl50Rate: toNum(g('CMRCL_50_RATE')),
    cmrcl60Rate: toNum(g('CMRCL_60_RATE')),
    cmrclPersonalRate: toNum(g('CMRCL_PERSONAL_RATE')),
    cmrclCorporationRate: toNum(g('CMRCL_CORPORATION_RATE')),
    cmrclTime: iso,
    cmrclTimeRaw: raw,
    _src: r
  };
}

// ----- API 호출 -----
async function fetchAreaOnce(areaNmOrCd) {
  const base = 'http://openapi.seoul.go.kr:8088';
  const url = `${base}/${SEOUL_API_KEY}/json/citydata_cmrcl/1/5/${encodeURIComponent(areaNmOrCd)}`;
  console.log(`[DEBUG] fetching ${url}`);

  const { data } = await axios.get(url, { timeout: 15000 });

  const rootKey = Object.keys(data).find((k) => k.toLowerCase().includes('citydata'));
  const payload = rootKey ? data[rootKey] : data;
  const result = payload.RESULT || payload.result || {};

  if ((result.resultCode && result.resultCode !== 'INFO-000') ||
      (result.CODE && result.CODE !== 'INFO-000')) {
    throw new Error(`API error: ${JSON.stringify(result)}`);
  }

  const live = payload.LIVE_CMRCL_STTS || {};
  const baseInfo = {
    AREA_NM: payload.AREA_NM,
    AREA_CD: payload.AREA_CD,
    LIVE_CMRCL_STTS: live.AREA_CMRCL_LVL,
    AREA_CMRCL_LVL: live.AREA_CMRCL_LVL,
    AREA_SH_PAYMENT_CNT: live.AREA_SH_PAYMENT_CNT,
    AREA_SH_PAYMENT_AMT_MIN: live.AREA_SH_PAYMENT_AMT_MIN,
    AREA_SH_PAYMENT_AMT_MAX: live.AREA_SH_PAYMENT_AMT_MAX,
    CMRCL_MALE_RATE: live.CMRCL_MALE_RATE,
    CMRCL_FEMALE_RATE: live.CMRCL_FEMALE_RATE,
    CMRCL_10_RATE: live.CMRCL_10_RATE,
    CMRCL_20_RATE: live.CMRCL_20_RATE,
    CMRCL_30_RATE: live.CMRCL_30_RATE,
    CMRCL_40_RATE: live.CMRCL_40_RATE,
    CMRCL_50_RATE: live.CMRCL_50_RATE,
    CMRCL_60_RATE: live.CMRCL_60_RATE,
    CMRCL_PERSONAL_RATE: live.CMRCL_PERSONAL_RATE,
    CMRCL_CORPORATION_RATE: live.CMRCL_CORPORATION_RATE,
    CMRCL_TIME: live.CMRCL_TIME
  };

  const rsbList = Array.isArray(live.CMRCL_RSB) ? live.CMRCL_RSB : [];

  // LIVE_CMRCL_STTS 안의 RSB_MID_CTGR들을 풀어서 row로 반환
  const rows = rsbList.map((rsb) => ({
    ...baseInfo,
    RSB_LRG_CTGR: rsb.RSB_LRG_CTGR,
    RSB_MID_CTGR: rsb.RSB_MID_CTGR,
    RSB_PAYMENT_LVL: rsb.RSB_PAYMENT_LVL,
    RSB_SH_PAYMENT_CNT: rsb.RSB_SH_PAYMENT_CNT,
    RSB_SH_PAYMENT_AMT_MIN: rsb.RSB_SH_PAYMENT_AMT_MIN,
    RSB_SH_PAYMENT_AMT_MAX: rsb.RSB_SH_PAYMENT_AMT_MAX,
    RSB_MCT_CNT: rsb.RSB_MCT_CNT,
    RSB_MCT_TIME: rsb.RSB_MCT_TIME
  }));

  return rows;
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const ops = rows.map((r) => {
    const doc = normalizeRow(r);
    const key = {
      areaCd: doc.areaCd || null,
      areaNm: doc.areaNm || null,
      rsbMidCtgr: doc.rsbMidCtgr || null,
      cmrclTime: doc.cmrclTime || null
    };
    return {
      updateOne: {
        filter: key,
        update: { $set: doc },
        upsert: true
      }
    };
  });
  const res = await Raw.bulkWrite(ops, { ordered: false });
  return (res.upsertedCount || 0) + (res.modifiedCount || 0);
}

// ----- 레이트리미터 -----
const limiter = new Bottleneck({ minTime: 250 });

async function runOnceForAllAreas() {
  let totalSaved = 0;

  for (const { AREA_NM } of areas) {
    const key = AREA_NM.trim();
    try {
      const rows = await limiter.schedule(() => fetchAreaOnce(key));
      const saved = await upsertRows(rows);
      totalSaved += saved;
      console.log(`[OK] ${key} -> rows:${rows.length}, upserted/modified:${saved}`);
      await sleep(150);
    } catch (err) {
      console.error(`[FAIL] ${key}:`, err.message);
    }
  }

  return totalSaved;
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: 'CapstoneDB' });
    console.log('Mongo connected');

    const saved = await runOnceForAllAreas();
    console.log('Done. total saved:', saved);
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
