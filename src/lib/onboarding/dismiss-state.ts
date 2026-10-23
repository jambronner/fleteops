export type DismissRequestState =
  | { status: "idle" }
  | { status: "pending"; retry: boolean }
  | { status: "failure"; retry?: true }
  | { status: "success" };

type DismissResponse = { ok: boolean };
type DismissRequest = () => DismissResponse | PromiseLike<DismissResponse>;

export type DismissController = {
  dismiss: () => Promise<void> | null;
  retry: () => Promise<void> | null;
};

export function createDismissController({
  request,
  onStateChange,
}: {
  request: DismissRequest;
  onStateChange: (state: DismissRequestState) => void;
}): DismissController {
  let inFlight = false;
  let retryAvailable = false;
  let state: DismissRequestState = { status: "idle" };

  function publish(nextState: DismissRequestState) {
    state = nextState;
    onStateChange(nextState);
  }

  async function execute(isRetry: boolean): Promise<void> {
    try {
      const response = await request();

      if (!response.ok) {
        throw new Error("Dismiss request was not successful.");
      }

      publish({ status: "success" });
    } catch {
      if (!isRetry) {
        retryAvailable = true;
        publish({ status: "failure", retry: true });
      } else {
        publish({ status: "failure" });
      }
    } finally {
      inFlight = false;
    }
  }

  function start(isRetry: boolean): Promise<void> {
    inFlight = true;

    try {
      publish({ status: "pending", retry: isRetry });
    } catch (error) {
      inFlight = false;
      return Promise.reject(error);
    }

    return execute(isRetry);
  }

  return {
    dismiss() {
      if (inFlight || state.status !== "idle") {
        return null;
      }

      return start(false);
    },
    retry() {
      if (inFlight || state.status !== "failure" || !retryAvailable) {
        return null;
      }

      retryAvailable = false;
      return start(true);
    },
  };
}
