import assert from "node:assert/strict";
import { test } from "node:test";

import { createDismissController } from "./dismiss-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

test("dismiss locks before the pending callback and ignores duplicate calls synchronously", async () => {
  const requestResult = deferred<{ ok: boolean }>();
  let requestCalls = 0;
  let callbackDuplicate: Promise<void> | null | undefined;

  const controller = createDismissController({
    request: () => {
      requestCalls += 1;
      return requestResult.promise;
    },
    onStateChange: (state) => {
      if (state.status === "pending" && !state.retry) {
        callbackDuplicate = controller.dismiss();
        assert.strictEqual(callbackDuplicate, null);
      }
    },
  });

  const completion = controller.dismiss();

  assert.ok(completion instanceof Promise);
  assert.strictEqual(controller.dismiss(), null);
  assert.equal(requestCalls, 1);
  assert.strictEqual(callbackDuplicate, null);

  requestResult.resolve({ ok: true });
  await completion;
});

test("a non-OK response exposes one retry and retry-pending keeps the lock", async () => {
  const retryResult = deferred<{ ok: boolean }>();
  const states: Array<{ status: string; retry?: boolean }> = [];
  let requestCalls = 0;
  const controller = createDismissController({
    request: () => {
      requestCalls += 1;
      return requestCalls === 1 ? Promise.resolve({ ok: false }) : retryResult.promise;
    },
    onStateChange: (state) => {
      states.push(state);
    },
  });

  await controller.dismiss();

  assert.deepEqual(states, [
    { status: "pending", retry: false },
    { status: "failure", retry: true },
  ]);

  const retryCompletion = controller.retry();

  assert.ok(retryCompletion instanceof Promise);
  assert.strictEqual(controller.retry(), null);
  assert.strictEqual(controller.dismiss(), null);
  assert.deepEqual(states.at(-1), { status: "pending", retry: true });

  retryResult.resolve({ ok: true });
  await retryCompletion;
  assert.deepEqual(states.at(-1), { status: "success" });
});

test("a thrown request permits one later retry, but a failed retry does not reopen it", async () => {
  let requestCalls = 0;
  const states: Array<{ status: string; retry?: boolean }> = [];
  const controller = createDismissController({
    request: async () => {
      requestCalls += 1;
      if (requestCalls === 1) {
        throw new Error("network unavailable");
      }

      return { ok: false };
    },
    onStateChange: (state) => {
      states.push(state);
    },
  });

  await controller.dismiss();
  assert.deepEqual(states.at(-1), { status: "failure", retry: true });

  await controller.retry();
  assert.deepEqual(states.at(-1), { status: "failure" });
  assert.strictEqual(controller.retry(), null);
  assert.equal(requestCalls, 2);
});
