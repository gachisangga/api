// /capstone/api/routes/recommend.js
import express from "express";
import { recommendFranchise } from "../scripts/recommendFranchise.js";

const router = express.Router();

/**
 * POST /recommend
 * body: { industrySummary: {업종별 요약}, coords: { latitude, longitude } }
 */
router.post("/", async (req, res) => {
  const { industrySummary, coords } = req.body;

  if (!industrySummary || !coords) {
    return res.status(400).json({ error: "industrySummary와 coords가 필요합니다." });
  }

  try {
    const recommendation = await recommendFranchise(industrySummary, coords);
    res.json({ recommendation });
  } catch (err) {
    res.status(500).json({ error: "추천 생성 실패" });
  }
});

export default router;
