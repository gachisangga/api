// app.js
import express from "express";
import cors from "cors";
import "dotenv/config";             // .env 로드
import recommendRouter from "./routes/recommend.js";

const app = express();
const PORT = process.env.PORT || 3000;

// 공통 미들웨어
app.use(cors());
app.use(express.json());            // body-parser 대신

// 헬스체크
app.get("/health", (_req, res) => res.json({ ok: true }));

// 추천 API 라우터 (추천)
//   - recommend.js 안에서 /recommendations, /recommendations/brands 등 경로를 정의
app.use("/api/v1", recommendRouter);

// 404 핸들러(선택)
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
