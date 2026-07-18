#!/usr/bin/env node
// EBSi 기출문제 목록에서 특정 연도·학년의 공개 PDF 링크를 조회한다.
// 데이터 파일은 수정하지 않고 정규화 전 원본 목록만 stdout으로 출력한다.

const endpoint = 'https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax';
const downloadBase = 'https://wdown.ebsi.co.kr/W61001/01exam';

function formBody(year, targetCd, page) {
  return new URLSearchParams({
    targetCd,
    yearList: String(year),
    monthList: '03,04,05,06,07,08,09,10,11,12',
    arOrd: '1,2,3,4,5,6,7,8',
    subjIdList: 'firstEnter',
    currentPage: String(page),
    sort: 'recent',
    paperId: '',
    paperNo: '',
    lvl: '',
    year: String(year),
    monthAll: 'all',
    korArOrd: '1',
    mathArOrd: '2',
    engArOrd: '3',
    hisArOrd: '4',
    srch1ArOrd: '5',
    srch2ArOrd: '6',
    jobArOrd: '7',
    scndForgnlngArOrd: '8',
  });
}

function text(html) {
  return html.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').trim();
}

function parseCards(html) {
  const starts = [...html.matchAll(/<div class="qus_box\b[^\"]*"\s*>/g)].map(m => m.index);
  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i], starts[i + 1] ?? html.length);
    const flags = [...block.matchAll(/<span class="flag_subject_col[^\"]*">([^<]+)<\/span>/g)]
      .map(m => text(m[1]));
    const titleMatch = block.match(/<div class="qus_tit">([^<]+)<\/div>/);
    if (!titleMatch || flags.length < 3) continue;

    const downloads = {};
    for (const m of block.matchAll(/goDownLoad([PJH])\(\s*'([^']+)'/g)) {
      downloads[m[1]] = m[2].startsWith('http') ? m[2] : downloadBase + m[2];
    }
    cards.push({
      year: Number(flags[0]),
      month: Number(flags[1].replace(/\D/g, '')),
      subjectFlag: flags[2],
      title: text(titleMatch[1]),
      downloads,
    });
  }
  return cards;
}

export async function fetchPaperList(year, grade) {
  if (!Number.isInteger(year) || ![1, 2, 3].includes(grade)) {
    throw new TypeError('year는 정수, grade는 1|2|3이어야 합니다.');
  }
  const targetCd = `D${grade}00`;
  const referer = `https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=${targetCd}`;
  const cards = [];
  const seen = new Set();
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer,
        'User-Agent': 'Mozilla/5.0',
      },
      body: formBody(year, targetCd, page),
    });
    if (!response.ok) throw new Error(`EBSi 목록 HTTP ${response.status} (page ${page})`);
    const pageCards = parseCards(await response.text());
    if (!pageCards.length) break;

    let added = 0;
    for (const card of pageCards) {
      const key = `${card.month}\t${card.title}\t${card.downloads.P ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
      added++;
    }
    if (!added) break;
  }
  return cards;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i], process.argv[i + 1]);
  }
  const year = Number(args.get('--year'));
  const grade = Number(args.get('--grade'));
  if (!Number.isInteger(year) || ![1, 2, 3].includes(grade)) {
    console.error('usage: node scripts/fetch-ebsi-paper-list.mjs --year YYYY --grade 1|2|3');
    process.exit(2);
  }
  const cards = await fetchPaperList(year, grade);
  console.log(JSON.stringify({ year, grade, count: cards.length, cards }, null, 2));
}
