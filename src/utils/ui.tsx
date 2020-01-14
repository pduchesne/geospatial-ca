import Measure, { ContentRect, MeasuredComponentProps } from 'react-measure';
import * as React from 'react';
import { useState } from 'react';

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

export const SizeMeasurer = ({ children, disableWidth, disableHeight, onResize }: SizeMeasurerProps) => {
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
};