import { describe, expect, it } from "vitest";
import { draftsFromTranslateLog, parseTranslateLog } from "./translateLog";

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
    expect(r.errors).toEqual(["Line 4: not JSON"]);
  });

  it("turns short items into drafts and skips long sentences", () => {
    const d = draftsFromTranslateLog(parseTranslateLog(log).rows);
    expect(d.map((x) => x.lemma)).toEqual(["¿Dónde está el baño", "al tiro"]);
    expect(d[1]?.senses[0]?.gloss).toBe("right away");
    expect(d[0]?.isPhrase).toBe(true);
  });
});
