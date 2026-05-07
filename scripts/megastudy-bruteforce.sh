#!/bin/bash
# file.megastudy.net 학교 코드 brute-force.
# 학교코드 패턴: X{학년도2}E{지역2}{학교3}.pdf
# 지역: 01~15. 학교번호: 001~030.
# 2026 정시 (X26E*) 일괄 시도. PDF magic byte 매칭만 저장.

OUT_DIR="/tmp/megastudy_bf"
mkdir -p "$OUT_DIR"
SUCCESS=0
TRIED=0

for region in 01 02 03 04 05 06 07 08 09 10 11 12; do
  for school in 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 021 022 023 024 025 030; do
    code="${region}${school}"
    out="$OUT_DIR/X26E${code}.pdf"
    TRIED=$((TRIED+1))
    curl -sL --max-time 5 -A "Mozilla/5.0" -o "$out" \
      "https://file.megastudy.net/FileServer/UNI_HWP/non_file/26jungsi/X26E${code}.pdf"
    head=$(xxd -l 4 -p "$out" 2>/dev/null)
    size=$(stat -f%z "$out" 2>/dev/null || echo 0)
    if [ "$head" = "25504446" ] && [ "$size" -gt 50000 ]; then
      SUCCESS=$((SUCCESS+1))
      echo "OK X26E${code}: ${size} bytes"
    else
      rm -f "$out"
    fi
  done
done

echo "==="
echo "tried=$TRIED success=$SUCCESS"
echo "PDFs in $OUT_DIR:"
ls "$OUT_DIR" | wc -l
