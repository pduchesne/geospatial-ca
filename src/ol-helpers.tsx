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
    }, [containerRef.current, map])

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

    return <div className='ol-layer-list'>
        {  layers
            .filter(l => l.get('title') != undefined)
            .map( (layer, idx) => <LayerListItem layer={layer} key={idx}/>)
        }
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

    return <div className='ol-layer-list-item'>
        <span className='layer-title'>{layer.get('title') || '<no title>'}</span>
        <span className='layer-visibility'>
            <input type="checkbox" checked={visible} onChange={ (e) => layer.setVisible(e.target.checked) } />
        </span>
    </div>
}

