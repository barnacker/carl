// Spinner frame sets for the terminal thinking indicator.
// Frame data inlined from cli-spinners (npm, v3.4.0) and
// unicode-animations (npm, v1.0.3), normalized 2026-10. No runtime dep.

// Inclusion rules (operator-locked, 2026-10-27 rework):

//   1. FRAME-WIDTH CONSISTENCY — every frame in a set is the same advance
//      width in a monospace font (a 1-char cell set or a fixed-length
//      multi-char set both qualify). This REPLACES the deprecated
//      "1-wide per frame" parity rule: the canonical-terminal 1-wide
//      indicator idea is retired; what matters is no per-frame jitter.
//      Multi-char fixed-width sets (pong 10-wide, dna/cascade/helix
//      3-8 wide, dots12 2-wide, ...) are all fine. Verified per-set via
//      east_asian_width() over the shipped frame data (W/F=2, else 1).

//   2. FIXED FRAME COUNT per set — no variable-length sets: they would
//      shift the x-coordinate of the text following the indicator. The
//      full collection is re-included (whole braille family, dots*, sand,
//      orbit, dna, snake, pulse, scan, cascade, checkerboard, fillsweep,
//      sparkle, waverows, columns, line2, pong, the earlier
//      emoji/dingbat-excluded set, all unicode-animations sets) EXCEPT
//      the variable-length sets:
//        fish        (cli-spinners)  27 frames, growing "~" trail
//        shark       (cli-spinners)  26 frames, sliding-tick idler
//        material    (cli-spinners)  92 frames, 20-col circular bar
//        bouncingBar (cli-spinners)  16 frames, "[====]" "["    "]" slider
//      and emoji-only variable-width sets that would still jitter:
//        weather       (cli-spinners) mixed 2/3/4-width frames + emoji
//        arrow2, dwarfFortress (cli-spinners) — 100% emoji frames
//      (fullwidth emoji cells double-advance, not terminal-cell safe).
//      All other excluded-set members were RE-INCLUDED this round.

//   3. Dedupe: cli-spinners "dots" is byte-identical to
//      unicode-animations "braille" — cli-spinners "dots" is dropped
//      and unicode-animations "braille" is the keeper + default.

// Default: "braille" (the rotating braille dots — the other classic).

export interface Spinner { id: string; label: string; src: string; frames: string[]; interval: number; }

export const spinners: Spinner[] = [
  { id: "dots2", label: "dots2", src: "cli-spinners", frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"], interval: 80 },
  { id: "dots3", label: "dots3", src: "cli-spinners", frames: ["⠋", "⠙", "⠚", "⠞", "⠖", "⠦", "⠴", "⠲", "⠳", "⠓"], interval: 80 },
  { id: "dots4", label: "dots4", src: "cli-spinners", frames: ["⠄", "⠆", "⠇", "⠋", "⠙", "⠸", "⠰", "⠠", "⠰", "⠸", "⠙", "⠋", "⠇", "⠆"], interval: 80 },
  { id: "dots5", label: "dots5", src: "cli-spinners", frames: ["⠋", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋"], interval: 80 },
  { id: "dots6", label: "dots6", src: "cli-spinners", frames: ["⠁", "⠉", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠤", "⠄", "⠄", "⠤", "⠴", "⠲", "⠒", "⠂", "⠂", "⠒", "⠚", "⠙", "⠉", "⠁"], interval: 80 },
  { id: "dots7", label: "dots7", src: "cli-spinners", frames: ["⠈", "⠉", "⠋", "⠓", "⠒", "⠐", "⠐", "⠒", "⠖", "⠦", "⠤", "⠠", "⠠", "⠤", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋", "⠉", "⠈"], interval: 80 },
  { id: "dots8", label: "dots8", src: "cli-spinners", frames: ["⠁", "⠁", "⠉", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠤", "⠄", "⠄", "⠤", "⠠", "⠠", "⠤", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋", "⠉", "⠈", "⠈"], interval: 80 },
  { id: "dots9", label: "dots9", src: "cli-spinners", frames: ["⢹", "⢺", "⢼", "⣸", "⣇", "⡧", "⡗", "⡏"], interval: 80 },
  { id: "dots10", label: "dots10", src: "cli-spinners", frames: ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠"], interval: 80 },
  { id: "dots11", label: "dots11", src: "cli-spinners", frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"], interval: 100 },
  { id: "dots12", label: "dots12", src: "cli-spinners", frames: ["⢀⠀", "⡀⠀", "⠄⠀", "⢂⠀", "⡂⠀", "⠅⠀", "⢃⠀", "⡃⠀", "⠍⠀", "⢋⠀", "⡋⠀", "⠍⠁", "⢋⠁", "⡋⠁", "⠍⠉", "⠋⠉", "⠋⠉", "⠉⠙", "⠉⠙", "⠉⠩", "⠈⢙", "⠈⡙", "⢈⠩", "⡀⢙", "⠄⡙", "⢂⠩", "⡂⢘", "⠅⡘", "⢃⠨", "⡃⢐", "⠍⡐", "⢋⠠", "⡋⢀", "⠍⡁", "⢋⠁", "⡋⠁", "⠍⠉", "⠋⠉", "⠋⠉", "⠉⠙", "⠉⠙", "⠉⠩", "⠈⢙", "⠈⡙", "⠈⠩", "⠀⢙", "⠀⡙", "⠀⠩", "⠀⢘", "⠀⡘", "⠀⠨", "⠀⢐", "⠀⡐", "⠀⠠", "⠀⢀", "⠀⡀"], interval: 80 },
  { id: "dots13", label: "dots13", src: "cli-spinners", frames: ["⣼", "⣹", "⢻", "⠿", "⡟", "⣏", "⣧", "⣶"], interval: 80 },
  { id: "dots14", label: "dots14", src: "cli-spinners", frames: ["⠉⠉", "⠈⠙", "⠀⠹", "⠀⢸", "⠀⣰", "⢀⣠", "⣀⣀", "⣄⡀", "⣆⠀", "⡇⠀", "⠏⠀", "⠋⠁"], interval: 80 },
  { id: "dots8Bit", label: "dots8Bit", src: "cli-spinners", frames: ["⠀", "⠁", "⠂", "⠃", "⠄", "⠅", "⠆", "⠇", "⡀", "⡁", "⡂", "⡃", "⡄", "⡅", "⡆", "⡇", "⠈", "⠉", "⠊", "⠋", "⠌", "⠍", "⠎", "⠏", "⡈", "⡉", "⡊", "⡋", "⡌", "⡍", "⡎", "⡏", "⠐", "⠑", "⠒", "⠓", "⠔", "⠕", "⠖", "⠗", "⡐", "⡑", "⡒", "⡓", "⡔", "⡕", "⡖", "⡗", "⠘", "⠙", "⠚", "⠛", "⠜", "⠝", "⠞", "⠟", "⡘", "⡙", "⡚", "⡛", "⡜", "⡝", "⡞", "⡟", "⠠", "⠡", "⠢", "⠣", "⠤", "⠥", "⠦", "⠧", "⡠", "⡡", "⡢", "⡣", "⡤", "⡥", "⡦", "⡧", "⠨", "⠩", "⠪", "⠫", "⠬", "⠭", "⠮", "⠯", "⡨", "⡩", "⡪", "⡫", "⡬", "⡭", "⡮", "⡯", "⠰", "⠱", "⠲", "⠳", "⠴", "⠵", "⠶", "⠷", "⡰", "⡱", "⡲", "⡳", "⡴", "⡵", "⡶", "⡷", "⠸", "⠹", "⠺", "⠻", "⠼", "⠽", "⠾", "⠿", "⡸", "⡹", "⡺", "⡻", "⡼", "⡽", "⡾", "⡿", "⢀", "⢁", "⢂", "⢃", "⢄", "⢅", "⢆", "⢇", "⣀", "⣁", "⣂", "⣃", "⣄", "⣅", "⣆", "⣇", "⢈", "⢉", "⢊", "⢋", "⢌", "⢍", "⢎", "⢏", "⣈", "⣉", "⣊", "⣋", "⣌", "⣍", "⣎", "⣏", "⢐", "⢑", "⢒", "⢓", "⢔", "⢕", "⢖", "⢗", "⣐", "⣑", "⣒", "⣓", "⣔", "⣕", "⣖", "⣗", "⢘", "⢙", "⢚", "⢛", "⢜", "⢝", "⢞", "⢟", "⣘", "⣙", "⣚", "⣛", "⣜", "⣝", "⣞", "⣟", "⢠", "⢡", "⢢", "⢣", "⢤", "⢥", "⢦", "⢧", "⣠", "⣡", "⣢", "⣣", "⣤", "⣥", "⣦", "⣧", "⢨", "⢩", "⢪", "⢫", "⢬", "⢭", "⢮", "⢯", "⣨", "⣩", "⣪", "⣫", "⣬", "⣭", "⣮", "⣯", "⢰", "⢱", "⢲", "⢳", "⢴", "⢵", "⢶", "⢷", "⣰", "⣱", "⣲", "⣳", "⣴", "⣵", "⣶", "⣷", "⢸", "⢹", "⢺", "⢻", "⢼", "⢽", "⢾", "⢿", "⣸", "⣹", "⣺", "⣻", "⣼", "⣽", "⣾", "⣿"], interval: 80 },
  { id: "dotsCircle", label: "dotsCircle", src: "cli-spinners", frames: ["⢎ ", "⠎⠁", "⠊⠑", "⠈⠱", " ⡱", "⢀⡰", "⢄⡠", "⢆⡀"], interval: 80 },
  { id: "sand", label: "sand", src: "cli-spinners", frames: ["⠁", "⠂", "⠄", "⡀", "⡈", "⡐", "⡠", "⣀", "⣁", "⣂", "⣄", "⣌", "⣔", "⣤", "⣥", "⣦", "⣮", "⣶", "⣷", "⣿", "⡿", "⠿", "⢟", "⠟", "⡛", "⠛", "⠫", "⢋", "⠋", "⠍", "⡉", "⠉", "⠑", "⠡", "⢁"], interval: 80 },
  { id: "line", label: "line", src: "cli-spinners", frames: ["-", "\\", "|", "/"], interval: 130 },
  { id: "line2", label: "line2", src: "cli-spinners", frames: ["⠂", "-", "–", "—", "–", "-"], interval: 100 },
  { id: "rollingLine", label: "rollingLine", src: "cli-spinners", frames: ["/  ", " - ", " \\ ", "  |", "  |", " \\ ", " - ", "/  "], interval: 80 },
  { id: "pipe", label: "pipe", src: "cli-spinners", frames: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"], interval: 100 },
  { id: "simpleDots", label: "simpleDots", src: "cli-spinners", frames: [".  ", ".. ", "...", "   "], interval: 400 },
  { id: "simpleDotsScrolling", label: "simpleDotsScrolling", src: "cli-spinners", frames: [".  ", ".. ", "...", " ..", "  .", "   "], interval: 200 },
  { id: "star", label: "star", src: "cli-spinners", frames: ["✶", "✸", "✹", "✺", "✹", "✷"], interval: 70 },
  { id: "star2", label: "star2", src: "cli-spinners", frames: ["+", "x", "*"], interval: 80 },
  { id: "flip", label: "flip", src: "cli-spinners", frames: ["_", "_", "_", "-", "`", "`", "'", "´", "-", "_", "_", "_"], interval: 70 },
  { id: "hamburger", label: "hamburger", src: "cli-spinners", frames: ["☱", "☲", "☴"], interval: 100 },
  { id: "growVertical", label: "growVertical", src: "cli-spinners", frames: ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"], interval: 120 },
  { id: "growHorizontal", label: "growHorizontal", src: "cli-spinners", frames: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "▊", "▋", "▌", "▍", "▎"], interval: 120 },
  { id: "balloon", label: "balloon", src: "cli-spinners", frames: [" ", ".", "o", "O", "@", "*", " "], interval: 140 },
  { id: "balloon2", label: "balloon2", src: "cli-spinners", frames: [".", "o", "O", "°", "O", "o", "."], interval: 120 },
  { id: "noise", label: "noise", src: "cli-spinners", frames: ["▓", "▒", "░"], interval: 100 },
  { id: "bounce", label: "bounce", src: "cli-spinners", frames: ["⠁", "⠂", "⠄", "⠂"], interval: 120 },
  { id: "boxBounce", label: "boxBounce", src: "cli-spinners", frames: ["▖", "▘", "▝", "▗"], interval: 120 },
  { id: "boxBounce2", label: "boxBounce2", src: "cli-spinners", frames: ["▌", "▀", "▐", "▄"], interval: 100 },
  { id: "triangle", label: "triangle", src: "cli-spinners", frames: ["◢", "◣", "◤", "◥"], interval: 50 },
  { id: "binary", label: "binary", src: "cli-spinners", frames: ["010010", "001100", "100101", "111010", "111101", "010111", "101011", "111000", "110011", "110101"], interval: 80 },
  { id: "arc", label: "arc", src: "cli-spinners", frames: ["◜", "◠", "◝", "◞", "◡", "◟"], interval: 100 },
  { id: "circle", label: "circle", src: "cli-spinners", frames: ["◡", "⊙", "◠"], interval: 120 },
  { id: "squareCorners", label: "squareCorners", src: "cli-spinners", frames: ["◰", "◳", "◲", "◱"], interval: 180 },
  { id: "circleQuarters", label: "circleQuarters", src: "cli-spinners", frames: ["◴", "◷", "◶", "◵"], interval: 120 },
  { id: "circleHalves", label: "circleHalves", src: "cli-spinners", frames: ["◐", "◓", "◑", "◒"], interval: 50 },
  { id: "squish", label: "squish", src: "cli-spinners", frames: ["╫", "╪"], interval: 100 },
  { id: "toggle", label: "toggle", src: "cli-spinners", frames: ["⊶", "⊷"], interval: 250 },
  { id: "toggle2", label: "toggle2", src: "cli-spinners", frames: ["▫", "▪"], interval: 80 },
  { id: "toggle3", label: "toggle3", src: "cli-spinners", frames: ["□", "■"], interval: 120 },
  { id: "toggle4", label: "toggle4", src: "cli-spinners", frames: ["■", "□", "▪", "▫"], interval: 100 },
  { id: "toggle5", label: "toggle5", src: "cli-spinners", frames: ["▮", "▯"], interval: 100 },
  { id: "toggle6", label: "toggle6", src: "cli-spinners", frames: ["ဝ", "၀"], interval: 300 },
  { id: "toggle7", label: "toggle7", src: "cli-spinners", frames: ["⦾", "⦿"], interval: 80 },
  { id: "toggle8", label: "toggle8", src: "cli-spinners", frames: ["◍", "◌"], interval: 100 },
  { id: "toggle9", label: "toggle9", src: "cli-spinners", frames: ["◉", "◎"], interval: 100 },
  { id: "toggle10", label: "toggle10", src: "cli-spinners", frames: ["㊂", "㊀", "㊁"], interval: 100 },
  { id: "toggle11", label: "toggle11", src: "cli-spinners", frames: ["⧇", "⧆"], interval: 50 },
  { id: "toggle12", label: "toggle12", src: "cli-spinners", frames: ["☗", "☖"], interval: 120 },
  { id: "toggle13", label: "toggle13", src: "cli-spinners", frames: ["=", "*", "-"], interval: 80 },
  { id: "arrow", label: "arrow", src: "cli-spinners", frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"], interval: 100 },
  { id: "arrow3", label: "arrow3", src: "cli-spinners", frames: ["▹▹▹▹▹", "▸▹▹▹▹", "▹▸▹▹▹", "▹▹▸▹▹", "▹▹▹▸▹", "▹▹▹▹▸"], interval: 120 },
  { id: "bouncingBall", label: "bouncingBall", src: "cli-spinners", frames: ["( ●    )", "(  ●   )", "(   ●  )", "(    ● )", "(     ●)", "(    ● )", "(   ●  )", "(  ●   )", "( ●    )", "(●     )"], interval: 80 },
  { id: "smiley", label: "smiley", src: "cli-spinners", frames: ["😄 ", "😝 "], interval: 200 },
  { id: "monkey", label: "monkey", src: "cli-spinners", frames: ["🙈 ", "🙈 ", "🙉 ", "🙊 "], interval: 300 },
  { id: "hearts", label: "hearts", src: "cli-spinners", frames: ["💛 ", "💙 ", "💜 ", "💚 ", "💗 "], interval: 100 },
  { id: "clock", label: "clock", src: "cli-spinners", frames: ["🕛 ", "🕐 ", "🕑 ", "🕒 ", "🕓 ", "🕔 ", "🕕 ", "🕖 ", "🕗 ", "🕘 ", "🕙 ", "🕚 "], interval: 100 },
  { id: "earth", label: "earth", src: "cli-spinners", frames: ["🌍 ", "🌎 ", "🌏 "], interval: 180 },
  { id: "moon", label: "moon", src: "cli-spinners", frames: ["🌑 ", "🌒 ", "🌓 ", "🌔 ", "🌕 ", "🌖 ", "🌗 ", "🌘 "], interval: 80 },
  { id: "runner", label: "runner", src: "cli-spinners", frames: ["🚶 ", "🏃 "], interval: 140 },
  { id: "pong", label: "pong", src: "cli-spinners", frames: ["▐⠂       ▌", "▐⠈       ▌", "▐ ⠂      ▌", "▐ ⠠      ▌", "▐  ⡀     ▌", "▐  ⠠     ▌", "▐   ⠂    ▌", "▐   ⠈    ▌", "▐    ⠂   ▌", "▐    ⠠   ▌", "▐     ⡀  ▌", "▐     ⠠  ▌", "▐      ⠂ ▌", "▐      ⠈ ▌", "▐       ⠂▌", "▐       ⠠▌", "▐       ⡀▌", "▐      ⠠ ▌", "▐      ⠂ ▌", "▐     ⠈  ▌", "▐     ⠂  ▌", "▐    ⠠   ▌", "▐    ⡀   ▌", "▐   ⠠    ▌", "▐   ⠂    ▌", "▐  ⠈     ▌", "▐  ⠂     ▌", "▐ ⠠      ▌", "▐ ⡀      ▌", "▐⠠       ▌"], interval: 80 },
  { id: "dqpb", label: "dqpb", src: "cli-spinners", frames: ["d", "q", "p", "b"], interval: 100 },
  { id: "christmas", label: "christmas", src: "cli-spinners", frames: ["🌲", "🎄"], interval: 400 },
  { id: "grenade", label: "grenade", src: "cli-spinners", frames: ["،  ", "′  ", " ´ ", " ‾ ", "  ⸌", "  ⸊", "  |", "  ⁎", "  ⁕", " ෴ ", "  ⁓", "   ", "   ", "   "], interval: 80 },
  { id: "point", label: "point", src: "cli-spinners", frames: ["∙∙∙", "●∙∙", "∙●∙", "∙∙●", "∙∙∙"], interval: 125 },
  { id: "layer", label: "layer", src: "cli-spinners", frames: ["-", "=", "≡"], interval: 150 },
  { id: "betaWave", label: "betaWave", src: "cli-spinners", frames: ["ρββββββ", "βρβββββ", "ββρββββ", "βββρβββ", "ββββρββ", "βββββρβ", "ββββββρ"], interval: 80 },
  { id: "fingerDance", label: "fingerDance", src: "cli-spinners", frames: ["🤘 ", "🤟 ", "🖖 ", "✋ ", "🤚 ", "👆 "], interval: 160 },
  { id: "fistBump", label: "fistBump", src: "cli-spinners", frames: ["🤜　　　　🤛 ", "🤜　　　　🤛 ", "🤜　　　　🤛 ", "　🤜　　🤛　 ", "　　🤜🤛　　 ", "　🤜✨🤛　　 ", "🤜　✨　🤛　 "], interval: 80 },
  { id: "soccerHeader", label: "soccerHeader", src: "cli-spinners", frames: [" 🧑⚽️       🧑 ", "🧑  ⚽️      🧑 ", "🧑   ⚽️     🧑 ", "🧑    ⚽️    🧑 ", "🧑     ⚽️   🧑 ", "🧑      ⚽️  🧑 ", "🧑       ⚽️🧑  ", "🧑      ⚽️  🧑 ", "🧑     ⚽️   🧑 ", "🧑    ⚽️    🧑 ", "🧑   ⚽️     🧑 ", "🧑  ⚽️      🧑 "], interval: 80 },
  { id: "mindblown", label: "mindblown", src: "cli-spinners", frames: ["😐 ", "😐 ", "😮 ", "😮 ", "😦 ", "😦 ", "😧 ", "😧 ", "🤯 ", "💥 ", "✨ ", "　 ", "　 ", "　 "], interval: 160 },
  { id: "speaker", label: "speaker", src: "cli-spinners", frames: ["🔈 ", "🔉 ", "🔊 ", "🔉 "], interval: 160 },
  { id: "orangePulse", label: "orangePulse", src: "cli-spinners", frames: ["🔸 ", "🔶 ", "🟠 ", "🟠 ", "🔶 "], interval: 100 },
  { id: "bluePulse", label: "bluePulse", src: "cli-spinners", frames: ["🔹 ", "🔷 ", "🔵 ", "🔵 ", "🔷 "], interval: 100 },
  { id: "orangeBluePulse", label: "orangeBluePulse", src: "cli-spinners", frames: ["🔸 ", "🔶 ", "🟠 ", "🟠 ", "🔶 ", "🔹 ", "🔷 ", "🔵 ", "🔵 ", "🔷 "], interval: 100 },
  { id: "timeTravel", label: "timeTravel", src: "cli-spinners", frames: ["🕛 ", "🕚 ", "🕙 ", "🕘 ", "🕗 ", "🕖 ", "🕕 ", "🕔 ", "🕓 ", "🕒 ", "🕑 ", "🕐 "], interval: 100 },
  { id: "aesthetic", label: "aesthetic", src: "cli-spinners", frames: ["▰▱▱▱▱▱▱", "▰▰▱▱▱▱▱", "▰▰▰▱▱▱▱", "▰▰▰▰▱▱▱", "▰▰▰▰▰▱▱", "▰▰▰▰▰▰▱", "▰▰▰▰▰▰▰", "▰▱▱▱▱▱▱"], interval: 80 },
  { id: "braille", label: "braille", src: "unicode-animations", frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], interval: 80 },
  { id: "braillewave", label: "braillewave", src: "unicode-animations", frames: ["⠁⠂⠄⡀", "⠂⠄⡀⢀", "⠄⡀⢀⠠", "⡀⢀⠠⠐", "⢀⠠⠐⠈", "⠠⠐⠈⠁", "⠐⠈⠁⠂", "⠈⠁⠂⠄"], interval: 100 },
  { id: "dna", label: "dna", src: "unicode-animations", frames: ["⠋⠉⠙⠚", "⠉⠙⠚⠒", "⠙⠚⠒⠂", "⠚⠒⠂⠂", "⠒⠂⠂⠒", "⠂⠂⠒⠲", "⠂⠒⠲⠴", "⠒⠲⠴⠤", "⠲⠴⠤⠄", "⠴⠤⠄⠋", "⠤⠄⠋⠉", "⠄⠋⠉⠙"], interval: 80 },
  { id: "scan", label: "scan", src: "unicode-animations", frames: ["⠀⠀⠀⠀", "⡇⠀⠀⠀", "⣿⠀⠀⠀", "⢸⡇⠀⠀", "⠀⣿⠀⠀", "⠀⢸⡇⠀", "⠀⠀⣿⠀", "⠀⠀⢸⡇", "⠀⠀⠀⣿", "⠀⠀⠀⢸"], interval: 70 },
  { id: "rain", label: "rain", src: "unicode-animations", frames: ["⢁⠂⠔⠈", "⠂⠌⡠⠐", "⠄⡐⢀⠡", "⡈⠠⠀⢂", "⠐⢀⠁⠄", "⠠⠁⠊⡀", "⢁⠂⠔⠈", "⠂⠌⡠⠐", "⠄⡐⢀⠡", "⡈⠠⠀⢂", "⠐⢀⠁⠄", "⠠⠁⠊⡀"], interval: 100 },
  { id: "scanline", label: "scanline", src: "unicode-animations", frames: ["⠉⠉⠉", "⠓⠓⠓", "⠦⠦⠦", "⣄⣄⣄", "⠦⠦⠦", "⠓⠓⠓"], interval: 120 },
  { id: "pulse", label: "pulse", src: "unicode-animations", frames: ["⠀⠶⠀", "⠰⣿⠆", "⢾⣉⡷", "⣏⠀⣹", "⡁⠀⢈"], interval: 180 },
  { id: "snake", label: "snake", src: "unicode-animations", frames: ["⣁⡀", "⣉⠀", "⡉⠁", "⠉⠉", "⠈⠙", "⠀⠛", "⠐⠚", "⠒⠒", "⠖⠂", "⠶⠀", "⠦⠄", "⠤⠤", "⠠⢤", "⠀⣤", "⢀⣠", "⣀⣀"], interval: 80 },
  { id: "sparkle", label: "sparkle", src: "unicode-animations", frames: ["⡡⠊⢔⠡", "⠊⡰⡡⡘", "⢔⢅⠈⢢", "⡁⢂⠆⡍", "⢔⠨⢑⢐", "⠨⡑⡠⠊"], interval: 150 },
  { id: "cascade", label: "cascade", src: "unicode-animations", frames: ["⠀⠀⠀⠀", "⠀⠀⠀⠀", "⠁⠀⠀⠀", "⠋⠀⠀⠀", "⠞⠁⠀⠀", "⡴⠋⠀⠀", "⣠⠞⠁⠀", "⢀⡴⠋⠀", "⠀⣠⠞⠁", "⠀⢀⡴⠋", "⠀⠀⣠⠞", "⠀⠀⢀⡴", "⠀⠀⠀⣠", "⠀⠀⠀⢀"], interval: 60 },
  { id: "columns", label: "columns", src: "unicode-animations", frames: ["⡀⠀⠀", "⡄⠀⠀", "⡆⠀⠀", "⡇⠀⠀", "⣇⠀⠀", "⣧⠀⠀", "⣷⠀⠀", "⣿⠀⠀", "⣿⡀⠀", "⣿⡄⠀", "⣿⡆⠀", "⣿⡇⠀", "⣿⣇⠀", "⣿⣧⠀", "⣿⣷⠀", "⣿⣿⠀", "⣿⣿⡀", "⣿⣿⡄", "⣿⣿⡆", "⣿⣿⡇", "⣿⣿⣇", "⣿⣿⣧", "⣿⣿⣷", "⣿⣿⣿", "⣿⣿⣿", "⠀⠀⠀"], interval: 60 },
  { id: "orbit", label: "orbit", src: "unicode-animations", frames: ["⠃", "⠉", "⠘", "⠰", "⢠", "⣀", "⡄", "⠆"], interval: 100 },
  { id: "breathe", label: "breathe", src: "unicode-animations", frames: ["⠀", "⠂", "⠌", "⡑", "⢕", "⢝", "⣫", "⣟", "⣿", "⣟", "⣫", "⢝", "⢕", "⡑", "⠌", "⠂", "⠀"], interval: 100 },
  { id: "waverows", label: "waverows", src: "unicode-animations", frames: ["⠖⠉⠉⠑", "⡠⠖⠉⠉", "⣠⡠⠖⠉", "⣄⣠⡠⠖", "⠢⣄⣠⡠", "⠙⠢⣄⣠", "⠉⠙⠢⣄", "⠊⠉⠙⠢", "⠜⠊⠉⠙", "⡤⠜⠊⠉", "⣀⡤⠜⠊", "⢤⣀⡤⠜", "⠣⢤⣀⡤", "⠑⠣⢤⣀", "⠉⠑⠣⢤", "⠋⠉⠑⠣"], interval: 90 },
  { id: "checkerboard", label: "checkerboard", src: "unicode-animations", frames: ["⢕⢕⢕", "⡪⡪⡪", "⢊⠔⡡", "⡡⢊⠔"], interval: 250 },
  { id: "helix", label: "helix", src: "unicode-animations", frames: ["⢌⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉"], interval: 80 },
  { id: "fillsweep", label: "fillsweep", src: "unicode-animations", frames: ["⣀⣀", "⣤⣤", "⣶⣶", "⣿⣿", "⣿⣿", "⣿⣿", "⣶⣶", "⣤⣤", "⣀⣀", "⠀⠀", "⠀⠀"], interval: 100 },
  { id: "diagswipe", label: "diagswipe", src: "unicode-animations", frames: ["⠁⠀", "⠋⠀", "⠟⠁", "⡿⠋", "⣿⠟", "⣿⡿", "⣿⣿", "⣿⣿", "⣾⣿", "⣴⣿", "⣠⣾", "⢀⣴", "⠀⣠", "⠀⢀", "⠀⠀", "⠀⠀"], interval: 60 },
]

export function spinnerById(id: string): Spinner {
  return spinners.find((s) => s.id === id) ?? spinners[0];
}

export const DEFAULT_SPINNER_ID = "braille";
