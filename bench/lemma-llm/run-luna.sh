#!/bin/sh
# One luna (Codex gpt-6-luna, xhigh) worker on one shard: bench/lemma-llm/run-luna.sh <shard dir> <NN>
# Same contract as the Claude workers: read shard-NN.tsv, write luna/out-NN.jsonl.
# A shard is claimed with an atomic lock directory, so several pools can share a queue.
set -e
dir="$1"; nn="$2"
mkdir -p "$dir/luna"
mkdir "$dir/luna/lock-$nn" 2>/dev/null || exit 0
cd "$dir"
codex exec -m gpt-6-luna -c model_reasoning_effort=xhigh --skip-git-repo-check --sandbox workspace-write \
  "Read the instructions in PROMPT.md in this directory and follow them exactly. Label every word in shard-$nn.tsv and write the result to luna/out-$nn.jsonl (one JSON object per line, same order and ids). Do not change any other file." \
  > "luna/log-$nn.txt" 2>&1
