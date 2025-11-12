// app.js
import express from "express";
import cors from "cors";
import "dotenv/config"; // .env 로드
import recommendRouter from "./routes/recommend.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // 외부 기기 테스트 대비
const BASE_PATH = "/api/v1";                // 라우터 프리픽스

/** ── 공통 미들웨어 ───────────────────────────────────────────── */
app.use(cors({
  // 필요 시 origin 화이트리스트로 좁혀도 됨
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));    // body-parser 대체

/** ── 헬스체크 ────────────────────────────────────────────────── */
app.get("/healthz", (_req, res) => res.json({ ok: true, msg: "server alive" }));

/** ── 추천 API 라우터 마운트 ────────────────────────────────────
 * recommend.js 안에서:
 *   GET  /_ping
 *   POST /recommendations
 * 등을 정의해두었으므로,
 * 실제 경로는 아래 BASE_PATH가 앞에 붙어 노출됩니다.
 *   GET  /api/v1/_ping
 *   POST /api/v1/recommendations
 */
app.use(BASE_PATH, recommendRouter);

/** ── 404 핸들러 ──────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

/** ── 에러 핸들러(선택: Zod/기타 에러 메시지 노출) ───────────── */
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  const body = {
    error: err?.message || "Internal Server Error",
    issues: err?.issues || undefined, // zod 에러일 때
  };
  if (status >= 500) {
    // 서버 에러는 콘솔에 자세히
    console.error("[SERVER ERROR]", err);
  }
  res.status(status).json(body);
});

/** ── 부팅: 등록된 라우트 로그 출력(디버그 핵심) ─────────────── */
function printRoutes() {
  const lines = [];
  const stack = app._router?.stack || [];
  const walk = (prefix, layer) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods)
        .map((m) => m.toUpperCase())
        .join(",");
      lines.push(`${methods.padEnd(7)} ${prefix}${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle?.stack) {
      const newPrefix = (layer.regexp && layer.regexp.fast_slash) ? prefix : prefix;
      layer.handle.stack.forEach((l) => walk(prefix, l));
    }
  };
  stack.forEach((l) => {
    // mount된 경로 추론
    const match = l?.regexp?.toString?.() || "";
    const mount = match.includes(BASE_PATH) ? BASE_PATH : "";
    if (l?.handle?.stack) l.handle.stack.forEach((ll) => walk(mount, ll));
    else walk("", l);
  });
  console.log("== Registered routes ==");
  lines
    .filter((s) => s.includes("/_ping") || s.includes("/recommendations") || s.includes("/health"))
    .forEach((s) => console.log(" ", s));
}

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  printRoutes();
  console.log(`➡️  Ping:    curl http://localhost:${PORT}${BASE_PATH}/_ping`);
  console.log(`➡️  Health:  curl http://localhost:${PORT}/healthz`);
  console.log(`➡️  Reco:    curl -X POST http://localhost:${PORT}${BASE_PATH}/recommendations \\`);
  console.log(`               -H "Content-Type: application/json" \\`);
  console.log(`               -d '{"lat":37.56,"lng":126.98,"radius":300,"topK":5,"pois":[{"lat":37.56,"lon":126.98,"indsLclsNm":"카페/디저트","signguNm":"용산구"}]}'`);
});
