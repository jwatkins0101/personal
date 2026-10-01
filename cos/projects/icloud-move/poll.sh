#!/bin/zsh
SP=${SP:-$HOME/Code/assistance/cos/projects/icloud-move}
cd "$HOME/Documents/Documents - Jermaine’s MacBook Pro/Sites/owlthat-hq"
while true; do
  c=0
  while IFS= read -r f; do ls -lO "$f" | grep -q dataless && c=$((c+1)); done < $SP/targets.txt
  echo "$(date +%H:%M:%S) still_dataless=$c"
  [ $c -eq 0 ] && exit 0
  sleep 60
done
