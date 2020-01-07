import * as control from "ol/control/Control";
import {Map} from "ol";
import * as React from "react";
import {useRef} from "react";
import {useEffect} from "react";
import {useState} from "react";
import BaseLayer from "ol/layer/Base";

export class ReactControlWrapper extends control.default {
    constructor(containerElement: HTMLElement) {
        super({element: containerElement});
    }
}

export const ReactControl = (props: {map: Map, children: React.ReactNode}) => {
    const {map, children} = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const controlWrapper = useRef<ReactControlWrapper | null>(null);

    useEffect(() => {
        if (controlWrapper.current && controlWrapper.current.getMap())
            controlWrapper.current.getMap().removeControl(controlWrapper.current);

        if (containerRef.current) {
            controlWrapper.current = new ReactControlWrapper(containerRef.current);
            map.addControl(controlWrapper.current);
        } else {
            controlWrapper.current = null;
        }
    }, [containerRef.current])

    if (map) {
        return <div ref={containerRef} className="ol-control">{children}</div>
    } else {
        return null;
    }
}

export const LayerList = (props: {map: Map}) => {

    const {map} = props;

    const [layers, setLayers] = useState<BaseLayer[]>([]);

    useEffect( () => {
        if (map) {
            map.on("change", evt => {
                setLayers((evt.target as Map).getLayers().getArray())
            });
            setLayers(map.getLayers().getArray());
        }
    }, [map]);

    return <div style={{margin: '5px'}}>
        {layers.map(layer => <LayerListItem layer={layer}/>)}
    </div>

}

export const LayerListItem = (props: {layer: BaseLayer}) => {
    const {layer} = props;

    const [visible, setVisible] = useState(layer.getVisible());
    useEffect( () => {
        if (layer) {
            layer.on("change:visible", evt => {
                setVisible(layer.getVisible());
            });
        }
    }, [layer]);

    return <div>{layer.get('title') || '<no title>'} <span onClick={() => layer.setVisible(!visible)}>{visible?'ON':'OFF'}</span></div>
}