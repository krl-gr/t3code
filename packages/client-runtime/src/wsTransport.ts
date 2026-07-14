import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { RpcClient } from "effect/unstable/rpc";

import { isTransportConnectionErrorMessage } from "./errors/transport.ts";
import {
  createWsRpcProtocolLayer,
  makeWsRpcProtocolClient,
  type WsProtocolLifecycleHandlers,
  type WsRpcProtocolClient,
  type WsRpcProtocolSocketUrlProvider,
} from "./wsRpcProtocol.ts";

export type WsRpcClientFactory<Client> = () => Effect.Effect<
  Client,
  Error,
  RpcClient.Protocol | Scope.Scope
>;

interface WsTransportBaseOptions {
  readonly tracingLayer?: Layer.Layer<never, never, never>;
  readonly createProtocolLayer?: (
    url: WsRpcProtocolSocketUrlProvider,
    lifecycleHandlers?: WsProtocolLifecycleHandlers,
  ) => Layer.Layer<RpcClient.Protocol, never, never>;
  readonly logWarning?: (message: string, metadata: { readonly error: string }) => void;
  readonly onBeforeReconnect?: () => void;
}

type IsExactly<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

export type WsTransportOptions<Client = WsRpcProtocolClient> = WsTransportBaseOptions &
  (IsExactly<Client, WsRpcProtocolClient> extends true
    ? {
        readonly rpcClientFactory?: WsRpcClientFactory<Client>;
      }
    : {
        readonly rpcClientFactory: WsRpcClientFactory<Client>;
      });

type WsTransportConstructorArgs<Client> =
  IsExactly<Client, WsRpcProtocolClient> extends true
    ? [lifecycleHandlers?: WsProtocolLifecycleHandlers, options?: WsTransportOptions<Client>]
    : [
        lifecycleHandlers: WsProtocolLifecycleHandlers | undefined,
        options: WsTransportOptions<Client>,
      ];

interface SubscribeOptions {
  readonly retryDelay?: Duration.Input;
  readonly onResubscribe?: () => void;
  readonly tag?: string;
}

const DEFAULT_SUBSCRIPTION_RETRY_DELAY = Duration.millis(250);
const NOOP: () => void = () => undefined;

interface TransportSession<Client> {
  readonly clientPromise: Promise<Client>;
  readonly clientScope: Scope.Closeable;
  readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function normalizeClientFactoryError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Failed to create the WebSocket RPC client.", { cause: error });
}

export class WsTransport<Client = WsRpcProtocolClient> {
  private readonly url: WsRpcProtocolSocketUrlProvider;
  private readonly lifecycleHandlers: WsProtocolLifecycleHandlers | undefined;
  private readonly options: WsTransportOptions<Client> | undefined;
  private disposed = false;
  private hasReportedTransportDisconnect = false;
  private intentionalCloseDepth = 0;
  private nextSessionId = 0;
  private activeSessionId = 0;
  private lastHeartbeatPongAt: number | null = null;
  private readonly streamRequestStartListeners = new Set<
    (info: { readonly tag: string }) => void
  >();
  private reconnectChain: Promise<void> = Promise.resolve();
  private session: TransportSession<Client>;

  constructor(url: WsRpcProtocolSocketUrlProvider, ...args: WsTransportConstructorArgs<Client>) {
    const [lifecycleHandlers, options] = args;
    this.url = url;
    this.lifecycleHandlers = lifecycleHandlers;
    this.options = options;
    this.session = this.createSession();
  }

  async request<TSuccess>(
    execute: (client: Client) => Effect.Effect<TSuccess, Error, never>,
  ): Promise<TSuccess> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    return await session.runtime.runPromise(Effect.suspend(() => execute(client)));
  }

  async requestStream<TValue>(
    connect: (client: Client) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    await session.runtime.runPromise(
      Stream.runForEach(connect(client), (value) =>
        Effect.sync(() => {
          try {
            listener(value);
          } catch {
            // Keep the stream lifecycle independent from UI listener errors.
          }
        }),
      ),
    );
  }

  subscribe<TValue>(
    connect: (client: Client) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    options?: SubscribeOptions,
  ): () => void {
    if (this.disposed) {
      return NOOP;
    }

    let active = true;
    let hasReceivedValue = false;
    const retryDelayMs = Duration.toMillis(
      Duration.fromInputUnsafe(options?.retryDelay ?? DEFAULT_SUBSCRIPTION_RETRY_DELAY),
    );
    let cancelCurrentStream: () => void = NOOP;
    const onStreamRequestStart = (info: { readonly tag: string }) => {
      if (
        !hasReceivedValue ||
        !active ||
        (options?.tag !== undefined && info.tag !== options.tag)
      ) {
        return;
      }

      try {
        options?.onResubscribe?.();
      } catch {
        // Ignore reconnect hook failures so the stream can recover.
      }
    };
    this.streamRequestStartListeners.add(onStreamRequestStart);

    void (async () => {
      for (;;) {
        if (!active || this.disposed) {
          return;
        }

        const session = this.session;
        try {
          const runningStream = this.runStreamOnSession(
            session,
            connect,
            listener,
            () => active,
            () => {
              this.hasReportedTransportDisconnect = false;
              hasReceivedValue = true;
            },
          );
          cancelCurrentStream = runningStream.cancel;
          await runningStream.completed;
          cancelCurrentStream = NOOP;
        } catch (error) {
          cancelCurrentStream = NOOP;
          if (!active || this.disposed) {
            return;
          }

          if (session !== this.session) {
            continue;
          }

          const formattedError = formatErrorMessage(error);
          if (!isTransportConnectionErrorMessage(formattedError)) {
            this.logWarning("WebSocket RPC subscription failed", { error: formattedError });
            return;
          }

          if (!this.hasReportedTransportDisconnect) {
            this.logWarning("WebSocket RPC subscription disconnected", {
              error: formattedError,
            });
          }
          this.hasReportedTransportDisconnect = true;
          await sleep(retryDelayMs);
        }
      }
    })();

    return () => {
      active = false;
      this.streamRequestStartListeners.delete(onStreamRequestStart);
      cancelCurrentStream();
    };
  }

  async reconnect() {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const reconnectOperation = this.reconnectChain.then(async () => {
      if (this.disposed) {
        throw new Error("Transport disposed");
      }

      try {
        this.options?.onBeforeReconnect?.();
      } catch {
        // Ignore hook failures so reconnect can proceed.
      }

      this.lastHeartbeatPongAt = null;
      const previousSession = this.session;
      this.session = this.createSession();
      await this.closeSession(previousSession);
    });

    this.reconnectChain = reconnectOperation.catch(() => undefined);
    await reconnectOperation;
  }

  isHeartbeatFresh(maxAgeMs = 15_000): boolean {
    return (
      this.lastHeartbeatPongAt !== null && performance.now() - this.lastHeartbeatPongAt <= maxAgeMs
    );
  }

  async dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    await this.closeSession(this.session);
  }

  private closeSession(session: TransportSession<Client>) {
    this.intentionalCloseDepth += 1;
    return session.runtime.runPromise(Scope.close(session.clientScope, Exit.void)).finally(() => {
      this.intentionalCloseDepth = Math.max(0, this.intentionalCloseDepth - 1);
      session.runtime.dispose();
    });
  }

  private createSession(): TransportSession<Client> {
    const protocolFactory = this.options?.createProtocolLayer ?? createWsRpcProtocolLayer;
    const sessionId = this.nextSessionId + 1;
    this.nextSessionId = sessionId;
    this.activeSessionId = sessionId;
    const lifecycleHandlers = this.lifecycleHandlers;
    const protocolLayer = protocolFactory(this.url, {
      ...lifecycleHandlers,
      isActive: () =>
        !this.disposed &&
        this.activeSessionId === sessionId &&
        (lifecycleHandlers?.isActive?.() ?? true),
      isCloseIntentional: () =>
        this.disposed ||
        this.intentionalCloseDepth > 0 ||
        lifecycleHandlers?.isCloseIntentional?.() === true,
      onHeartbeatPong: () => {
        this.lastHeartbeatPongAt = performance.now();
        lifecycleHandlers?.onHeartbeatPong?.();
      },
      onRequestStart: (info) => {
        lifecycleHandlers?.onRequestStart?.(info);
        if (!info.stream) {
          return;
        }
        for (const listener of this.streamRequestStartListeners) {
          listener({ tag: info.tag });
        }
      },
    });
    const rootLayer = this.options?.tracingLayer
      ? Layer.mergeAll(protocolLayer, this.options.tracingLayer)
      : protocolLayer;
    const runtime = ManagedRuntime.make(rootLayer);
    const clientScope = runtime.runSync(Scope.make());
    const rpcClientFactory = this.options?.rpcClientFactory;
    const clientPromise = rpcClientFactory
      ? runtime.runPromise(
          Scope.provide(clientScope)(
            rpcClientFactory().pipe(Effect.mapError(normalizeClientFactoryError)),
          ),
        )
      : runtime
          .runPromise(
            Scope.provide(clientScope)(
              makeWsRpcProtocolClient.pipe(Effect.mapError(normalizeClientFactoryError)),
            ),
          )
          .then((client) => client as unknown as Client);
    return {
      runtime,
      clientScope,
      clientPromise,
    };
  }

  private logWarning(message: string, metadata: { readonly error: string }) {
    const logWarning = this.options?.logWarning;
    if (logWarning) {
      logWarning(message, metadata);
    } else {
      Effect.runSync(Effect.logWarning(message, metadata));
    }
  }

  private runStreamOnSession<TValue>(
    session: TransportSession<Client>,
    connect: (client: Client) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    isActive: () => boolean,
    markValueReceived: () => void,
  ): {
    readonly cancel: () => void;
    readonly completed: Promise<void>;
  } {
    let resolveCompleted!: () => void;
    let rejectCompleted!: (error: unknown) => void;
    const completed = new Promise<void>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });
    const cancel = session.runtime.runCallback(
      Effect.promise(() => session.clientPromise).pipe(
        Effect.flatMap((client) =>
          Stream.runForEach(connect(client), (value) =>
            Effect.sync(() => {
              if (!isActive()) {
                return;
              }

              markValueReceived();
              try {
                listener(value);
              } catch {
                // Keep the stream lifecycle independent from UI listener errors.
              }
            }),
          ),
        ),
      ),
      {
        onExit: (exit) => {
          if (Exit.isSuccess(exit)) {
            resolveCompleted();
            return;
          }

          rejectCompleted(Cause.squash(exit.cause));
        },
      },
    );

    return {
      cancel,
      completed,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return Effect.runPromise(Effect.sleep(Duration.millis(ms)));
}
