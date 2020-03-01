import Measure, { ContentRect, MeasuredComponentProps } from 'react-measure';
import * as React from 'react';
import {useState} from 'react';
import {PromiseState} from "./hooks";
import {memo} from "react";

type SizeMeasurerProps = {
    children: (arg: { height: number; width: number }) => React.ReactNode;
    disableHeight?: boolean;
    disableWidth?: boolean;
    onResize?: (arg: { height: number; width: number }) => void;
    className?: string | undefined;
};

type SizeMeasurerState = {
    height: number;
    width: number;
};

export const SizeMeasurer = memo(({ children, disableWidth, disableHeight, onResize }: SizeMeasurerProps) => {
    const [state, setState] = useState<SizeMeasurerState>({
        width: 10,
        height: 10
    });

    const { width, height } = state;

    let divStyle: React.CSSProperties = {};

    if (!disableWidth) {
        divStyle.width = '100%';
    }
    if (!disableHeight) {
        divStyle.height = '100%';
    }
    

    return (
        <Measure
            bounds
            onResize={(contentRect: ContentRect) => {
                if (contentRect.bounds) {
                    const { width, height } = contentRect.bounds;
                    setState({ width, height });
                    if (onResize) {
                        onResize({ width, height });
                    }
                }
            }}>
            {({ measureRef }: MeasuredComponentProps) => (
                <div ref={measureRef} style={divStyle}>
                    {children({ height, width })}
                </div>
            )}
        </Measure>
    );
});

export function renderPromiseState<R>(
    state: PromiseState<R>,
    children: (result: R) => React.ReactElement | null,
    errorFn?: (error: string) => React.ReactElement | null
): React.ReactElement | null {
    if (state.done) {
        if (state.success) {
            return children(state.result);
        } else {
            let msg;
            if (state.error instanceof Error) {
                console.warn(state.error);
                msg = state.error.message;
            } else {
                msg = state.error && state.error.toString();
            }
            return errorFn ? errorFn(msg) :   <ErrorMessage message={msg}/>;
        }
    } else {
        return <Spinner />;
    }
}

export const ErrorMessage = memo((props: {message: string}) => {
    return <div className="error">${props.message}</div>
})

export const Spinner = memo(() => {
    return <div className="lds-ellipsis">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
    </div>
})

/*
export function VisualPromiseContainer<R>(props: {
  promise: Promise<R>,
  children: (result: R) => React.ReactElement | null
}): React.ReactElement | null {
    const promiseState = usePromise(props.promise);
    return renderObservableState(promiseState, props.children);
}
 */