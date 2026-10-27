// Spinner frame sets for the terminal thinking indicator.
// Frame data gathered from cli-spinners and unicode-animations (npm),
// accessible 2026-10 in this round, normalized to the shape below.
//
// Width gate (hard constraint): every frame must be single-width in a
// monospace font. Accepted char classes: ASCII printable, Latin-1.
// General punctuation (0x2000-0x206f), block/geometric, braille.
// Render-time verification on this host (headless chromium cell probe)
// confirmed braille, block, quarter-circle and line glyphs advance
// identically to the reference "o".
//
// Dedupe: unicode-animations "braille" is the identical frame sequence
// to cli-spinners "dots" — dropped, id "dots" kept.
// Excluded 36 sets containing emoji, dingbat, or other
// non-monospace-guaranteed codepoints:
//   arrow (cli-spinners) — U+2190 rejected
//   arrow2 (cli-spinners) — U+2B06 rejected
//   betaWave (cli-spinners) — U+03C1 rejected
//   bluePulse (cli-spinners) — U+1F539 rejected
//   christmas (cli-spinners) — U+1F332 rejected
//   circle (cli-spinners) — U+2299 rejected
//   clock (cli-spinners) — U+1F55B rejected
//   dwarfFortress (cli-spinners) — U+263A rejected
//   earth (cli-spinners) — U+1F30D rejected
//   fingerDance (cli-spinners) — U+1F918 rejected
//   fistBump (cli-spinners) — U+1F91C rejected
//   grenade (cli-spinners) — U+060C rejected
//   hamburger (cli-spinners) — U+2631 rejected
//   hearts (cli-spinners) — U+1F49B rejected
//   layer (cli-spinners) — U+2261 rejected
//   mindblown (cli-spinners) — U+1F610 rejected
//   monkey (cli-spinners) — U+1F648 rejected
//   moon (cli-spinners) — U+1F311 rejected
//   orangeBluePulse (cli-spinners) — U+1F538 rejected
//   orangePulse (cli-spinners) — U+1F538 rejected
//   pipe (cli-spinners) — U+2524 rejected
//   point (cli-spinners) — U+2219 rejected
//   runner (cli-spinners) — U+1F6B6 rejected
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
//
// Default: "dots" (classic braille dot cycle, fixed 1-col frames).

export interface Spinner { id: string; label: string; frames: string[]; interval: number; }

export const spinners: Spinner[] = [
  { id: "aesthetic", label: "cli-spinners: aesthetic", frames: ["▰▱▱▱▱▱▱", "▰▰▱▱▱▱▱", "▰▰▰▱▱▱▱", "▰▰▰▰▱▱▱", "▰▰▰▰▰▱▱", "▰▰▰▰▰▰▱", "▰▰▰▰▰▰▰", "▰▱▱▱▱▱▱"], interval: 80 },
  { id: "arc", label: "cli-spinners: arc", frames: ["◜", "◠", "◝", "◞", "◡", "◟"], interval: 100 },
  { id: "arrow3", label: "cli-spinners: arrow3", frames: ["▹▹▹▹▹", "▸▹▹▹▹", "▹▸▹▹▹", "▹▹▸▹▹", "▹▹▹▸▹", "▹▹▹▹▸"], interval: 120 },
  { id: "balloon", label: "cli-spinners: balloon", frames: [" ", ".", "o", "O", "@", "*", " "], interval: 140 },
  { id: "balloon2", label: "cli-spinners: balloon2", frames: [".", "o", "O", "°", "O", "o", "."], interval: 120 },
  { id: "binary", label: "cli-spinners: binary", frames: ["010010", "001100", "100101", "111010", "111101", "010111", "101011", "111000", "110011", "110101"], interval: 80 },
  { id: "bounce", label: "cli-spinners: bounce", frames: ["⠁", "⠂", "⠄", "⠂"], interval: 120 },
  { id: "bouncingBall", label: "cli-spinners: bouncingBall", frames: ["( ●    )", "(  ●   )", "(   ●  )", "(    ● )", "(     ●)", "(    ● )", "(   ●  )", "(  ●   )", "( ●    )", "(●     )"], interval: 80 },
  { id: "bouncingBar", label: "cli-spinners: bouncingBar", frames: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]", "[    ]", "[   =]", "[  ==]", "[ ===]", "[====]", "[=== ]", "[==  ]", "[=   ]"], interval: 80 },
  { id: "boxBounce", label: "cli-spinners: boxBounce", frames: ["▖", "▘", "▝", "▗"], interval: 120 },
  { id: "boxBounce2", label: "cli-spinners: boxBounce2", frames: ["▌", "▀", "▐", "▄"], interval: 100 },
  { id: "circleHalves", label: "cli-spinners: circleHalves", frames: ["◐", "◓", "◑", "◒"], interval: 50 },
  { id: "circleQuarters", label: "cli-spinners: circleQuarters", frames: ["◴", "◷", "◶", "◵"], interval: 120 },
  { id: "dots", label: "cli-spinners: dots", frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], interval: 80 },
  { id: "dots10", label: "cli-spinners: dots10", frames: ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠"], interval: 80 },
  { id: "dots11", label: "cli-spinners: dots11", frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"], interval: 100 },
  { id: "dots12", label: "cli-spinners: dots12", frames: ["⢀⠀", "⡀⠀", "⠄⠀", "⢂⠀", "⡂⠀", "⠅⠀", "⢃⠀", "⡃⠀", "⠍⠀", "⢋⠀", "⡋⠀", "⠍⠁", "⢋⠁", "⡋⠁", "⠍⠉", "⠋⠉", "⠋⠉", "⠉⠙", "⠉⠙", "⠉⠩", "⠈⢙", "⠈⡙", "⢈⠩", "⡀⢙", "⠄⡙", "⢂⠩", "⡂⢘", "⠅⡘", "⢃⠨", "⡃⢐", "⠍⡐", "⢋⠠", "⡋⢀", "⠍⡁", "⢋⠁", "⡋⠁", "⠍⠉", "⠋⠉", "⠋⠉", "⠉⠙", "⠉⠙", "⠉⠩", "⠈⢙", "⠈⡙", "⠈⠩", "⠀⢙", "⠀⡙", "⠀⠩", "⠀⢘", "⠀⡘", "⠀⠨", "⠀⢐", "⠀⡐", "⠀⠠", "⠀⢀", "⠀⡀"], interval: 80 },
  { id: "dots13", label: "cli-spinners: dots13", frames: ["⣼", "⣹", "⢻", "⠿", "⡟", "⣏", "⣧", "⣶"], interval: 80 },
  { id: "dots14", label: "cli-spinners: dots14", frames: ["⠉⠉", "⠈⠙", "⠀⠹", "⠀⢸", "⠀⣰", "⢀⣠", "⣀⣀", "⣄⡀", "⣆⠀", "⡇⠀", "⠏⠀", "⠋⠁"], interval: 80 },
  { id: "dots2", label: "cli-spinners: dots2", frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"], interval: 80 },
  { id: "dots3", label: "cli-spinners: dots3", frames: ["⠋", "⠙", "⠚", "⠞", "⠖", "⠦", "⠴", "⠲", "⠳", "⠓"], interval: 80 },
  { id: "dots4", label: "cli-spinners: dots4", frames: ["⠄", "⠆", "⠇", "⠋", "⠙", "⠸", "⠰", "⠠", "⠰", "⠸", "⠙", "⠋", "⠇", "⠆"], interval: 80 },
  { id: "dots5", label: "cli-spinners: dots5", frames: ["⠋", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋"], interval: 80 },
  { id: "dots6", label: "cli-spinners: dots6", frames: ["⠁", "⠉", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠤", "⠄", "⠄", "⠤", "⠴", "⠲", "⠒", "⠂", "⠂", "⠒", "⠚", "⠙", "⠉", "⠁"], interval: 80 },
  { id: "dots7", label: "cli-spinners: dots7", frames: ["⠈", "⠉", "⠋", "⠓", "⠒", "⠐", "⠐", "⠒", "⠖", "⠦", "⠤", "⠠", "⠠", "⠤", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋", "⠉", "⠈"], interval: 80 },
  { id: "dots8", label: "cli-spinners: dots8", frames: ["⠁", "⠁", "⠉", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠤", "⠄", "⠄", "⠤", "⠠", "⠠", "⠤", "⠦", "⠖", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋", "⠉", "⠈", "⠈"], interval: 80 },
  { id: "dots8Bit", label: "cli-spinners: dots8Bit", frames: ["⠀", "⠁", "⠂", "⠃", "⠄", "⠅", "⠆", "⠇", "⡀", "⡁", "⡂", "⡃", "⡄", "⡅", "⡆", "⡇", "⠈", "⠉", "⠊", "⠋", "⠌", "⠍", "⠎", "⠏", "⡈", "⡉", "⡊", "⡋", "⡌", "⡍", "⡎", "⡏", "⠐", "⠑", "⠒", "⠓", "⠔", "⠕", "⠖", "⠗", "⡐", "⡑", "⡒", "⡓", "⡔", "⡕", "⡖", "⡗", "⠘", "⠙", "⠚", "⠛", "⠜", "⠝", "⠞", "⠟", "⡘", "⡙", "⡚", "⡛", "⡜", "⡝", "⡞", "⡟", "⠠", "⠡", "⠢", "⠣", "⠤", "⠥", "⠦", "⠧", "⡠", "⡡", "⡢", "⡣", "⡤", "⡥", "⡦", "⡧", "⠨", "⠩", "⠪", "⠫", "⠬", "⠭", "⠮", "⠯", "⡨", "⡩", "⡪", "⡫", "⡬", "⡭", "⡮", "⡯", "⠰", "⠱", "⠲", "⠳", "⠴", "⠵", "⠶", "⠷", "⡰", "⡱", "⡲", "⡳", "⡴", "⡵", "⡶", "⡷", "⠸", "⠹", "⠺", "⠻", "⠼", "⠽", "⠾", "⠿", "⡸", "⡹", "⡺", "⡻", "⡼", "⡽", "⡾", "⡿", "⢀", "⢁", "⢂", "⢃", "⢄", "⢅", "⢆", "⢇", "⣀", "⣁", "⣂", "⣃", "⣄", "⣅", "⣆", "⣇", "⢈", "⢉", "⢊", "⢋", "⢌", "⢍", "⢎", "⢏", "⣈", "⣉", "⣊", "⣋", "⣌", "⣍", "⣎", "⣏", "⢐", "⢑", "⢒", "⢓", "⢔", "⢕", "⢖", "⢗", "⣐", "⣑", "⣒", "⣓", "⣔", "⣕", "⣖", "⣗", "⢘", "⢙", "⢚", "⢛", "⢜", "⢝", "⢞", "⢟", "⣘", "⣙", "⣚", "⣛", "⣜", "⣝", "⣞", "⣟", "⢠", "⢡", "⢢", "⢣", "⢤", "⢥", "⢦", "⢧", "⣠", "⣡", "⣢", "⣣", "⣤", "⣥", "⣦", "⣧", "⢨", "⢩", "⢪", "⢫", "⢬", "⢭", "⢮", "⢯", "⣨", "⣩", "⣪", "⣫", "⣬", "⣭", "⣮", "⣯", "⢰", "⢱", "⢲", "⢳", "⢴", "⢵", "⢶", "⢷", "⣰", "⣱", "⣲", "⣳", "⣴", "⣵", "⣶", "⣷", "⢸", "⢹", "⢺", "⢻", "⢼", "⢽", "⢾", "⢿", "⣸", "⣹", "⣺", "⣻", "⣼", "⣽", "⣾", "⣿"], interval: 80 },
  { id: "dots9", label: "cli-spinners: dots9", frames: ["⢹", "⢺", "⢼", "⣸", "⣇", "⡧", "⡗", "⡏"], interval: 80 },
  { id: "dotsCircle", label: "cli-spinners: dotsCircle", frames: ["⢎ ", "⠎⠁", "⠊⠑", "⠈⠱", " ⡱", "⢀⡰", "⢄⡠", "⢆⡀"], interval: 80 },
  { id: "dqpb", label: "cli-spinners: dqpb", frames: ["d", "q", "p", "b"], interval: 100 },
  { id: "fish", label: "cli-spinners: fish", frames: ["~~~~~~~~~~~~~~~~~~~~", "> ~~~~~~~~~~~~~~~~~~", "º> ~~~~~~~~~~~~~~~~~", "(º> ~~~~~~~~~~~~~~~~", "((º> ~~~~~~~~~~~~~~~", "<((º> ~~~~~~~~~~~~~~", "><((º> ~~~~~~~~~~~~~", " ><((º> ~~~~~~~~~~~~", "~ ><((º> ~~~~~~~~~~~", "~~ <>((º> ~~~~~~~~~~", "~~~ ><((º> ~~~~~~~~~", "~~~~ <>((º> ~~~~~~~~", "~~~~~ ><((º> ~~~~~~~", "~~~~~~ <>((º> ~~~~~~", "~~~~~~~ ><((º> ~~~~~", "~~~~~~~~ <>((º> ~~~~", "~~~~~~~~~ ><((º> ~~~", "~~~~~~~~~~ <>((º> ~~", "~~~~~~~~~~~ ><((º> ~", "~~~~~~~~~~~~ <>((º> ", "~~~~~~~~~~~~~ ><((º>", "~~~~~~~~~~~~~~ <>((º", "~~~~~~~~~~~~~~~ ><((", "~~~~~~~~~~~~~~~~ <>(", "~~~~~~~~~~~~~~~~~ ><", "~~~~~~~~~~~~~~~~~~ <", "~~~~~~~~~~~~~~~~~~~~"], interval: 80 },
  { id: "flip", label: "cli-spinners: flip", frames: ["_", "_", "_", "-", "`", "`", "'", "´", "-", "_", "_", "_"], interval: 70 },
  { id: "growHorizontal", label: "cli-spinners: growHorizontal", frames: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "▊", "▋", "▌", "▍", "▎"], interval: 120 },
  { id: "growVertical", label: "cli-spinners: growVertical", frames: ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"], interval: 120 },
  { id: "line", label: "cli-spinners: line", frames: ["-", "\\", "|", "/"], interval: 130 },
  { id: "line2", label: "cli-spinners: line2", frames: ["⠂", "-", "–", "—", "–", "-"], interval: 100 },
  { id: "material", label: "cli-spinners: material", frames: ["█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "███████▁▁▁▁▁▁▁▁▁▁▁▁▁", "████████▁▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "██████████▁▁▁▁▁▁▁▁▁▁", "███████████▁▁▁▁▁▁▁▁▁", "█████████████▁▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁▁██████████████▁▁▁▁", "▁▁▁██████████████▁▁▁", "▁▁▁▁█████████████▁▁▁", "▁▁▁▁██████████████▁▁", "▁▁▁▁██████████████▁▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁██████████████▁", "▁▁▁▁▁▁██████████████", "▁▁▁▁▁▁██████████████", "▁▁▁▁▁▁▁█████████████", "▁▁▁▁▁▁▁█████████████", "▁▁▁▁▁▁▁▁████████████", "▁▁▁▁▁▁▁▁████████████", "▁▁▁▁▁▁▁▁▁███████████", "▁▁▁▁▁▁▁▁▁███████████", "▁▁▁▁▁▁▁▁▁▁██████████", "▁▁▁▁▁▁▁▁▁▁██████████", "▁▁▁▁▁▁▁▁▁▁▁▁████████", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁██████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "███▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "████▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "██████▁▁▁▁▁▁▁▁▁▁▁▁▁█", "████████▁▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "█████████▁▁▁▁▁▁▁▁▁▁▁", "███████████▁▁▁▁▁▁▁▁▁", "████████████▁▁▁▁▁▁▁▁", "████████████▁▁▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "██████████████▁▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁██████████████▁▁▁▁▁", "▁▁▁█████████████▁▁▁▁", "▁▁▁▁▁████████████▁▁▁", "▁▁▁▁▁████████████▁▁▁", "▁▁▁▁▁▁███████████▁▁▁", "▁▁▁▁▁▁▁▁█████████▁▁▁", "▁▁▁▁▁▁▁▁█████████▁▁▁", "▁▁▁▁▁▁▁▁▁█████████▁▁", "▁▁▁▁▁▁▁▁▁█████████▁▁", "▁▁▁▁▁▁▁▁▁▁█████████▁", "▁▁▁▁▁▁▁▁▁▁▁████████▁", "▁▁▁▁▁▁▁▁▁▁▁████████▁", "▁▁▁▁▁▁▁▁▁▁▁▁███████▁", "▁▁▁▁▁▁▁▁▁▁▁▁███████▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁███████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁", "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"], interval: 17 },
  { id: "noise", label: "cli-spinners: noise", frames: ["▓", "▒", "░"], interval: 100 },
  { id: "pong", label: "cli-spinners: pong", frames: ["▐⠂       ▌", "▐⠈       ▌", "▐ ⠂      ▌", "▐ ⠠      ▌", "▐  ⡀     ▌", "▐  ⠠     ▌", "▐   ⠂    ▌", "▐   ⠈    ▌", "▐    ⠂   ▌", "▐    ⠠   ▌", "▐     ⡀  ▌", "▐     ⠠  ▌", "▐      ⠂ ▌", "▐      ⠈ ▌", "▐       ⠂▌", "▐       ⠠▌", "▐       ⡀▌", "▐      ⠠ ▌", "▐      ⠂ ▌", "▐     ⠈  ▌", "▐     ⠂  ▌", "▐    ⠠   ▌", "▐    ⡀   ▌", "▐   ⠠    ▌", "▐   ⠂    ▌", "▐  ⠈     ▌", "▐  ⠂     ▌", "▐ ⠠      ▌", "▐ ⡀      ▌", "▐⠠       ▌"], interval: 80 },
  { id: "rollingLine", label: "cli-spinners: rollingLine", frames: ["/  ", " - ", " \\ ", "  |", "  |", " \\ ", " - ", "/  "], interval: 80 },
  { id: "sand", label: "cli-spinners: sand", frames: ["⠁", "⠂", "⠄", "⡀", "⡈", "⡐", "⡠", "⣀", "⣁", "⣂", "⣄", "⣌", "⣔", "⣤", "⣥", "⣦", "⣮", "⣶", "⣷", "⣿", "⡿", "⠿", "⢟", "⠟", "⡛", "⠛", "⠫", "⢋", "⠋", "⠍", "⡉", "⠉", "⠑", "⠡", "⢁"], interval: 80 },
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
  { id: "braillewave", label: "unicode-animations: braillewave", frames: ["⠁⠂⠄⡀", "⠂⠄⡀⢀", "⠄⡀⢀⠠", "⡀⢀⠠⠐", "⢀⠠⠐⠈", "⠠⠐⠈⠁", "⠐⠈⠁⠂", "⠈⠁⠂⠄"], interval: 100 },
  { id: "breathe", label: "unicode-animations: breathe", frames: ["⠀", "⠂", "⠌", "⡑", "⢕", "⢝", "⣫", "⣟", "⣿", "⣟", "⣫", "⢝", "⢕", "⡑", "⠌", "⠂", "⠀"], interval: 100 },
  { id: "cascade", label: "unicode-animations: cascade", frames: ["⠀⠀⠀⠀", "⠀⠀⠀⠀", "⠁⠀⠀⠀", "⠋⠀⠀⠀", "⠞⠁⠀⠀", "⡴⠋⠀⠀", "⣠⠞⠁⠀", "⢀⡴⠋⠀", "⠀⣠⠞⠁", "⠀⢀⡴⠋", "⠀⠀⣠⠞", "⠀⠀⢀⡴", "⠀⠀⠀⣠", "⠀⠀⠀⢀"], interval: 60 },
  { id: "checkerboard", label: "unicode-animations: checkerboard", frames: ["⢕⢕⢕", "⡪⡪⡪", "⢊⠔⡡", "⡡⢊⠔"], interval: 250 },
  { id: "columns", label: "unicode-animations: columns", frames: ["⡀⠀⠀", "⡄⠀⠀", "⡆⠀⠀", "⡇⠀⠀", "⣇⠀⠀", "⣧⠀⠀", "⣷⠀⠀", "⣿⠀⠀", "⣿⡀⠀", "⣿⡄⠀", "⣿⡆⠀", "⣿⡇⠀", "⣿⣇⠀", "⣿⣧⠀", "⣿⣷⠀", "⣿⣿⠀", "⣿⣿⡀", "⣿⣿⡄", "⣿⣿⡆", "⣿⣿⡇", "⣿⣿⣇", "⣿⣿⣧", "⣿⣿⣷", "⣿⣿⣿", "⣿⣿⣿", "⠀⠀⠀"], interval: 60 },
  { id: "diagswipe", label: "unicode-animations: diagswipe", frames: ["⠁⠀", "⠋⠀", "⠟⠁", "⡿⠋", "⣿⠟", "⣿⡿", "⣿⣿", "⣿⣿", "⣾⣿", "⣴⣿", "⣠⣾", "⢀⣴", "⠀⣠", "⠀⢀", "⠀⠀", "⠀⠀"], interval: 60 },
  { id: "dna", label: "unicode-animations: dna", frames: ["⠋⠉⠙⠚", "⠉⠙⠚⠒", "⠙⠚⠒⠂", "⠚⠒⠂⠂", "⠒⠂⠂⠒", "⠂⠂⠒⠲", "⠂⠒⠲⠴", "⠒⠲⠴⠤", "⠲⠴⠤⠄", "⠴⠤⠄⠋", "⠤⠄⠋⠉", "⠄⠋⠉⠙"], interval: 80 },
  { id: "fillsweep", label: "unicode-animations: fillsweep", frames: ["⣀⣀", "⣤⣤", "⣶⣶", "⣿⣿", "⣿⣿", "⣿⣿", "⣶⣶", "⣤⣤", "⣀⣀", "⠀⠀", "⠀⠀"], interval: 100 },
  { id: "helix", label: "unicode-animations: helix", frames: ["⢌⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉"], interval: 80 },
  { id: "orbit", label: "unicode-animations: orbit", frames: ["⠃", "⠉", "⠘", "⠰", "⢠", "⣀", "⡄", "⠆"], interval: 100 },
  { id: "pulse", label: "unicode-animations: pulse", frames: ["⠀⠶⠀", "⠰⣿⠆", "⢾⣉⡷", "⣏⠀⣹", "⡁⠀⢈"], interval: 180 },
  { id: "rain", label: "unicode-animations: rain", frames: ["⢁⠂⠔⠈", "⠂⠌⡠⠐", "⠄⡐⢀⠡", "⡈⠠⠀⢂", "⠐⢀⠁⠄", "⠠⠁⠊⡀", "⢁⠂⠔⠈", "⠂⠌⡠⠐", "⠄⡐⢀⠡", "⡈⠠⠀⢂", "⠐⢀⠁⠄", "⠠⠁⠊⡀"], interval: 100 },
  { id: "scan", label: "unicode-animations: scan", frames: ["⠀⠀⠀⠀", "⡇⠀⠀⠀", "⣿⠀⠀⠀", "⢸⡇⠀⠀", "⠀⣿⠀⠀", "⠀⢸⡇⠀", "⠀⠀⣿⠀", "⠀⠀⢸⡇", "⠀⠀⠀⣿", "⠀⠀⠀⢸"], interval: 70 },
  { id: "scanline", label: "unicode-animations: scanline", frames: ["⠉⠉⠉", "⠓⠓⠓", "⠦⠦⠦", "⣄⣄⣄", "⠦⠦⠦", "⠓⠓⠓"], interval: 120 },
  { id: "snake", label: "unicode-animations: snake", frames: ["⣁⡀", "⣉⠀", "⡉⠁", "⠉⠉", "⠈⠙", "⠀⠛", "⠐⠚", "⠒⠒", "⠖⠂", "⠶⠀", "⠦⠄", "⠤⠤", "⠠⢤", "⠀⣤", "⢀⣠", "⣀⣀"], interval: 80 },
  { id: "sparkle", label: "unicode-animations: sparkle", frames: ["⡡⠊⢔⠡", "⠊⡰⡡⡘", "⢔⢅⠈⢢", "⡁⢂⠆⡍", "⢔⠨⢑⢐", "⠨⡑⡠⠊"], interval: 150 },
  { id: "waverows", label: "unicode-animations: waverows", frames: ["⠖⠉⠉⠑", "⡠⠖⠉⠉", "⣠⡠⠖⠉", "⣄⣠⡠⠖", "⠢⣄⣠⡠", "⠙⠢⣄⣠", "⠉⠙⠢⣄", "⠊⠉⠙⠢", "⠜⠊⠉⠙", "⡤⠜⠊⠉", "⣀⡤⠜⠊", "⢤⣀⡤⠜", "⠣⢤⣀⡤", "⠑⠣⢤⣀", "⠉⠑⠣⢤", "⠋⠉⠑⠣"], interval: 90 },
];

export function spinnerById(id: string): Spinner {
  return spinners.find((s) => s.id === id) ?? spinners[0];
}

export const DEFAULT_SPINNER_ID = "dots";
