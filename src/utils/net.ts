export function proxify_url(url: URL, proxy_url?: string): URL {

    if (!proxy_url)
        return url;

    const proxifiedUrl = new URL(proxy_url);

    url.searchParams.forEach((value, key) => proxifiedUrl.searchParams.append(key, value))
    proxifiedUrl.searchParams.append('_uri', url.origin+url.pathname);
    proxifiedUrl.hash = url.hash;

    return proxifiedUrl;
}

export function fetchParseError(input: RequestInfo, init?: RequestInit, cancellable?: boolean): Promise<Response> {
    return (cancellable ? cancelableFetch : fetch) (input, init).then(value => {
        if (value.ok) {
            return value;
        } else {
            throw `HTTP[${value.status}] : ${value.statusText}`
        }
    });
}

export class CancellablePromise<R> implements Promise<R> {

    private controller: AbortController;
    private wrappedPromise: Promise<R>;

    constructor(promise: Promise<R>, controller: AbortController) {
        this.wrappedPromise = promise;
        this.controller = controller;
    }

    readonly [Symbol.toStringTag]: string;

    catch<TResult = never>(onrejected?: ((reason: any) => (PromiseLike<TResult> | TResult)) | undefined | null): Promise<R | TResult> {
        return this.wrappedPromise.catch(onrejected);
    }

    then<TResult1 = R, TResult2 = never>(onfulfilled?: ((value: R) => (PromiseLike<TResult1> | TResult1)) | undefined | null, onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null): Promise<TResult1 | TResult2> {
        return this.wrappedPromise.then<TResult1, TResult2>(onfulfilled, onrejected);
    }

    finally(onfinally?: (() => void) | undefined | null): Promise<R> {
        return this.wrappedPromise.finally(onfinally);
    }

    cancel() {
        this.controller.abort();
    }
}

export function cancelableFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const promise = fetch(input, {...init, signal: controller.signal});

    return new CancellablePromise(promise, controller);
}