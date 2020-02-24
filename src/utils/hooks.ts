import {useEffect, useRef, useState} from "react";
import {CancellablePromise} from "./net";

export type PromiseState<R> = { done: false } | { done: true } & ({ success: true; result: R } | { success: false; error: any });

export function usePromise<R>(promise: Promise<R>): PromiseState<R> {
    let [state, setState] = useState<PromiseState<R>>({ done: false });

    const [prevPromise, setPrevObs] = useState<Promise<R>>(promise);

    if (prevPromise !== promise) {
        state = { done: false };
        setState(state);
        setPrevObs(promise);
    }

    useEffect( () => {
        promise.then(r => {
            setState({ done: true, success: true, result: r })
        }, reason => {
            setState({ done: true, success: false, error: reason });
        });

        if (promise instanceof CancellablePromise) {
            return () => promise.cancel();
        } else {
            return undefined;
        }
    }, [promise])

    return state;
}


export function shallowEqual(objA: any, objB: any) {
    if (Object.is(objA, objB)) {
        return true;
    }

    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
        return false;
    }

    var keysA = Object.keys(objA);
    var keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) {
        return false;
    }

    // Test for A's keys different from B.
    for (var i = 0; i < keysA.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(objB, keysA[i]) || !Object.is(objA[keysA[i]], objB[keysA[i]])) {
            return false;
        }
    }

    return true;
}

export function useShallowProps<P>(props: P): P {
    const ref = useRef<P>(props);
    if (!shallowEqual(props, ref.current)) {
        ref.current = props;
    }
    return ref.current;
}

export function useRefMemo<R>(createFn: () => R, deps: any[]): R {
    const ref = useRef<any[]>();
    const memoizedValue = useRef<R>();
    // if ref.current == undefined, memoizedValue has not been initialized yet
    if (ref.current == undefined || !shallowEqual(deps, ref.current)) {
        ref.current = deps;
        memoizedValue.current = createFn();
    }

    return memoizedValue.current as R;
}

export function usePromiseFn<P, R>(createFn: () => Promise<R>, deps: any[]): PromiseState<R> {
    const promise$: Promise<R> = useRefMemo(() => createFn(), deps);
    return usePromise<R>(promise$);
}