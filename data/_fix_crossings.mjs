/* v7.22q — place the card line after the END of the cities statement. The previous attempt put it
   between `(nr.cities||[]).length` and the `?"Crosses: ...` that continues the same ternary, which
   is a SyntaxError. Anchor on the text that ends the statement instead of on its first line. */
import { readFileSync, writeFileSync } from "node:fs";
const p = "map3d.js";
let s = readFileSync(p, "utf8");
const NL = String.fromCharCode(10);
const LINE = '  {const xb=dEl("damCross");if(xb)xb.innerHTML=damCrossText();}';
while (s.includes(LINE)) s = s.replace(LINE + NL, "").replace(LINE, "");

const end = ':"No city marker within 8 km of this course.";';
const i = s.indexOf(end);
if (i < 0) { console.log("END ANCHOR MISSING"); process.exit(1); }
const nl = s.indexOf(NL, i);
const at = nl + 1;
s = s.slice(0, at) + LINE + NL + s.slice(at);
writeFileSync(p, s, "utf8");
console.log("inserted after the cities statement, at byte", at);
console.log("context:");
console.log(s.slice(at - 150, at + 80).split(NL).map(l => "   " + l.trim().substring(0, 100)).join("\n"));