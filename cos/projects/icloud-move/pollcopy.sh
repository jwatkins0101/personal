#!/bin/zsh
SP=${SP:-$HOME/Code/assistance/cos/projects/icloud-move}
D=$HOME/Code/owlthat-hq
cd "$HOME/Documents/Documents - Jermaine’s MacBook Pro/Sites/owlthat-hq"
cp $SP/dataless.txt $SP/pending.txt
: > $SP/copied2.txt; : > $SP/conflict.txt
n=0
while IFS= read -r f; do perl -e 'alarm 20; exec @ARGV' brctl download "$f" >/dev/null 2>&1 && n=$((n+1)); done < $SP/dataless.txt
echo "$(date +%T) download_requested=$n"
while true; do
  : > $SP/pending.new
  while IFS= read -r f; do
    if ls -lO "$f" | grep -q dataless; then echo "$f" >> $SP/pending.new; continue; fi
    if [ -e "$D/$f" ]; then
      cmp -s "$f" "$D/$f" || echo "$f" >> $SP/conflict.txt
    else
      mkdir -p "$D/$(dirname "$f")"
      if perl -e 'alarm 60; exec @ARGV' cp -p -n "$f" "$D/$f"; then echo "$f" >> $SP/copied2.txt; else echo "$f" >> $SP/pending.new; fi
    fi
  done < $SP/pending.txt
  mv $SP/pending.new $SP/pending.txt
  echo "$(date +%T) pending=$(wc -l < $SP/pending.txt) copied=$(wc -l < $SP/copied2.txt) conflicts=$(wc -l < $SP/conflict.txt)"
  [ -s $SP/pending.txt ] || exit 0
  sleep 60
done
