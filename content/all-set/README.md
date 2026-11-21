# "All set" video

The page a filter shows after a parent approves YouTube's player. "Ask to
allow" (src/lib/check.svelte.ts) opens this video's embed address on
www.youtube-nocookie.com; once Family Link allows it, YouTube shows the
video's thumbnail, which is the instruction: go back to YouLearn.

The video is one still frame for 10s, so the thumbnail is always that frame.
YouTube draws the title on top, its play button in the middle and a bar at
the bottom, so the text sits in the bands between.

Rebuild (from this folder, after `cp ../../public/icons/icon-512.png logo.png`):

    PLAYWRIGHT=<path to playwright> node shot.mjs
    ffmpeg -loop 1 -i frame.png -f lavfi -i anullsrc=r=48000:cl=stereo -t 10 -r 30 \
      -c:v libx264 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 64k -shortest youlearn-all-set.mp4

Uploaded unlisted, embedding allowed; its id is ALL_SET_VIDEO in check.svelte.ts.
The embed page needs a referrer (without one YouTube shows error 153), so the
tab must not open with noreferrer. Upright, YouTube crops the thumbnail to the
middle ~27% of the width: keep everything in the 500px center column.
