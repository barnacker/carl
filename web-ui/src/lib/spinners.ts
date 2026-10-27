// Spinner frame sets for the terminal thinking indicator.
// Frame data gathered from cli-spinners and unicode-animations (npm),
// accessed 2026-10 in this round, normalized to the shape below.
//
// Width gate (hard constraint): every frame must be single-width in a
// monospace font. Accepted char classes: ASCII printable, Latin-1,
// general punctuation, arrows, block/geometric. BRAILLE (U+2800-0x28FF)
// is EXCLUDED: it measures 1.217x the reference "o" advance in the host
// standard monospace font (fullwidth) — verified via headless-chromium
// canvas measureText + a render-time bounded-cell screenshot probe.
// Other geometric/block/arrow glyphs all measure 1.000x (single-width).
//
// Dedupe: no surviving sets share an identical frame sequence after the
// width gate (cli-spinners "dots" and unicode-animations "braille" were
// the one identical pair; both fall to the braille-width exclusion).
//
// Excluded 73 sets for width/emoji/dingbat codepoints:
//   arrow2 (cli-spinners) — U+2B06 rejected
//   betaWave (cli-spinners) — U+03C1 rejected
//   bluePulse (cli-spinners) — U+1F539 rejected
//   bounce (cli-spinners) — U+2801 rejected
//   christmas (cli-spinners) — U+1F332 rejected
//   circle (cli-spinners) — U+2299 rejected
//   clock (cli-spinners) — U+1F55B rejected
//   dots (cli-spinners) — U+280B rejected
//   dots10 (cli-spinners) — U+2884 rejected
//   dots11 (cli-spinners) — U+2801 rejected
//   dots12 (cli-spinners) — U+2880 rejected
//   dots13 (cli-spinners) — U+28FC rejected
//   dots14 (cli-spinners) — U+2809 rejected
//   dots2 (cli-spinners) — U+28FE rejected
//   dots3 (cli-spinners) — U+280B rejected
//   dots4 (cli-spinners) — U+2804 rejected
//   dots5 (cli-spinners) — U+280B rejected
//   dots6 (cli-spinners) — U+2801 rejected
//   dots7 (cli-spinners) — U+2808 rejected
//   dots8 (cli-spinners) — U+2801 rejected
//   dots8Bit (cli-spinners) — U+2800 rejected
//   dots9 (cli-spinners) — U+28B9 rejected
//   dotsCircle (cli-spinners) — U+288E rejected
//   dwarfFortress (cli-spinners) — U+263A rejected
//   earth (cli-spinners) — U+1F30D rejected
//   fingerDance (cli-spinners) — U+1F918 rejected
//   fistBump (cli-spinners) — U+1F91C rejected
//   grenade (cli-spinners) — U+060C rejected
//   hamburger (cli-spinners) — U+2631 rejected
//   hearts (cli-spinners) — U+1F49B rejected
//   layer (cli-spinners) — U+2261 rejected
//   line2 (cli-spinners) — U+2802 rejected
//   mindblown (cli-spinners) — U+1F610 rejected
//   monkey (cli-spinners) — U+1F648 rejected
//   moon (cli-spinners) — U+1F311 rejected
//   orangeBluePulse (cli-spinners) — U+1F538 rejected
//   orangePulse (cli-spinners) — U+1F538 rejected
//   pipe (cli-spinners) — U+2524 rejected
//   point (cli-spinners) — U+2219 rejected
//   pong (cli-spinners) — U+2802 rejected
//   runner (cli-spinners) — U+1F6B6 rejected
//   sand (cli-spinners) — U+2801 rejected
//   smiley (cli-spinners) — U+1F604 rejected
//   soccerHeader (cli-spinners) — U+1F9D1 rejected
//   speaker (cli-spinners) — U+1F508 rejected
//   squish (cli-spinners) — U+256B rejected
//   star (cli-spinners) — U+2736 rejected
//   timeTravel (cli-spinners) — U+1F55B rejected
//   toggle (cli-spinners) — U+22B6 rejected
//   toggle10 (cli-spinners) — U+3282 rejected
//   toggle11 (cli-spinners) — U+29C7 rejected
//   toggle12 (cli-spinners) — U+2617 rejected
//   toggle6 (cli-spinners) — U+101D rejected
//   toggle7 (cli-spinners) — U+29BE rejected
//   weather (cli-spinners) — U+2600 rejected
//   braille (unicode-animations) — U+280B rejected
//   braillewave (unicode-animations) — U+2801 rejected
//   breathe (unicode-animations) — U+2800 rejected
//   cascade (unicode-animations) — U+2800 rejected
//   checkerboard (unicode-animations) — U+2895 rejected
//   columns (unicode-animations) — U+2840 rejected
//   diagswipe (unicode-animations) — U+2801 rejected
//   dna (unicode-animations) — U+280B rejected
//   fillsweep (unicode-animations) — U+28C0 rejected
//   helix (unicode-animations) — U+288C rejected
//   orbit (unicode-animations) — U+2803 rejected
//   pulse (unicode-animations) — U+2800 rejected
//   rain (unicode-animations) — U+2881 rejected
//   scan (unicode-animations) — U+2800 rejected
//   scanline (unicode-animations) — U+2809 rejected
//   snake (unicode-animations) — U+28C1 rejected
//   sparkle (unicode-animations) — U+2861 rejected
//   waverows (unicode-animations) — U+2816 rejected
//
// Default pick: "line" (cli-spinners: the classic /|\- cycle) — the
// oldest, simplest, guaranteed fixed 1-col, non-emoji set; the braille
// dot cycle (the other classic) is unavailable on this host (fullwidth).

export interface Spinner { id: string; label: string; frames: string[]; interval: number; }

export const spinners: Spinner[] = [
  { id: "aesthetic", label: "cli-spinners: aesthetic", frames: ["▰▱▱▱▱▱▱", "▰▰▱▱▱▱▱", "▰▰▰▱▱▱▱", "▰▰▰▰▱▱▱", "▰▰▰▰▰▱▱", "▰▰▰▰▰▰▱", "▰▰▰▰▰▰▰", "▰▱▱▱▱▱▱"], interval: 80 },
  { id: "arc", label: "cli-spinners: arc", frames: ["◜", "◠", "◝", "◞", "◡", "◟"], interval: 100 },
  { id: "arrow", label: "cli-spinners: arrow", frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"], interval: 100 },
  { id: "arrow3", label: "cli-spinners: arrow3", frames: ["▹▹▹▹▹", "▸▹▹▹▹", "▹▸▹▹▹", "▹▹▸▹▹", "▹▹▹▸▹", "▹▹▹▹▸"], interval: 120 },
  { id: "balloon", label: "cli-spinners: balloon", frames: [" ", ".", "o", "O", "@", "*", " "], interval: 140 },
  { id: "balloon2", label: "cli-spinners: balloon2", frames: [".", "o", "O", "°", "O", "o", "."], interval: 120 },
  { id: "binary", label: "cli-spinners: binary", frames: ["010010", "001100", "100101", "111010", "111101", "010111", "101011", "111000", "110011", "110101"], interval: 80 },
  { id: "bouncingBall", label: "cli-spinners: bouncingBall", frames: ["( ●    )", "(  ●   )", "(   ●  )", "(    ● )", "(     ●)", "(    ● )", "(   ●  )", "(  ●   )", "( ●    )", "(●     )"], interval: 80 },
  { id: "bouncingBar", label: "cli-spinners: bouncingBar", frames: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]", "[    ]", "[   =]", "[  ==]", "[ ===]", "[====]", "[=== ]", "[==  ]", "[=   ]"], interval: 80 },
  { id: "boxBounce", label: "cli-spinners: boxBounce", frames: ["▖", "▘", "▝", "▗"], interval: 120 },
  { id: "boxBounce2", label: "cli-spinners: boxBounce2", frames: ["▌", "▀", "▐", "▄"], interval: 100 },
  { id: "circleHalves", label: "cli-spinners: circleHalves", frames: ["◐", "◓", "◑", "◒"], interval: 50 },
  { id: "circleQuarters", label: "cli-spinners: circleQuarters", frames: ["◴", "◷", "◶", "◵"], interval: 120 },
  { id: "dqpb", label: "cli-spinners: dqpb", frames: ["d", "q", "p", "b"], interval: 100 },
  { id: "fish", label: "cli-spinners: fish", frames: ["~~~~~~~~~~~~~~~~~~~~", "> ~~~~~~~~~~~~~~~~~~", "º> ~~~~~~~~~~~~~~~~~", "(º> ~~~~~~~~~~~~~~~~", "((º> ~~~~~~~~~~~~~~~", "<((º> ~~~~~~~~~~~~~~", "><((º> ~~~~~~~~~~~~~", " ><((º> ~~~~~~~~~~~~", "~ ><((º> ~~~~~~~~~~~", "~~ <>((º> ~~~~~~~~~~", "~~~ ><((º> ~~~~~~~~~", "~~~~ <>((º> ~~~~~~~~", "~~~~~ ><((º> ~~~~~~~", "~~~~~~ <>((º> ~~~~~~", "~~~~~~~ ><((º> ~~~~~", "~~~~~~~~ <>((º> ~~~~", "~~~~~~~~~ ><((º> ~~~", "~~~~~~~~~~ <>((º> ~~", "~~~~~~~~~~~ ><((º> ~", "~~~~~~~~~~~~ <>((º> ", "~~~~~~~~~~~~~ ><((º>", "~~~~~~~~~~~~~~ <>((º", "~~~~~~~~~~~~~~~ ><((", "~~~~~~~~~~~~~~~~ <>(", "~~~~~~~~~~~~~~~~~ ><", "~~~~~~~~~~~~~~~~~~ <", "~~~~~~~~~~~~~~~~~~~~"], interval: 80 },
  { id: "flip", label: "cli-spinners: flip", frames: ["_", "_", "_", "-", "`", "`", "'", "´", "-", "_", "_", "_"], interval: 70 },
  { id: "growHorizontal", label: "cli-spinners: growHorizontal", frames: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "▊", "▋", "▌", "▍", "▎"], interval: 120 },
  { id: "growVertical", label: "cli-spinners: growVertical", frames: ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"], interval: 120 },
  { id: "line", label: "cli-spinners: line", frames: ["-", "\\", "|", "/"], interval: 130 },
  { id: "material", label: "cli-spinners: material", frames: ["█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "███████▁▁▁▁▁▁▁▁▁▁▁▁▁", "████████▁▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "██████████▁▁▁▁▁▁▁▁▁▁", "███████████▁▁▁▁▁▁▁▁▁", "█████████████▁▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁▁██████████████▁▁▁▁", "▁▁▁██████████████▁▁▁", "▁▁▁▁█████████████▁▁▁", "▁▁▁▁██████████████▁▁", "▁▁▁▁██████████████▁▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁▁██████████████", "▁▁▁▁▁▁██████████████", "▁▁▁▁▁▁▁█████████████", "▁▁▁▁▁▁▁█████████████", "▁▁▁▁▁▁▁▁████████████", "▁▁▁▁▁▁▁▁████████████", "▁▁▁▁▁▁▁▁▁███████████", "▁▁▁▁▁▁▁▁▁███████████", "▁▁▁▁▁▁▁▁▁▁██████████", "▁▁▁▁▁▁▁▁▁▁██████████", "▁▁▁▁▁▁▁▁▁▁▁▁████████", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁██████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "███▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "████▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁█", "████████▁▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "███████████▁▁▁▁▁▁▁▁▁", "████████████▁▁▁▁▁▁▁▁", "████████████▁▁▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁▁▁█████████████▁▁▁▁", "▁▁▁▁▁████████████▁▁▁", "▁▁▁▁▁████████████▁▁▁", "▁▁▁▁▁▁███████████▁▁▁", "▁▁▁▁▁▁▁▁█████████▁▁▁", "▁▁▁▁▁▁▁▁█████████▁▁▁", "▁▁▁▁▁▁▁▁▁█████████▁▁", "▁▁▁▁▁▁▁▁▁█████████▁▁", "▁▁▁▁▁▁▁▁▁▁█████████▁", "▁▁▁▁▁▁▁▁▁▁▁████████▁", "▁▁▁▁▁▁▁▁▁▁▁████████▁", "▁▁▁▁▁▁▁▁▁▁▁▁███████▁", "▁▁▁▁▁▁▁▁▁▁▁▁███████▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"], interval: 17 },
  { id: "noise", label: "cli-spinners: noise", frames: ["▓", "▒", "░"], interval: 100 },
  { id: "rollingLine", label: "cli-spinners: rollingLine", frames: ["/  ", " - ", " \\ ", "  |", "  |", " \\ ", " - ", "/  "], interval: 80 },
  { id: "shark", label: "cli-spinners: shark", frames: ["▐|\\____________▌", "▐_|\\___________▌", "▐__|\\__________▌", "▐___|\\_________▌", "▐____|\\________▌", "▐_____|\\_______▌", "▐______|\\______▌", "▐_______|\\_____▌", "▐________|\\____▌", "▐_________|\\___▌", "▐__________|\\__▌", "▐___________|\\_▌", "▐____________|\\▌", "▐____________/|▌", "▐___________/|_▌", "▐__________/|__▌", "▐_________/|___▌", "▐________/|____▌", "▐_______/|_____▌", "▐______/|______▌", "▐_____/|_______▌", "▐____/|________▌", "▐___/|_________▌", "▐__/|__________▌", "▐_/|___________▌", "▐/|____________▌"], interval: 120 },
  { id: "simpleDots", label: "cli-spinners: simpleDots", frames: [".  ", ".. ", "...", "   "], interval: 400 },
  { id: "simpleDotsScrolling", label: "cli-spinners: simpleDotsScrolling", frames: [".  ", ".. ", "...", " ..", "  .", "   "], interval: 200 },
  { id: "squareCorners", label: "cli-spinners: squareCorners", frames: ["◰", "◳", "◲", "◱"], interval: 180 },
  { id: "star2", label: "cli-spinners: star2", frames: ["+", "x", "*"], interval: 80 },
  { id: "toggle13", label: "cli-spinners: toggle13", frames: ["=", "*", "-"], interval: 80 },
  { id: "toggle2", label: "cli-spinners: toggle2", frames: ["▫", "▪"], interval: 80 },
  { id: "toggle3", label: "cli-spinners: toggle3", frames: ["□", "■"], interval: 120 },
  { id: "toggle4", label: "cli-spinners: toggle4", frames: ["■", "□", "▪", "▫"], interval: 100 },
  { id: "toggle5", label: "cli-spinners: toggle5", frames: ["▮", "▯"], interval: 100 },
  { id: "toggle8", label: "cli-spinners: toggle8", frames: ["◍", "◌"], interval: 100 },
  { id: "toggle9", label: "cli-spinners: toggle9", frames: ["◉", "◎"], interval: 100 },
  { id: "triangle", label: "cli-spinners: triangle", frames: ["◢", "◣", "◤", "◥"], interval: 50 },
];

export function spinnerById(id: string): Spinner {
  return spinners.find((s) => s.id === id) ?? spinners[0];
}

export const DEFAULT_SPINNER_ID = "line";
