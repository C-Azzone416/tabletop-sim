export const MISSION_DESCRIPTIONS: Record<number, string> = {
  1: "Blue wires only — learn the basics",
  2: "Blue wires, tighter detonator — learn efficiency",
  3: "Yellow wires join the mix",
  4: "More yellow, fewer blue — harder deduction",
  5: "Red wires appear — reveal_reds unlocked",
  6: "More reds, tighter detonator",
  7: "All wire types, all mechanics",
  8: "Final training — tightest detonator",
};

export const LAST_MISSION = Math.max(...Object.keys(MISSION_DESCRIPTIONS).map(Number));
