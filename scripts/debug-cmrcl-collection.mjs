// scripts/debug-cmrcl-collection.mjs
import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || "CapstoneDB";

async function main() {
  console.log("🔌 MONGO_URI:", uri);
  console.log("📚 DB_NAME:", dbName);

  if (!uri) {
    console.error("❌ MONGO_URI가 .env에 없습니다.");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log("✅ Mongo connected");

  const db = client.db(dbName);

  // 1) 컬렉션 목록
  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);
  console.log("📂 Collections:", names);

  // 2) 상권 컬렉션 후보 이름들 확인
  const candidates = [
    "seoul_cmrcl_raws",
    "seoulCmrclRaws",
    "seoul_cmrcl_raw",
    "seoulCmrclRaw",
  ];

  for (const name of candidates) {
    if (!names.includes(name)) continue;

    const col = db.collection(name);
    const count = await col.countDocuments();
    console.log(`\n[${name}] 문서 수:`, count);

    const one = await col.findOne();
    console.log(`[${name}] 샘플 문서:`, one);
  }

  await client.close();
  console.log("🔚 Done");
}

main().catch((err) => {
  console.error("❌ Error in debug script:", err);
  process.exit(1);
});
