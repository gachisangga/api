// scripts/fetchPopulation.js
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');

const { SERVICE_KEY, MONGO_URI } = process.env;
if (!SERVICE_KEY || !MONGO_URI) {
  console.error('Missing env: SERVICE_KEY or MONGO_URI');
  process.exit(1);
}

// 올바른 엔드포인트 (…Ppltn/selectAdmmSexdAgePpltn)
const BASE_URL = 'https://apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn';

// ---------- Date helpers ----------
// --- Date helpers ---
function yyyymm(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}
function addMonths(ym, delta) {
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(4), 10);
  const date = new Date(y, m - 1 + delta, 1);
  return yyyymm(date);
}

// CLI: node scripts/fetchPopulation.js 202510  ← 이렇게 넣으면 해당 월만
const ymArg = process.argv.slice(2).find(v => /^\d{6}$/.test(v));

// 최근 3개월(현재월 포함). 단, ymArg 있으면 그 월만.
const TO = yyyymm(new Date());
const months = ymArg ? [ymArg] : [addMonths(TO, 0), addMonths(TO, -1), addMonths(TO, -2)];


// ---------- Mongo schema ----------
const PopulationStatSchema = new mongoose.Schema(
  {
    statsYm: { type: String, index: true, required: true },
    admmCd: { type: String, index: true, required: true },
    ctpvNm: String,
    sggNm: String,
    dongNm: String,
    tong: String,
    ban: String,
    totNmprCnt: Number,
    maleNmprCnt: Number,
    femlNmprCnt: Number,
    male0AgeNmprCnt: Number,
    male10AgeNmprCnt: Number,
    male20AgeNmprCnt: Number,
    male30AgeNmprCnt: Number,
    male40AgeNmprCnt: Number,
    male50AgeNmprCnt: Number,
    male60AgeNmprCnt: Number,
    male70AgeNmprCnt: Number,
    male80AgeNmprCnt: Number,
    male90AgeNmprCnt: Number,
    male100AgeNmprCnt: Number,
    feml0AgeNmprCnt: Number,
    feml10AgeNmprCnt: Number,
    feml20AgeNmprCnt: Number,
    feml30AgeNmprCnt: Number,
    feml40AgeNmprCnt: Number,
    feml50AgeNmprCnt: Number,
    feml60AgeNmprCnt: Number,
    feml70AgeNmprCnt: Number,
    feml80AgeNmprCnt: Number,
    feml90AgeNmprCnt: Number,
    feml100AgeNmprCnt: Number,
    src: { type: String, default: 'apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn' },
    fetchedAt: { type: Date, default: Date.now },
  },
  { collection: 'population_stats' }
);
PopulationStatSchema.index({ statsYm: 1, admmCd: 1, tong: 1, ban: 1 }, { unique: true });
const PopulationStat = mongoose.model('PopulationStat', PopulationStatSchema);

// ---------- Utils ----------
const toInt = (v) => {
  if (v === undefined || v === null) return null;
  const n = parseInt(String(v).replace(/,/g, ''), 10);
  return Number.isNaN(n) ? null : n;
};
function normalizeItem(raw) {
  const x = { ...raw };
  // 원본 필드에 공백이 섞여 오는 케이스 보정
  if (x['feml0AgeNmprCnt '] != null && x.feml0AgeNmprCnt == null) {
    x.feml0AgeNmprCnt = x['feml0AgeNmprCnt '];
    delete x['feml0AgeNmprCnt '];
  }
  return x;
}
function mapToDoc(item) {
  const x = normalizeItem(item);
  return {
    statsYm: x.statsYm,
    admmCd: x.admmCd,
    ctpvNm: x.ctpvNm,
    sggNm: x.sggNm,
    dongNm: x.dongNm,
    tong: x.tong || '',
    ban: x.ban || '',
    totNmprCnt: toInt(x.totNmprCnt),
    maleNmprCnt: toInt(x.maleNmprCnt),
    femlNmprCnt: toInt(x.femlNmprCnt),
    male0AgeNmprCnt: toInt(x.male0AgeNmprCnt),
    male10AgeNmprCnt: toInt(x.male10AgeNmprCnt),
    male20AgeNmprCnt: toInt(x.male20AgeNmprCnt),
    male30AgeNmprCnt: toInt(x.male30AgeNmprCnt),
    male40AgeNmprCnt: toInt(x.male40AgeNmprCnt),
    male50AgeNmprCnt: toInt(x.male50AgeNmprCnt),
    male60AgeNmprCnt: toInt(x.male60AgeNmprCnt),
    male70AgeNmprCnt: toInt(x.male70AgeNmprCnt),
    male80AgeNmprCnt: toInt(x.male80AgeNmprCnt),
    male90AgeNmprCnt: toInt(x.male90AgeNmprCnt),
    male100AgeNmprCnt: toInt(x.male100AgeNmprCnt),
    feml0AgeNmprCnt: toInt(x.feml0AgeNmprCnt),
    feml10AgeNmprCnt: toInt(x.feml10AgeNmprCnt),
    feml20AgeNmprCnt: toInt(x.feml20AgeNmprCnt),
    feml30AgeNmprCnt: toInt(x.feml30AgeNmprCnt),
    feml40AgeNmprCnt: toInt(x.feml40AgeNmprCnt),
    feml50AgeNmprCnt: toInt(x.feml50AgeNmprCnt),
    feml60AgeNmprCnt: toInt(x.feml60AgeNmprCnt),
    feml70AgeNmprCnt: toInt(x.feml70AgeNmprCnt),
    feml80AgeNmprCnt: toInt(x.feml80AgeNmprCnt),
    feml90AgeNmprCnt: toInt(x.feml90AgeNmprCnt),
    feml100AgeNmprCnt: toInt(x.feml100AgeNmprCnt),
  };
}

// ---------- API fetchers ----------
const HEADERS = { Accept: 'application/json' };
const LEVELS = ['4', '3', '2', '1']; // 이 줄이 반드시 fetchRobust 위에 존재해야 함

const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });

async function fetchOneMonth(admmCd, ym, lv) {
  let pageNo = 1;
  const rows = 100;
  const out = [];

  while (true) {
    const url =
      `${BASE_URL}?serviceKey=${SERVICE_KEY}` +
      `&admmCd=${admmCd}` +
      `&srchFrYm=${ym}&srchToYm=${ym}` +
      `&lv=${lv}` +
      `&regSeCd=1` +
      `&numOfRows=${rows}&pageNo=${pageNo}`;

    const resp = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    const data = await parser.parseStringPromise(resp.data); // XML → JS Object

    const { resultCode, resultMsg } = data.Response.head;
    if (resultCode !== '0') {
      console.warn(`[API] ${resultCode} ${resultMsg}`);
      break;
    }

    let items = [];
    if (data.Response.items && data.Response.items.item) {
      items = Array.isArray(data.Response.items.item)
        ? data.Response.items.item
        : [data.Response.items.item];
    }

    out.push(...items);
    if (items.length < rows) break;
    pageNo += 1;
  }

  return out;
}


async function fetchRobust(admmCd, ym) {
  for (const lv of LEVELS) {
    try {
      console.log(`[Fetch] ${ym} lv=${lv} …`);
      const rows = await fetchOneMonth(admmCd, ym, lv);
      if (rows.length === 0) {
        console.log(`[Fetch] ${ym} lv=${lv} → 0건`);
        // 0건이면 다음 레벨 시도
        continue;
      }
      console.log(`[Fetch] ${ym} lv=${lv} → ${rows.length}건`);
      return rows;
    } catch (e) {
      if (e.response) {
        console.error('[API BODY]', e.response.status, e.response.headers?.['content-type'], e.response.data);
      }
      console.warn(`[Fetch] ${ym} lv=${lv} 실패: ${e.message}`);
      continue;
    }
  }
  console.warn(`[Fetch] ${ym} 모든 레벨에서 수집 실패(미게시 가능).`);
  return [];
}

async function saveBulk(items) {
  if (!items.length) return { upserted: 0, modified: 0, matched: 0 };
  const ops = items.map((it) => {
    const doc = mapToDoc(it);
    return {
      updateOne: {
        filter: { statsYm: doc.statsYm, admmCd: doc.admmCd, tong: doc.tong || '', ban: doc.ban || '' },
        update: { $set: doc, $setOnInsert: { fetchedAt: new Date() } },
        upsert: true,
      },
    };
  });
  const res = await PopulationStat.bulkWrite(ops, { ordered: false });
  return {
    matched: res.nMatched ?? 0,
    upserted: res.nUpserted ?? (res.upsertedCount || 0),
    modified: res.nModified ?? (res.modifiedCount || 0),
  };
}

// ---------- Main ----------
async function main() {
  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 });
  await PopulationStat.init();

  const admmCd = '1100000000'; // 서울특별시

  let total = 0;
  for (const ym of months) {
    const rows = await fetchRobust(admmCd, ym);
    if (rows.length === 0) continue;
    const r = await saveBulk(rows);
    total += r.upserted + r.modified;
    console.log(`[Save] ${ym} → upserted=${r.upserted}, modified=${r.modified}, matched=${r.matched}`);
  }

  console.log(`[Done] 총 반영 문서 수(추정) = ${total}`);
  console.log(resp.data)
  await mongoose.disconnect();
}

if (require.main === module) main();
