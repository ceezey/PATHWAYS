#!/usr/bin/env bash
# Remakes the public tracker demo clips from the committed photos; the seed never runs this.
set -euo pipefail
cd "$(dirname "$0")"
photos=../demo-photos
font="'C\:/Windows/Fonts/arial.ttf'"

# clip <out> <title> <place> <photo1> <photo2> <photo3>: title card, three slow zooms, crossfades, no audio.
clip() {
  local out=$1 title=$2 place=$3
  local zoom="scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=75:s=1280x720:fps=30,settb=1/30,format=yuv420p"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=0x1f3a5f:s=1280x720:d=1.5:r=30" \
    -i "$photos/$4.jpg" -i "$photos/$5.jpg" -i "$photos/$6.jpg" \
    -filter_complex "\
[0:v]drawtext=fontfile=$font:text='$title':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h/2-60,\
drawtext=fontfile=$font:text='$place':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=h/2+20,settb=1/30,format=yuv420p[t];\
[1:v]$zoom[a];[2:v]$zoom[b];[3:v]$zoom[c];\
[t][a]xfade=transition=fade:duration=0.5:offset=1[x1];\
[x1][b]xfade=transition=fade:duration=0.5:offset=3[x2];\
[x2][c]xfade=transition=fade:duration=0.5:offset=5,scale=-2:720[v]" \
    -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 30 -movflags +faststart "$out.mp4"
}

clip ehk-distribution-day 'Hygiene kit distribution' 'Sulangan, Salug and Bungtod, Guiuan' \
  ehk-distribution-sulangan ehk-distribution-salug ehk-distribution-bungtod
clip ehk-kit-packing 'Kit packing and loading' 'Poblacion, Guiuan' \
  ehk-kit-packing ehk-kit-contents ehk-kit-loading
clip als-learning-center 'Community learning center sessions' 'Del Rosario, Lavezares' \
  als-learning-session als-module-work als-review-class
clip crl-response-team-drill 'Disaster response team training' 'Dalakit, Catarman' \
  crl-response-team-training crl-hazard-signage crl-household-assessment
