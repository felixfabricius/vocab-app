import { describe, expect, it } from "vitest";
import { draftsFromTranslateLog, latestTimestamp, parseTranslateLog, rowsAfter } from "./translateLog";

const shortcutLog = `2026-09-18T19:05:12+02:00 ||| en-es ||| where is the bathroom? ||| ¿Dónde está el baño?
2026-09-18T19:07:40+02:00 ||| es-en ||| al tiro ||| right away
2026-09-18T19:07:40+02:00 ||| es-en ||| al tiro ||| right away
18.09.26, 19:10 ||| ES-EN ||| cachái ||| you know?
just some text

2026-09-18T19:12:00+02:00 ||| xx-yy ||| a ||| b
`;

describe("translate log, Shortcuts line format", () => {
  it("parses separator lines, dedupes, normalises direction, reports bad lines", () => {
    const r = parseTranslateLog(shortcutLog);
    expect(r.rows.map((x) => x.src)).toEqual(["where is the bathroom?", "al tiro", "cachái"]);
    expect(r.rows[2]?.dir).toBe("es-en");
    expect(r.errors.length).toBe(2);
  });

  it("skips rows up to the last import but keeps undated ones", () => {
    const rows = parseTranslateLog(shortcutLog).rows;
    const after = rowsAfter(rows, "2026-09-18T17:06:00Z"); // 19:06 in +02:00
    expect(after.map((x) => x.src)).toEqual(["al tiro", "cachái"]);
    expect(rowsAfter(rows, undefined).length).toBe(3);
    expect(latestTimestamp(rows)).toBe("2026-09-18T17:07:40.000Z");
  });
});

const log = `{"at":"2026-09-18T10:00:00Z","dir":"en-es","src":"where is the bathroom?","dst":"¿Dónde está el baño?"}
{"at":"2026-09-18T10:01:00Z","dir":"es-en","src":"al tiro","dst":"right away"}
{"at":"2026-09-18T10:01:00Z","dir":"es-en","src":"al tiro","dst":"right away"}
not json
{"at":"2026-09-18T10:02:00Z","dir":"en-es","src":"I would like to book a table for two people tonight please","dst":"Quisiera reservar una mesa para dos personas esta noche por favor"}
`;

describe("translate log", () => {
  it("parses lines, dedupes, and reports errors", () => {
    const r = parseTranslateLog(log);
    expect(r.rows.length).toBe(3);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toMatch(/^Line 4:/);
  });

  it("turns short items into drafts and skips long sentences", () => {
    const d = draftsFromTranslateLog(parseTranslateLog(log).rows);
    expect(d.map((x) => x.lemma)).toEqual(["¿Dónde está el baño", "al tiro"]);
    expect(d[1]?.senses[0]?.gloss).toBe("right away");
    expect(d[0]?.isPhrase).toBe(true);
  });
});
