// Speech-to-text via the OpenAI transcription API.

export async function transcribe(opts: {
  apiKey: string;
  apiBase: string;
  model: string;
  audio: ArrayBuffer;
  filename: string;
}): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([opts.audio]), opts.filename);
  form.append("model", opts.model);
  form.append("response_format", "json");

  const res = await fetch(`${opts.apiBase}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI transcription ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
