// utils/buildAreaSummary.js

// 인구 + 상권 + 상권유형(rsbList) 기반 요약 생성
export function buildAreaSummary({
  baseInfo = {},
  populationDoc = null,
  rsbList = [],
}) {
  const {
    AREA_NM,
    AREA_CD,
    ctpvNm,
    sggNm,
    CMRCL_20_RATE,
    CMRCL_30_RATE,
    CMRCL_FEMALE_RATE,
    AREA_SH_PAYMENT_CNT,
    AREA_CMRCL_LVL,
  } = baseInfo;

  // 🔹 기본 위치 라벨
  const locationLabel = [ctpvNm, sggNm, AREA_NM].filter(Boolean).join(" ");

  // 🔹 총 인구
  const total = populationDoc?.totNmprCnt ?? null;

  // ===================================================================
  // 1) 연령대별 분포(20·30·40·50·60·70·80대) + 남녀 합계 계산
  // ===================================================================
  let ageBands = [];
  let femaleFromBands = 0;
  let maleFromBands = 0;

  if (populationDoc && total && total > 0) {
    const bandDefs = [
      { label: "20대", key: "20" },
      { label: "30대", key: "30" },
      { label: "40대", key: "40" },
      { label: "50대", key: "50" },
      { label: "60대", key: "60" },
      { label: "70대", key: "70" },
      { label: "80대+", key: "80" },
    ];

    ageBands = bandDefs.map(({ label, key }) => {
      const m = populationDoc[`male${key}AgeNmprCnt`] ?? 0;
      const f = populationDoc[`feml${key}AgeNmprCnt`] ?? 0;
      const count = m + f;

      maleFromBands += m;
      femaleFromBands += f;

      return {
        label,
        count,
        rate: total > 0 ? count / total : 0,
      };
    });
  }

  // ===================================================================
  // 2) 20대/30대 비율 (가능하면 인구 데이터로 계산, 안 되면 baseInfo 값 사용)
  // ===================================================================
  let age20Rate = null;
  let age30Rate = null;

  if (populationDoc && total && total > 0) {
    const cnt20 =
      (populationDoc.male20AgeNmprCnt ?? 0) +
      (populationDoc.feml20AgeNmprCnt ?? 0);
    const cnt30 =
      (populationDoc.male30AgeNmprCnt ?? 0) +
      (populationDoc.feml30AgeNmprCnt ?? 0);

    age20Rate = cnt20 / total;
    age30Rate = cnt30 / total;
  } else {
    // fallback: 라우터에서 넣어준 비율(이미 0~1 스케일이라고 가정)
    age20Rate = CMRCL_20_RATE ?? null;
    age30Rate = CMRCL_30_RATE ?? null;
  }

  // ===================================================================
  // 3) 성별 비율 (가능하면 연령대 합계로 계산, 안 되면 baseInfo 값 사용)
  // ===================================================================
  let femaleRate = null;
  let maleRate = null;

  const bandTotal = femaleFromBands + maleFromBands;
  if (bandTotal > 0) {
    femaleRate = femaleFromBands / bandTotal;
    maleRate = maleFromBands / bandTotal;
  } else if (CMRCL_FEMALE_RATE != null) {
    // ⚠️ 여기서는 CMRCL_FEMALE_RATE가 이미 0~1 스케일이라고 가정
    // (routes/recommend.js에서 퍼센트를 0~1로 변환해서 넣어줌)
    const raw = Number(CMRCL_FEMALE_RATE);
    const f = raw <= 1 ? raw : raw / 100; // 혹시 실수로 54.1이 들어와도 방어
    femaleRate = f;
    maleRate = 1 - f;
  }

  const pct = (x) =>
    x == null ? null : `${(x * 100).toFixed(1)}%`;

  // 총 인구 텍스트
  const totalLabel =
    total != null
      ? `총 인구 ${Number(total).toLocaleString("ko-KR")}명`
      : null;

  // 성별 비율 텍스트 (여성 51.2%, 남성 48.8%)
  const genderLabel =
    femaleRate != null && maleRate != null
      ? `여성 ${pct(femaleRate)}, 남성 ${pct(maleRate)}`
      : null;

  // 예전 요약용 "여성 비중이 높은/남성 비중이 높은"
  const genderBiasLabel =
    femaleRate != null
      ? femaleRate >= 0.5
        ? "여성 비중이 높은"
        : "남성 비중이 높은"
      : null;

  // 메인 연령대 요약 (20대가 많은 동네 / 30대가 많은 동네)
  const mainAgeLabel =
    age20Rate != null && age30Rate != null
      ? age20Rate >= age30Rate
        ? "20대가 많은 동네"
        : "30대가 많은 동네"
      : null;

  // 20·30대 합쳐서 보기 좋게 (예: 20·30대 비중 43.5%)
  const youngShare =
    age20Rate != null && age30Rate != null
      ? age20Rate + age30Rate
      : null;
  const youngSummaryLabel =
    youngShare != null
      ? `20·30대 비중 ${(youngShare * 100).toFixed(1)}%`
      : null;

  // ===================================================================
  // 4) 상권 유형(rsb) 한 줄 설명
  // ===================================================================
  let typeLabel = null;
  const rsb = Array.isArray(rsbList) ? rsbList : [];
  if (rsb.length > 0) {
    const top = rsb[0];
    const name = top.rsbTpNm ?? top.typeNm ?? null;
    if (name) {
      typeLabel = `${name} 비중이 높은 상권`;
    }
  }

  // ===================================================================
  // 5) 결제 강도/상권 레벨 요약
  // ===================================================================
  const paymentCnt = AREA_SH_PAYMENT_CNT ?? 0;
  const cmrclLevelScore = AREA_CMRCL_LVL ?? 0;

  let paymentLevelLabel;
  if (!paymentCnt || paymentCnt <= 0) {
    paymentLevelLabel = "결제 데이터가 거의 없는 상권";
  } else if (paymentCnt >= 100000) {
    paymentLevelLabel = "결제 건수가 많은 활성 상권";
  } else {
    paymentLevelLabel = "결제 건수는 보통 수준의 상권";
  }

  const paymentLabel =
    paymentCnt > 0
      ? `월 카드 결제 ${Number(paymentCnt).toLocaleString(
          "ko-KR"
        )}건`
      : null;

  let cmrclLevelLabel = null;
  if (cmrclLevelScore >= 0.7) {
    cmrclLevelLabel = "핵심 상권에 가까운 수준";
  } else if (cmrclLevelScore >= 0.4) {
    cmrclLevelLabel = "중간 정도의 상권 레벨";
  } else if (cmrclLevelScore > 0) {
    cmrclLevelLabel = "상대적으로 조용한 상권";
  }

  let commerceComment = null;
  if (paymentCnt > 0) {
    if (paymentCnt >= 80000 && cmrclLevelScore >= 0.6) {
      commerceComment =
        "주중·주말 모두 유동과 소비가 꾸준한 편입니다.";
    } else if (paymentCnt >= 30000) {
      commerceComment =
        "일정 수준의 유동과 소비가 지속되는 상권입니다.";
    } else {
      commerceComment =
        "유동과 소비가 아주 높은 편은 아니지만, 기본 수요는 존재하는 상권입니다.";
    }
  }

  // ===================================================================
  // 6) 한 줄 요약
  // ===================================================================
  const parts = [];
  if (mainAgeLabel) parts.push(mainAgeLabel);
  if (genderBiasLabel) parts.push(genderBiasLabel);
  if (typeLabel) parts.push(typeLabel);

  const summaryLine =
    locationLabel && parts.length
      ? `${locationLabel}은 ${parts.join(", ")}입니다.`
      : locationLabel || null;

  // 🔹 최종 리턴 구조
  return {
    locationLabel, // "서울특별시 마포구 서교동" 같은 풀 위치
    areaCd: AREA_CD ?? null,

    population: {
      total,
      totalLabel, // "총 인구 12,340명"
      age20Rate,
      age30Rate,
      femaleRate,
      maleRate,
      mainAgeLabel, // "20대가 많은 동네"
      genderLabel, // "여성 51.2%, 남성 48.8%"
      genderBiasLabel, // "여성 비중이 높은" (요약용)
      youngSummaryLabel, // "20·30대 비중 43.5%"
      ageBands, // [{ label:"20대", count:..., rate:... }, ...]
    },

    commerce: {
      paymentCnt,
      cmrclLevelScore,
      paymentLevelLabel, // "결제 건수가 많은 활성 상권"
      paymentLabel, // "월 카드 결제 28,000건"
      cmrclLevelLabel, // "핵심 상권에 가까운 수준" 등
      comment: commerceComment,
    },

    typeLabel, // "주거+상업 혼합형 상권" 같은 한 줄
    summaryLine, // "서울특별시 마포구 서교동은 20대가 많은 동네, 여성 비중이 높은, OO형 상권입니다."
  };
}
