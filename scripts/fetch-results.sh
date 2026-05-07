#!/bin/bash
# negagea CDN에서 정시입시결과 PDF 일괄 다운
# 패턴: univ_info{NNNN}/{학교명}_{학년도}학년도_정시입시결과.pdf

cd "$(dirname "$0")/../data/admissions"
mkdir -p results-pdfs results-pdfs-extra

# slug → 학교명(negagea CDN 키)
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
  "dankook_cheonan:단국대학교(천안)" "korea_sejong:고려대학교(세종)"
  "yonsei_mirae:연세대학교(미래)"
)

success=0
fail_list=""
for entry in "${SCHOOLS[@]}"; do
  IFS=":" read -r slug kname <<< "$entry"
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$kname'))")
  for yr_dir_year in "2025:univ_info2025" "2024:univ_info2024" "2023:univ_info2023"; do
    IFS=":" read -r yr dir <<< "$yr_dir_year"
    out="results-pdfs/$slug/${yr}_results.pdf"
    [ -f "$out" ] && continue
    mkdir -p "results-pdfs/$slug"
    url="https://cdn013.negagea.net/dgsmidc/omr/seoul/web/${dir}/${encoded}/${encoded}_${yr}%ED%95%99%EB%85%84%EB%8F%84_%EC%A0%95%EC%8B%9C%EC%9E%85%EC%8B%9C%EA%B2%B0%EA%B3%BC.pdf"
    curl -sL --max-time 12 -A "Mozilla/5.0" -o "$out" "$url" 2>/dev/null
    head=$(xxd -l 4 -p "$out" 2>/dev/null)
    size=$(stat -f%z "$out" 2>/dev/null || echo 0)
    if [ "$head" = "25504446" ] && [ "$size" -gt 30000 ]; then
      success=$((success+1))
      echo "$slug $yr: OK ($size B)"
    else
      rm -f "$out"
    fi
  done
  if ! ls "results-pdfs/$slug" 2>/dev/null | grep -q "."; then
    rmdir "results-pdfs/$slug" 2>/dev/null
    fail_list="$fail_list $slug"
  fi
done
echo "==="
echo "Success: $success"
echo "Failed (no results PDF): $fail_list"
echo "Total results PDFs: $(find results-pdfs -name '*.pdf' | wc -l)"
