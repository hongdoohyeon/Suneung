'use strict';
// 수능 D-day 계산.
// 평가원이 매년 발표하는 정확한 시행일을 우선 사용. 미발표시 11월 셋째 주 목요일로 추정.

// 알려진 시행일 (평가원 공식 발표 기준).
// 매년 새 시행일 발표되면 추가.
const KNOWN_DATES = {
  2026: '2025-11-13',  // 2026학년도 수능 (목)
  2027: '2026-11-12',  // 2027학년도 수능 (목)
  2028: '2027-11-18',  // 2028학년도 수능 (예시 — 평가원 발표 후 정정)
};

// 11월 셋째 주 목요일 추정 (1일이 무슨 요일이든 셋째 주 목요일은 15~21일 중).
function thirdThursdayOfNov(year) {
  const nov1 = new Date(year, 10, 1);
  // 첫 번째 목요일 (4 = Thu, 0 = Sun)
  const firstThurDay = ((4 - nov1.getDay()) + 7) % 7 + 1;
  return new Date(year, 10, firstThurDay + 14);  // 셋째 주
}

function nextCsatDate(now = new Date()) {
  const year = now.getFullYear();
  // 올해 11월 시행일 추정 (혹은 known) → 그 후 학년도 = year+1
  const candidates = [
    KNOWN_DATES[year + 1] ? new Date(KNOWN_DATES[year + 1]) : thirdThursdayOfNov(year),
    KNOWN_DATES[year + 2] ? new Date(KNOWN_DATES[year + 2]) : thirdThursdayOfNov(year + 1),
  ];
  // now 이후 첫 후보 (자정 기준)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return candidates.find(d => d >= today) || candidates[1];
}

function gradeYearOf(date) {
  // 11월 시행 → 학년도 = 연도 + 1
  return date.getFullYear() + 1;
}

export function getDdayInfo(now = new Date()) {
  const target = nextCsatDate(now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target - today;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const gradeYear = gradeYearOf(target);
  const isToday = days === 0;
  const passed = days < 0;
  return {
    days,
    gradeYear,
    target,
    targetLabel: `${target.getFullYear()}.${String(target.getMonth() + 1).padStart(2, '0')}.${String(target.getDate()).padStart(2, '0')}`,
    isToday,
    passed,
    label: passed
      ? `D+${-days}`
      : (isToday ? 'D-DAY' : `D-${days}`),
    full: passed
      ? `${gradeYear}학년도 수능 시행일이 지났어요`
      : (isToday
          ? `${gradeYear}학년도 수능 — 오늘!`
          : `${gradeYear}학년도 수능까지 ${days}일`),
  };
}
