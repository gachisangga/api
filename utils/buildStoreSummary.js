// utils/buildStoreSummary.js

export function buildStoreSummary(stores = []) {
  if (!Array.isArray(stores) || stores.length === 0) {
    return {
      totalStores: 0,
      summaryLine: "반경 내 등록된 상가 정보가 거의 없습니다.",
      topL: [],
      topM: [],
      topS: [],
      competitionByS: {},
    };
  }

  const byL = {};
  const byM = {};
  const byS = {};

  for (const s of stores) {
    const L = s.indsLclsNm || "기타";
    const M = s.indsMclsNm || "기타";
    const S = s.indsSclsNm || "기타";

    byL[L] = (byL[L] || 0) + 1;
    byM[M] = (byM[M] || 0) + 1;
    byS[S] = (byS[S] || 0) + 1;
  }

  const totalStores = stores.length;

  const sortTop = (obj, n = 5) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({
        name,
        count,
        share: count / totalStores,
      }));

  const topL = sortTop(byL);
  const topM = sortTop(byM);
  const topS = sortTop(byS);

  const competitionByS = {};
  for (const [name, count] of Object.entries(byS)) {
    const share = count / totalStores;
    let label = "보통";
    if (share >= 0.15) label = "이미 점포가 많은 편";
    else if (share <= 0.03 && totalStores >= 20) label = "거의 없는 편";
    competitionByS[name] = { count, share, label };
  }

  let summaryLine = "";
  if (topL.length) {
    const firstL = topL[0];
    summaryLine = `반경 내 상가 ${totalStores}개 중 ${firstL.name} 업종이 약 ${(firstL.share * 100).toFixed(
      1
    )}%로 가장 많습니다.`;
  } else {
    summaryLine = `반경 내 상가 ${totalStores}개가 분포해 있습니다.`;
  }

  return {
    totalStores,
    byL,
    byM,
    byS,
    topL,
    topM,
    topS,
    competitionByS,
    summaryLine,
  };
}
