#!/bin/bash
# negagea CDN 다년치 입시결과 PDF + 다양한 패턴

cd "$(dirname "$0")/../data/admissions"

declare -a SCHOOLS=(
  "snu:서울대학교" "yonsei:연세대학교" "korea:고려대학교" "sogang:서강대학교"
  "skku:성균관대학교" "hanyang:한양대학교" "cau:중앙대학교" "khu:경희대학교"
  "hufs:한국외국어대학교" "uos:서울시립대학교" "konkuk:건국대학교"
  "dongguk:동국대학교" "hongik:홍익대학교(서울)" "kookmin:국민대학교"
  "ssu:숭실대학교" "sejong:세종대학교" "dankook:단국대학교(죽전)"
  "kw:광운대학교" "mju:명지대학교" "smu:상명대학교" "catholic:가톨릭대학교"
  "ewha:이화여자대학교" "sookmyung:숙명여자대학교" "dongduk:동덕여자대학교"
  "swu:서울여자대학교" "seoultech:서울과학기술대학교" "hansung:한성대학교"
  "skuniv:서경대학교" "inha:인하대학교" "ajou:아주대학교" "gachon:가천대학교"
  "hanyang_erica:한양대학교(ERICA)" "inu:인천대학교" "kau:한국항공대학교"
  "pusan:부산대학교" "knu:경북대학교" "jnu:전남대학교" "cnu:충남대학교"
  "chungbuk:충북대학교" "jbnu:전북대학교" "gnu:경상국립대학교"
  "kangwon:강원대학교" "jejunu:제주대학교" "wku:원광대학교"
  "gwnu:국립강릉원주대학교" "cha:차의과학대학교" "eulji:을지대학교"
  "yu:영남대학교" "chosun:조선대학교" "kmu:계명대학교"
  "sch:순천향대학교" "donga:동아대학교" "kyonggi:경기대학교"
)

# 패턴들 (정시, 수시, 통합)
PATTERNS=(
  "정시입시결과" "수시입시결과" "입시결과" "전형결과" "선발결과"
)
# 디렉토리 (다년치)
DIRS=("univ_info2025" "univ_info2024" "univ_info2023")

success=0
for entry in "${SCHOOLS[@]}"; do
  IFS=":" read -r slug kname <<< "$entry"
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$kname'))")
  mkdir -p "results-pdfs/$slug"
  for dir in "${DIRS[@]}"; do
    yr=${dir##univ_info}
    yr=$((yr+1))  # 2025 dir = 2025학년도
    for pat in "${PATTERNS[@]}"; do
      enc_pat=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$pat'))")
      out="results-pdfs/$slug/${yr}_${pat}.pdf"
      [ -f "$out" ] && continue
      url="https://cdn013.negagea.net/dgsmidc/omr/seoul/web/${dir}/${encoded}/${encoded}_${yr}%ED%95%99%EB%85%84%EB%8F%84_${enc_pat}.pdf"
      curl -sL --max-time 8 -A "Mozilla/5.0" -o "$out" "$url" 2>/dev/null
      head=$(xxd -l 4 -p "$out" 2>/dev/null)
      size=$(stat -f%z "$out" 2>/dev/null || echo 0)
      if [ "$head" = "25504446" ] && [ "$size" -gt 30000 ]; then
        success=$((success+1))
        echo "$slug ${yr}_$pat: $size B"
      else
        rm -f "$out"
      fi
    done
  done
done

echo "==="
echo "신규 추가: $success"
echo "총 results: $(find results-pdfs -name '*.pdf' | wc -l)"
ls results-pdfs | wc -l | xargs echo "학교 수:"
