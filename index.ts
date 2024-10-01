addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const openAIWsUrl = "wss://api.openai.com/v1/realtime";
const openAIToken = process.env.OPENAI_API_KEY;

async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Connect>
                    <Stream url="wss://${url.host}" />
                </Connect>
            </Response>`,
      {
        headers: { "content-type": "text/xml" },
      },
    );
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  handleWebSocketSession(server);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function handleWebSocketSession(webSocket: WebSocket) {
  webSocket.accept();

  const configMessage = {
    type: "session.update",
    session: {
      model: "gpt-4o-realtime-preview-2024-10-01",
      voice: "alloy",
      instructions:
        "You are a helpful voice assistant. You cannot perform actions, but you have expert knowledge. Please be as concise as possible.",
    },
  };

  let streamSid: undefined | string = undefined;
  let openAIWs: WebSocket | null = null;

  function connectToOpenAI() {
    return new WebSocket(openAIWsUrl, {
      headers: {
        Authorization: `Bearer ${openAIToken}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });
  }

  async function handleOpenAIWebSocket() {
    openAIWs = connectToOpenAI();
    openAIWs.addEventListener("open", () => {
      openAIWs?.send(JSON.stringify(configMessage));
    });

    openAIWs.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data);

      if (
        message.type === "response.output_item.added" &&
        message.item.content_type === "audio"
      ) {
        const audioBase64 = message.item.content.audio;
        const audioBuffer = atob(audioBase64);
        const mulawString = String.fromCharCode(...new Uint8Array(audioBuffer));
        const mediaMessage = {
          event: "media",
          streamSid,
          media: { payload: btoa(mulawString) },
        };

        webSocket.send(JSON.stringify(mediaMessage));
      }
    });
  }

  async function handleTwilioWebSocket() {
    const BUFFER_SIZE = 20 * 160;
    let inbuffer: Uint8Array = new Uint8Array(0);

    webSocket.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data as string);
      if (data.event === "start") {
        streamSid = data.start.streamSid;
      }
      if (data.event === "media") {
        const media = data.media;
        const chunk = new Uint8Array(
          atob(media.payload)
            .split("")
            .map((char) => char.charCodeAt(0)),
        );
        if (media.track === "inbound") {
          const newBuffer = new Uint8Array(inbuffer.length + chunk.length);
          newBuffer.set(inbuffer);
          newBuffer.set(chunk, inbuffer.length);
          inbuffer = newBuffer;
        }
      }

      while (inbuffer.length >= BUFFER_SIZE) {
        const chunk = inbuffer.slice(0, BUFFER_SIZE);
        inbuffer = inbuffer.slice(BUFFER_SIZE);

        if (openAIWs && openAIWs.readyState === WebSocket.OPEN) {
          const base64Chunk = btoa(String.fromCharCode(...chunk));
          openAIWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Chunk,
            }),
          );
        } else {
          console.warn("OpenAI WebSocket not open, cannot send chunk");
        }
      }
    });
  }

  handleOpenAIWebSocket();
  handleTwilioWebSocket();
}
