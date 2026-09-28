#!/bin/sh
# Run luna over every shard of a directory that has no complete output yet, N at a time:
#   bench/lemma-llm/pool-luna.sh <shard dir> [N]
dir="$1"; n="${2:-6}"
here="$(cd "$(dirname "$0")" && pwd)"
for f in "$dir"/shard-*.tsv; do
  nn=$(basename "$f" .tsv | sed 's/shard-//')
  out="$dir/luna/out-$nn.jsonl"
  if [ -f "$out" ] && [ "$(wc -l < "$out")" -ge "$(wc -l < "$f")" ]; then continue; fi
  echo "$nn"
done | ${ORDER:-cat} | xargs -P "$n" -I{} sh -c "\"$here/run-luna.sh\" \"$dir\" {} && echo \"done {}\" || echo \"FAILED {}\""
echo ALL-DONE
