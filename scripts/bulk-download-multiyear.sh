#!/bin/bash
# negagea CDN 다년치 batch download
# univ_info{NNNN} 디렉토리 → {NNNN+1}학년도 PDF
cd "$(dirname "$0")/../data/admissions/pdfs"

# 학교명 매핑 (실패한 hongik/dankook은 캠퍼스 표기 포함)
declare -a TARGETS=(
  "한양대학교:hanyang"
  "성균관대학교:skku"
  "중앙대학교:cau"
  "경희대학교:khu"
  "한국외국어대학교:hufs"
  "이화여자대학교:ewha"
  "건국대학교:konkuk"
  "동국대학교:dongguk"
  "홍익대학교(서울):hongik"
  "국민대학교:kookmin"
  "숭실대학교:ssu"
  "세종대학교:sejong"
  "단국대학교(죽전):dankook"
  "광운대학교:kw"
  "명지대학교:mju"
  "상명대학교:smu"
  "가톨릭대학교:catholic"
  "숙명여자대학교:sookmyung"
  "동덕여자대학교:dongduk"
  "서울여자대학교:swu"
  "서울과학기술대학교:seoultech"
  "한성대학교:hansung"
  "서경대학교:skuniv"
  "인하대학교:inha"
  "아주대학교:ajou"
  "가천대학교:gachon"
  "한양대학교(ERICA):hanyang_erica"
  "인천대학교:inu"
  "한국항공대학교:kau"
  "부산대학교:pusan"
  "경북대학교:knu"
  "전남대학교:jnu"
  "충남대학교:cnu"
  "충북대학교:chungbuk"
  "전북대학교:jbnu"
  "경상국립대학교:gnu"
  "강원대학교:kangwon"
  "제주대학교:jejunu"
  "차의과학대학교:cha"
  "을지대학교:eulji"
  "경기대학교:kyonggi"
  "순천향대학교:sch"
  "국립강릉원주대학교:gwnu"
  "영남대학교:yu"
  "조선대학교:chosun"
  "계명대학교:kmu"
  "동아대학교:donga"
)

# univ_info{NNNN} → {NNNN+1}학년도
declare -a YEARS_DIR=(
  "2024:2025"  # univ_info2024 → 2025학년도
  "2023:2024"  # univ_info2023 → 2024학년도
  "2022:2023"  # univ_info2022 → 2023학년도
  "2021:2022"  # univ_info2021 → 2022학년도
)

success=0
fail=0
for entry in "${TARGETS[@]}"; do
  IFS=":" read -r kname slug <<< "$entry"
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$kname'))")
  for ydir in "${YEARS_DIR[@]}"; do
    IFS=":" read -r dir_yr file_yr <<< "$ydir"
    out="$slug/${file_yr}_guide.pdf"
    if [ -f "$out" ]; then continue; fi
    mkdir -p "$slug"
    url="https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info${dir_yr}/${encoded}/${encoded}_${file_yr}%ED%95%99%EB%85%84%EB%8F%84_%EC%A0%95%EC%8B%9C%EB%AA%A8%EC%A7%91%EC%9A%94%EA%B0%95.pdf"
    curl -sL --max-time 12 -o "$out" -A "Mozilla/5.0" "$url"
    head=$(xxd -l 4 -p "$out" 2>/dev/null)
    size=$(stat -f%z "$out" 2>/dev/null || echo 0)
    if [ "$head" = "25504446" ] && [ "$size" -gt 50000 ]; then
      echo "$slug $file_yr: OK ($size)"
      success=$((success+1))
    else
      rm -f "$out"
      fail=$((fail+1))
    fi
  done
done

echo "==="
echo "success=$success, fail=$fail"
echo "Total PDFs: $(find . -name '*.pdf' | wc -l)"
