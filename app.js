import express from "express";
import bodyParser from "body-parser";
import recommendRouter from "./routes/recommend.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// 추천 API 등록
app.use("/recommend", recommendRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
