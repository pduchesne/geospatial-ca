import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View } from 'ol';
import 'ol/ol.css';
import { useState, useRef, useMemo, useEffect } from 'react';
import {
    TranslateAutomata,
    ImageDataLattice,
    Environment } from 'ca/model';
import OSM from 'ol/source/OSM';
import * as raster from 'ol/source/Raster';
//import ImageStatic from 'ol/source/ImageStatic';
import * as layer from 'ol/layer';
import * as extent from 'ol/extent';
import { ViewOptions } from 'ol/View';
import { TileWMS } from 'ol/source';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import {ReactControl, LayerList} from "./ol-helpers";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import MousePosition from "ol/control/MousePosition";
import { TerrainCellStatus, TerrainCell, CellularAutomataSource2 } from 'ca/spatial';
import { TerrainEnvironment } from 'ca/waterflow';
//import Event from 'ol/events/Event';
//import EventType from 'ol/events/EventType';

import { editor } from "monaco-editor";
import MonacoEditor from "react-monaco-editor";

export const App = () => (
    <BrowserRouter>
        <div>
            <Route
                exact
                path="/"
                render={props => {
                    return <MyMap />
                }
                }
            />
        </div>
    </BrowserRouter>
)


export class RenderedImagesContainer extends raster.default {
    private images: ImageData[];
    private output: ImageData;

    constructor(options: raster.Options) {
        super({
            ...options,
            operationType: "image",
            threads: 0, // necessary to prevent workers, until a solution is found to propagate this lib to workers
            operation: (data: ImageData[], globalObj) => {
                this.images = data as ImageData[];
                this.output = new ImageData(this.images[0].width, this.images[0].height);
                return this.output;
            },
        })
    }

    getImages() {
        return this.images;
    }
}


export function CodeEditor(props: {code: string, onCodeChange?: (code: string) => void}) {
    /*
    const [editor, setEditor] = useState<editor.IStandaloneCodeEditor>();

    const onEditorMount = useMemo(
        () => 
            (editor: editor.IStandaloneCodeEditor) => {
                setEditor(editor);
            }, 
        []);
        */
        
    const options = useMemo<editor.IEditorConstructionOptions>(() => ( {
        selectOnLineNumbers: true,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: "line",
        automaticLayout: false
      } ), [])

    return <MonacoEditor
    language="javascript"
    value={props.code}
    options={options}
    onChange={props.onCodeChange}
    //editorDidMount={onEditorMount}
  />
}

export class CellularAutomataSource extends ImageCanvasSource {

    private caEnv: Environment<ImageDataLattice, ImageDataLattice> | undefined;
    private extent: extent.Extent;

    constructor() {
        super({
            projection: 'EPSG:4326',
            ratio: 1,
            canvasFunction: (extent, res, pixelRatio, size, proj) => {
                const canvas: HTMLCanvasElement = document.createElement('canvas');
                canvas.setAttribute('width', size[0]+'px');
                canvas.setAttribute('height', size[1]+'px');

                const caEnv = this.getEnv();
                if (caEnv && this.extent) {
                    this.extent; // TODO make sure original extent matches requested extent
                    //extent[0] = this.extent[0];
                    //extent[1] = this.extent[1];
                    //extent[2] = this.extent[2];
                    //extent[3] = this.extent[3];

                    canvas.getContext('2d')!.putImageData(caEnv.getState().getData(), 0, 0);
                }
                return canvas;
            }
        });
    }

    setInputImages(images: ImageData[] | undefined, extent: extent.Extent) {
        if (images && images.length > 0) {
            this.extent = extent;
            const lattice = new ImageDataLattice(images[0]);
            this.caEnv = new Environment<ImageDataLattice, ImageDataLattice>(
                lattice,
                new ImageDataLattice(new ImageData(lattice.getWidth(), lattice.getHeight())),
                new TranslateAutomata(10) );
        } else {
            this.caEnv = undefined;
        }
    }

    getEnv() {
        return this.caEnv;
    }

}

export const MyMap = () => {
    const [viewOptions, setViewOptions] = useState<ViewOptions>();

    const mapDiv = useRef<HTMLDivElement>(null);
    const [selectedCell, setSelectedCell] = useState<{xy: [number, number], geom: Polygon, cell: [TerrainCellStatus, TerrainCell]}>();
    const [caState, setCaState] = useState<{iterationTime?: number, renderingtime?: number}>();

    const [pendingIterations, setPendingIterations] = useState<number>(0);

    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );
    }, []);

    const caImageSource = useMemo( () => {

            //return new ImageImageData({ projection: 'EPSG:4326', imageExtent: [-180,-90,180,90] });

            const source = new CellularAutomataSource2(
                {},
                (images, extent) => new TerrainEnvironment(images[0], extent));
            source.on("change", (evt) => {
                setCaState({
                    iterationTime: source.getEnv()?.lastIterationTime,
                    renderingtime: source.renderingTime
                });
            })

        return source;

        } ,
        [] );


    const imageSource = useMemo( () => {
            //return new layer.Tile({source: new OSM()});
            return  new layer.Tile({source: new TileWMS({
                    crossOrigin: 'Anonymous',
                    url: 'https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer',
                    params: {'LAYERS': '0', 'TILED': true}
                }) } );

        },
        [] );

    const selectedFeatures = useMemo( () => {
            return new VectorSource();
        },
        [] );

    const imagesContainer = useMemo( () => {
            const container = new RenderedImagesContainer({
                sources: [imageSource]
            });
            return container;
        } ,
        [] );

    const stepAutomata = (n: number) => {
        setPendingIterations(n);
    }

    const olmap = useMemo( () => {

            const map = new Map({
                controls: [new MousePosition()],
                target: mapDiv.current || undefined,
                layers: [
                    new layer.Tile({source: new OSM()}),
                    imageSource,
                    new layer.Image({
                        source: imagesContainer,
                        opacity: 0.5
                    }),
                    new layer.Image({
                        source: caImageSource
                    }),
                    new layer.Vector({
                        source: selectedFeatures
                    })
                ],
                view: new View(viewOptions)
            });

            map.on('singleclick', function (evt) {
                map.forEachLayerAtPixel(evt.pixel, function(layer) {
                    const targetSource = layer.getSource();
                    if (caImageSource == targetSource) {
                        const xy1 = evt.coordinate;
                        const cellFeature = caImageSource.getEnv()?.getCellAtSpatial(xy1);
                        setSelectedCell(cellFeature);
                    }
                });
            });

            return map;
        },
        [mapDiv.current, viewOptions, imagesContainer] );

    useEffect( () => {
        selectedFeatures.clear();
        selectedFeatures.addFeature(new Feature(selectedCell?.geom));
        selectedFeatures.changed();
    }, [selectedFeatures, selectedCell?.geom])


    useEffect( () => {
        if (pendingIterations > 0) {
            caImageSource.stepAutomata(1);
            selectedCell && setSelectedCell(caImageSource.getEnv()?.getCellAtPixel(selectedCell.xy));
            setPendingIterations(pendingIterations-1);
        }
    }, [pendingIterations])

    olmap.getLayers()//.item(0).

    return <div>
        <div style={{display: "flex"}}>
            <div style={{flex: 2}}>
                <div style={{height: '400px'}} ref={mapDiv}/>
                <ReactControl map={olmap}>
                    <LayerList map={olmap}/>
                </ReactControl>
            </div>
            <div style={{flex: 1}}>
                <div>
                    <button onMouseUp={() => caImageSource.setInputImages(imagesContainer.getImages(), olmap.getView().calculateExtent())}>SNAPSHOT</button>>
                    <button onMouseUp={() => stepAutomata(1)}>STEP</button>>
                    <button onMouseUp={() => stepAutomata(3)}>STEP50</button>>
                </div>
                <div>
                    Perf CA {caState?.iterationTime} ; Perf Render {caState?.renderingtime}
                </div>

                {selectedCell && (
                    <>
                    <table>
                        <tr><td>Alt</td><td>{selectedCell.cell[1].altitude}</td></tr>
                        <tr><td>Water</td><td>{selectedCell.cell[0][1]}</td></tr>
                        <tr><td>Dir</td><td>{selectedCell.cell[0][2].join(',')}</td></tr>
                    </table>
                        <MatrixDisplay matrix={selectedCell.cell[0][3]}/>
                    </>
                )}

                    <CodeEditor code="// some test code"/>
            </div>
        </div>

    </div>
}

export const MatrixDisplay = (props: {matrix?: number[][]}) => {
    const {matrix} = props;
    return matrix ?
        <table>
            {matrix.map(row => <tr>{row.map(cell => <td>{cell.toFixed(2)}</td>)}</tr>)}
        </table> : null;
}

ReactDOM.render(<App />, document.getElementById('index'));
