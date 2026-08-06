export async function* readSseJsonFrames<T = unknown>(
  response: Response,
): AsyncGenerator<T> {
  if (!response.body) {
    throw new Error("响应没有可读流。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const rawFrame of frames) {
      const dataLine = rawFrame
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) {
        continue;
      }
      const raw = dataLine.replace(/^data:\s?/, "").trim();
      if (!raw || raw === "[DONE]") {
        continue;
      }
      yield JSON.parse(raw) as T;
    }
  }
}
