import * as control from "ol/control/Control";
import {Map} from "ol";
import * as React from "react";
import {memo, useRef} from "react";
import {useEffect} from "react";
import {useState} from "react";
import BaseLayer from "ol/layer/Base";
import LayerGroup from "ol/layer/Group";
import {ObjectEvent} from "ol/Object";

export const MapContainer = memo((props: {map: Map, width?: number, height?: number}) => {
    // div container that will hold the OL map
    const mapDiv = useRef<HTMLDivElement>(null);

    useEffect( () => {
        if (mapDiv.current)
            // first empty the content of mapDiv
            while (mapDiv.current.firstChild) {
                mapDiv.current.removeChild(mapDiv.current.firstChild);
            }

        props.map.setTarget(mapDiv.current || undefined);
    }, [props.map, mapDiv.current]);

    useEffect( () => {
        const currentZoom = props.map.getView().getZoom();
        props.map.updateSize();
        currentZoom && props.map.getView().setZoom(currentZoom);
    }, [props.width, props.height]);

    return <div style={{height: props.height && props.height+'px'}} ref={mapDiv}/>
})


export class ReactControlWrapper extends control.default {
    constructor(containerElement: HTMLElement) {
        super({element: containerElement});
    }
}

export const ReactControl = memo((props: {map: Map, children: React.ReactNode}) => {
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
})

export const LayerList = memo((props: {layersParent: Map | LayerGroup}) => {

    const {layersParent} = props;

    const [layers, setLayers] = useState<BaseLayer[]>([]);

    useEffect( () => {
        if (layersParent) {
            const listener = (evt:ObjectEvent) => { setLayers((evt.target as Map).getLayers().getArray()) }
            layersParent.on("change", listener);
            setLayers(layersParent.getLayers().getArray());

            return () => layersParent.un("change", listener);
        } else {
            return undefined;
        }

    }, [layersParent]);

    return <div className='ol-layer-list'>
        {  layers
            .filter(l => l.get('title') != undefined)
            .map( (layer, idx) => <LayerListItem layer={layer} key={idx}/>)
        }
    </div>

})

export const LayerListItem = memo((props: {layer: BaseLayer}) => {
    const {layer} = props;

    const [visible, setVisible] = useState(layer.getVisible());
    const [collapsed, setCollapsed] = useState(true);

    useEffect( () => {
        if (layer) {
            setVisible(layer.getVisible());
            const listener = (evt: ObjectEvent) => {
                setVisible(layer.getVisible());
            }
            layer.on("change:visible", listener);

            return () => {
                layer.un("change:visible", listener)
            }
        } else {
            return undefined;
        }
    }, [layer]);

    return <div className='ol-layer-list-item'>
        <div style={{marginLeft: 12}}>
            {layer instanceof LayerGroup ?
                <i style={{float: "left", marginLeft: -12, fontSize: 10, marginTop: 3}}
                   className={"fas fa-folder-"+(collapsed?'plus':'minus')}
                   onClick={() => setCollapsed(!collapsed)}/> :
                null}
            <span className='layer-title'>{layer.get('title') || '<no title>'}</span>
            <span className='layer-visibility'>
                <input type="checkbox" checked={visible} onChange={ (e) =>
                    layer.setVisible(e.target.checked)
                } />
            </span>
            </div>
            {layer instanceof LayerGroup && !collapsed ?
                <div style={{marginLeft: 5}}> <LayerList layersParent={layer}/>  </div> :
                null}

        </div>
})


