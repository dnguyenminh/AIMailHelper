// tests/mocks/chrome.ts — chrome mock helper dùng chung (TDD §12.2): in-memory storage, runtime events,
// sendMessage dispatch tới router thật (integration-lite), port pair duplex, permissions, tabs.
// GĐ2 mở rộng: SSE fixture, port delay/drop (test seq gap), heartbeat assert.

type Listener = (...args: unknown[]) => void;

export interface EventMock {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
  emit(...args: unknown[]): void;
  collect(...args: unknown[]): unknown[];
  clear(): void;
}

export function createEvent(): EventMock {
  const listeners = new Set<Listener>();
  const run = (args: unknown[], collect: boolean): unknown[] => {
    const results: unknown[] = [];
    for (const listener of [...listeners]) {
      const result = listener(...args);
      if (collect) results.push(result);
    }
    return results;
  };
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => { run(args, false); },
    collect: (...args) => run(args, true),
    clear: () => listeners.clear()
  };
}

export interface StorageAreaMock {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  failNextSet(): void;
  dump(): Map<string, unknown>;
}

export function createStorageArea(): StorageAreaMock {
  const map = new Map<string, unknown>();
  let failNextSet = false;
  return {
    async get(keys) {
      const result: Record<string, unknown> = {};
      if (keys === null) {
        for (const [key, value] of map.entries()) result[key] = value;
        return result;
      }
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) if (map.has(key)) result[key] = map.get(key);
      return result;
    },
    async set(items) {
      if (failNextSet) {
        failNextSet = false;
        throw new Error("QUOTA_BYTES_PER_ITEM exceeded"); // mô phỏng quota (ERR-08)
      }
      for (const [key, value] of Object.entries(items)) map.set(key, value);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) map.delete(key);
    },
    async clear() {
      map.clear();
    },
    failNextSet() {
      failNextSet = true;
    },
    dump() {
      return map;
    }
  };
}

export interface PortPair {
  client: unknown;
  server: unknown;
  clientMessages: EventMock;
  serverMessages: EventMock;
}

// Duplex fake: client.postMessage → server.onMessage; ngược lại; disconnect thủ công (test EF-7).
// postMessage defer qua queueMicrotask — mô phỏng Chrome thật: message post ngay sau connect vẫn được
// deliver sau khi listener onConnect/onMessage gắn xong (tránh mất message đầu — bug mock).
export function createPortPair(name: string): PortPair {
  const clientMessages = createEvent();
  const serverMessages = createEvent();
  const clientDisconnect = createEvent();
  const serverDisconnect = createEvent();
  const client = {
    name: name,
    onMessage: clientMessages,
    onDisconnect: clientDisconnect,
    postMessage: (message: unknown) => queueMicrotask(() => serverMessages.emit(message)),
    disconnect: () => serverDisconnect.emit()
  };
  const server = {
    name: name,
    onMessage: serverMessages,
    onDisconnect: serverDisconnect,
    postMessage: (message: unknown) => queueMicrotask(() => clientMessages.emit(message)),
    disconnect: () => clientDisconnect.emit()
  };
  return { client: client, server: server, clientMessages: clientMessages, serverMessages: serverMessages };
}

export interface ChromeMock {
  storage: { sync: StorageAreaMock; local: StorageAreaMock; onChanged: EventMock };
  runtime: {
    lastError: unknown;
    onMessage: EventMock;
    onConnect: EventMock;
    onInstalled: EventMock;
    onStartup: EventMock;
    sendMessage(message: unknown): Promise<unknown>;
    connect(name: string): unknown;
    getURL(path: string): string;
  };
  permissions: { contains(): Promise<boolean>; request(): Promise<boolean> };
  tabs: { captureVisibleTab(): Promise<string> };
  windows: { WINDOW_ID_CURRENT: number };
}

export function createChromeMock(): ChromeMock {
  const sync = createStorageArea();
  const local = createStorageArea();
  const onMessage = createEvent();
  const onConnect = createEvent();
  const onInstalled = createEvent();
  const onStartup = createEvent();

  const sendMessage = (message: unknown): Promise<unknown> => new Promise((resolve) => {
    const sendResponse = (response: unknown): void => resolve(response);
    const results = onMessage.collect(message, { id: "mock-sender" }, sendResponse);
    // listener trả true → async (router luôn gọi sendResponse); không có listener → resolve undefined.
    if (!results.some((result) => result === true)) resolve(undefined);
  });

  const connect = (connectInfo: unknown): unknown => {
    // chrome.runtime.connect(connectInfo: {name}) — PortClient truyền OBJECT (§3.4); string cũng chấp nhận.
    const name = typeof connectInfo === "string" ? connectInfo : String((connectInfo as { name?: unknown })?.name ?? "");
    const pair = createPortPair(name);
    queueMicrotask(() => onConnect.emit(pair.server));
    return pair.client;
  };

  return {
    storage: { sync: sync, local: local, onChanged: createEvent() },
    runtime: {
      lastError: null,
      onMessage: onMessage,
      onConnect: onConnect,
      onInstalled: onInstalled,
      onStartup: onStartup,
      sendMessage: sendMessage,
      connect: connect,
      getURL: (path) => "chrome-extension://mock-extension" + path
    },
    permissions: {
      contains: async () => true,
      request: async () => true
    },
    tabs: {
      captureVisibleTab: async () => "data:image/jpeg;base64,mock-capture"
    },
    windows: { WINDOW_ID_CURRENT: -2 }
  };
}
