import * as signalR from "@microsoft/signalr";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

let connection: signalR.HubConnection | null = null;
let activeToken: string | null = null;

export function getChatConnection(token: string): signalR.HubConnection {
  // Return existing connection if it's still usable and token hasn't changed
  if (
    connection &&
    activeToken === token &&
    connection.state !== signalR.HubConnectionState.Disconnected
  ) {
    return connection;
  }

  // If there's an old connection, stop it
  if (connection) {
    connection.stop().catch(() => {});
    connection = null;
  }

  activeToken = token;
  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${baseUrl}/hubs/chat`, {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect([0, 1000, 5000, 10000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  // Agent tool calls can take minutes — increase timeout from default 30s
  connection.serverTimeoutInMilliseconds = 5 * 60 * 1000; // 5 minutes
  connection.keepAliveIntervalInMilliseconds = 15 * 1000;  // 15 seconds

  return connection;
}

export async function startConnection(
  conn: signalR.HubConnection
): Promise<void> {
  if (conn.state === signalR.HubConnectionState.Disconnected) {
    try {
      await conn.start();
    } catch (err) {
      // Rule #10: No console.log in production — error is re-thrown for caller to handle
      throw err;
    }
  }
}

export function disconnectChat(): void {
  // Don't actually disconnect — let the connection persist
  // Only disconnect when explicitly needed (logout, etc.)
}

export function forceDisconnect(): Promise<void> {
  if (connection) {
    const c = connection;
    connection = null;
    activeToken = null;
    return c.stop();
  }
  return Promise.resolve();
}
