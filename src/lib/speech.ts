// Browser speech helpers: Web Speech API (zero keys, zero downloads).
// The engine is deliberately swappable — this file is the seam where a
// hosted TTS/STT or SIP/telephony stack would plug in.

export function speechSupported(): { stt: boolean; tts: boolean } {
  if (typeof window === "undefined") return { stt: false, tts: false };
  const w = window as unknown as Record<string, unknown>;
  return {
    stt: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    tts: "speechSynthesis" in window,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRecognizer(onFinal: (text: string) => void, onEnd: () => void): any {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as new () => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = new Ctor() as any;
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    const text = Array.from(e.results as ArrayLike<{ 0: { transcript: string } }>)
      .map((r) => r[0].transcript)
      .join(" ")
      .trim();
    if (text) onFinal(text);
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  return rec;
}

// Strip markdown + citations so TTS reads naturally.
export function toSpeakable(text: string): string {
  return text
    .replace(/\[(?:owner-manual|quick-start-guide|selection-chart)\s+p\.?\s*\d+\]/g, "")
    .replace(/[*_#`>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Pull complete sentences out of a growing buffer; returns [sentences, rest].
export function drainSentences(buffer: string): [string[], string] {
  const out: string[] = [];
  let rest = buffer;
  for (;;) {
    const m = rest.match(/^[\s\S]*?[.!?](?:\s|$)/);
    if (!m) break;
    out.push(m[0].trim());
    rest = rest.slice(m[0].length);
  }
  return [out, rest];
}

export function speak(sentence: string): void {
  const clean = toSpeakable(sentence);
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}
