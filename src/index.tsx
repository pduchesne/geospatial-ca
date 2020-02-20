import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View } from 'ol';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Tabs, Tab} from 'react-bootstrap';
import 'ol/ol.css';
import 'ol-ca.css';
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
import {
    TerrainCellStatus,
    TerrainCell,
    CellularAutomataSource2,
    ProjectDescriptor,
    createEnvironment
} from 'ca/spatial';

import { SizeMeasurer } from 'utils/ui';

import * as lib from 'lib';
import {CodeEditor} from "./code-editor";
import Layer from "ol/layer/Layer";
import {Extent} from "ol/extent";
import {Size} from "ol/size";

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

    const [code, setCode] = useState<string>("// return an instance of ProjectDescriptor \n\nreturn null;");
    const [projectDescriptor, setProjectDescriptor] = useState<ProjectDescriptor>();

    const [pendingIterations, setPendingIterations] = useState<number>(0);

    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );
    }, []);

    const caImageSource = useMemo( () => {

            if (projectDescriptor) {
                const envConstructor = (images: ImageData[], size: Size | undefined, extent: Extent) => {

                    const [stateLattice, baseLattice] = projectDescriptor.init(images, size!);

                    return createEnvironment(
                        extent,
                        stateLattice,
                        baseLattice,
                        projectDescriptor.stepFn,
                        projectDescriptor.renderFn,
                    );
                }

                const source = new CellularAutomataSource2(
                    {},
                    envConstructor);

                source.on("change", (evt) => {
                    setCaState({
                        iterationTime: source.getEnv()?.lastIterationTime,
                        renderingtime: source.renderingTime
                    });
                })

                return source;
            } else {
                return undefined;
            }
        } ,
        [projectDescriptor] );


    const imageSources = useMemo<Layer[]>( () => {
        if (!projectDescriptor) return [];

        return projectDescriptor.layers.map( (layerDescriptor) => {
            // assume the layer URL is of the form <service_URL>#<layer_name>
            const [url, layerName] = layerDescriptor.split('#');
            return new layer.Tile({source: new TileWMS({
                    crossOrigin: 'Anonymous',
                    url,
                    params: {'LAYERS': layerName, 'TILED': true}
                }) } )
        })
        },
        [projectDescriptor] );

    const selectedFeatures = useMemo( () => {
            return new VectorSource();
        },
        [] );

    const imagesContainer = useMemo( () => {

        const container = new RenderedImagesContainer({
            sources: imageSources,

        });
        return container;
    } ,
    [imageSources] );

    const stepAutomata = (n: number) => {
        setPendingIterations(n);
    }

    const selectExample = (name:string) => {
        fetch("examples/"+name+".js").then(
            (value) => {
                value.text().then(setCode);
            }
        )
    }

    const olmap = useMemo( () => {

        if (mapDiv.current)
            while (mapDiv.current.firstChild) {
                mapDiv.current.removeChild(mapDiv.current.firstChild);
            }

            const map = new Map({
                controls: [new MousePosition()],
                target: mapDiv.current || undefined,
                layers: [
                    new layer.Tile({source: new OSM()}),
                    ...imageSources,
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
        if (caImageSource && pendingIterations > 0) {
            caImageSource.stepAutomata(1);
            selectedCell && setSelectedCell(caImageSource.getEnv()?.getCellAtPixel(selectedCell.xy));
            setPendingIterations(pendingIterations-1);
        }
    }, [pendingIterations])


    const evalCode = (code:string) => {
        const scope = {lib};
        const result: ProjectDescriptor = (new Function(...Object.keys(scope), code))(...Object.values(scope));

        setProjectDescriptor(result);
    };

    return <div>
        <div style={{display: "flex"}}>
            <div style={{flex: 2}}>
                <div style={{height: '400px'}} ref={mapDiv}/>
                <ReactControl map={olmap}>
                    <LayerList map={olmap}/>
                </ReactControl>
            </div>
            <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>

            <select onChange={(evt) => selectExample(evt.currentTarget.value)}>
                <option>blank</option>
                <option>waterflow1</option>
            </select>
            <Tabs defaultActiveKey="controls" id="menu">
                <Tab eventKey="controls" title="Controls">
                    <div>
                        <button onMouseUp={() => caImageSource && caImageSource.setInputImages(imagesContainer.getImages(), olmap.getSize(), olmap.getView().calculateExtent())}>SNAPSHOT</button>>
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
                </Tab>
                <Tab eventKey="code" title="Code">
                    <div onClick={() => evalCode(code)}>EVAL</div>
                    <SizeMeasurer>
                        {(props: {height: number, width: number} ) => (
                            <CodeEditor code={code} height={props.height-80} onCodeChange={(code, event) => {
                                setCode(code);
                            }}/>
                        )} 

                    </SizeMeasurer>
                </Tab>
            </Tabs>
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
