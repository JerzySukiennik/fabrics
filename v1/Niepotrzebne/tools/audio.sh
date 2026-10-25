#!/usr/bin/env bash
# Build assets/audio from freesound CC0 previews in Niepotrzebne/audio-src (seamless loops + trimmed one-shots).
set -euo pipefail
cd "$(dirname "$0")/../audio-src"
out=../../assets/audio
loop() { # name src start length xfade
  ffmpeg -v error -y -i "$2.mp3" -filter_complex "[0]aformat=channel_layouts=mono,atrim=start=$3:end=$(echo "$3+$4+$5"|bc),asetpts=PTS-STARTPTS,loudnorm=I=-20:TP=-2,aresample=44100,asplit[a][b];[a]atrim=start=$5,asetpts=PTS-STARTPTS[body];[b]atrim=end=$5,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=$5:c1=tri:c2=tri" -c:a libmp3lame -b:a 96k "$out/$1.mp3"
}
shot() { # name src start end
  ffmpeg -v error -y -i "$2.mp3" -af "aformat=channel_layouts=mono,atrim=start=$3:end=$4,asetpts=PTS-STARTPTS,afade=t=out:st=$(echo "$4-$3-0.04"|bc|sed "s/^\./0./"):d=0.04,loudnorm=I=-16:TP=-1.5,aresample=44100" -c:a libmp3lame -b:a 96k "$out/$1.mp3"
}
loop rustle rustle 1 10 1
loop fire fire 2 12 1
loop wind wind 1 9 1
loop flap flap 2 14 1
shot snip1 scissors 0.79 1.14
shot snip2 scissors 1.34 1.72
shot tear1 tear1 0 1.03
shot tear2 tear2 0 1.0
shot ignite match 0 1.42
shot thud1 thud1 0 0.39
shot thud2 thud2 0 0.59
shot drip drip 0 0.99
