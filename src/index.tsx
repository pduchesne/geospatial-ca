import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View } from 'ol';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Tabs, Tab} from 'react-bootstrap';
import 'ol/ol.css';
import 'ol-ca.scss';
import { useState, useRef, useMemo, useEffect } from 'react';
import OSM from 'ol/source/OSM';
import * as raster from 'ol/source/Raster';
//import ImageStatic from 'ol/source/ImageStatic';
import * as layer from 'ol/layer';
import { ViewOptions } from 'ol/View';
import { TileWMS } from 'ol/source';
import {ReactControl, LayerList} from "./ol-helpers";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import MousePosition from "ol/control/MousePosition";
import {
    TerrainCellStatus,
    TerrainCell,
    CellularAutomataSource,
    ProjectDescriptor,
    SpatialEnvironmentConstructor, SpatialEnvironment
} from 'ca/spatial';

import { SizeMeasurer } from 'utils/ui';

import * as lib from 'lib';
import {CodeEditor} from "./code-editor";
import Layer from "ol/layer/Layer";
import {Options as TileOptions} from "ol/layer/Tile";
import {Options as ImageOptions} from "ol/layer/Image";

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

/**
 * Main map component for the application
 * @constructor
 */
export const MyMap = () => {

    // div container that will hold the OL map
    const mapDiv = useRef<HTMLDivElement>(null);

    // state variable for the OL map view options
    const [viewOptions, setViewOptions] = useState<ViewOptions>();

    // state variable for the selected CA cell on the map
    const [selectedCell, setSelectedCell] = useState<{xy: [number, number], geom: Polygon, cell: [TerrainCellStatus, TerrainCell]}>();

    // state variable for the CA rendering state
    const [caState, setCaState] = useState<{iterationTime?: number, renderingtime?: number}>();

    // state variable for the name of the currently loaded script
    const [scriptName, setScriptName] = useState<string>();
    // state variable for the CA script
    const [code, setCode] = useState<string>("// return an instance of ProjectDescriptor \n\nreturn null;");
    // state variable for the project descriptor that results from the CA script code evaluation
    const [projectDescriptor, setProjectDescriptor] = useState<ProjectDescriptor>();

    const [pendingIterations, setPendingIterations] = useState<number>(0);


    // memoized OL ImageSource that encapsulates the CA
    // recreated whenever the project descriptor changes
    const caImageSource = useMemo( () => {
            if (projectDescriptor) {

                // define the constructor that will init the CA SpatialEnvironment from images and extent
                const envConstructor:SpatialEnvironmentConstructor =
                    (images, size, extent) => {
                    const [stateLattice, baseLattice] = projectDescriptor.init(images, size!);

                    return new SpatialEnvironment(
                        stateLattice,
                        baseLattice,
                        {step: projectDescriptor.stepFn},
                        extent,
                        projectDescriptor.renderFn
                    );
                }

                const source = new CellularAutomataSource(
                    {},
                    envConstructor);

                // on change, update the component state with the new CA rendering state
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
        },
        [projectDescriptor]
    );

    // Memoized array of OL layers producing the CA image data
    // recreated whenever the project descriptor changes
    const imageSources = useMemo<Layer[]>( () => {
        if (!projectDescriptor) return [];

        return projectDescriptor.layers.map( (layerDescriptor) => {
            // assume the layer URL is of the form <service_URL>#<layer_name>
            const [url, layerName] = layerDescriptor.split('#');
            return new layer.Tile({
                source: new TileWMS({
                    crossOrigin: 'Anonymous',
                    url,
                    params: {'LAYERS': layerName, 'TILED': true}
                }),
                title: 'Source '+layerName
            } as TileOptions )
        })
        },
        [projectDescriptor] );

    // Memoized vector source that contains the CA selected cells
    // created only once for the lifetime of the component
    const selectedFeatures = useMemo( () => {
            return new VectorSource();
        },
        [] );

    // Memoized RasterSource that will produce images for the imageSources
    // recreated whener imageSources change; undefined if no imageSources
    const imagesContainer = useMemo( () => {
        const container = imageSources.length > 0 ?
            new RenderedImagesContainer({ sources: imageSources }) :
            undefined;

        return container;
    } ,
    [imageSources] );

    const stepAutomata = (n: number) => {
        setPendingIterations(n);
    }

    /**
     * Select an example script and sets its content in the script editor
     * @param name script file name
     */
    const selectExample = (name?:string) => {
        if (name) {
            fetch("examples/" + name + ".js").then(
                (value) => {
                    value.text().then(code => {
                        setCode(code);
                        evalCode(code);
                    });
                }
            )
        } else {
            const defaultCode = "// return an instance of ProjectDescriptor \n\nreturn null;";
            setCode(defaultCode);
            evalCode(defaultCode);
        }
    }

    // Memoized OL Map
    // Recreated whener mapDiv, viewOptions or imagesContainer changes
    const olmap = useMemo( () => {

        if (mapDiv.current)
            // first empty the content of mapDiv
            while (mapDiv.current.firstChild) {
                mapDiv.current.removeChild(mapDiv.current.firstChild);
            }

        const layers = [
            // basemap
            new layer.Tile({
                source: new OSM(),
                // 'title' is not advertised in the OL types, so we have to cast the options object as a custom type
                title: 'Basemap'
            } as TileOptions),
            // display the CA image sources
            ...imageSources
        ];

        if (imagesContainer)  {
            layers.push(
                // the rasterImage container
                // it is only meant to render image sources into images made available to the CA
                // its content will not be displayed
                new layer.Image({
                    source: imagesContainer,
                    opacity: 0
                })
            );
        }

        if (caImageSource) layers.push(
            // result of the CA
            new layer.Image({
                source: caImageSource,
                title: 'CA state'
            } as ImageOptions),
            // selected CA cells
            new layer.Vector({
                source: selectedFeatures
            })
        );

        const map = new Map({
            controls: [new MousePosition({coordinateFormat: p => p ? p.map(coord => coord.toFixed(2)).join(',') : '' })],
            target: mapDiv.current || undefined,
            layers,
            view: new View(viewOptions)
        });

        // On click on the map, set the state selectedCell to the clicked cell on the map
        map.on('singleclick', function (evt) {
            map.forEachLayerAtPixel(evt.pixel, function(layer) {
                const targetSource = layer.getSource();
                if (caImageSource == targetSource) {
                    // the CA layer has been clicked
                    const xy1 = evt.coordinate;
                    const cellFeature = caImageSource.getEnv()?.getCellAtSpatial(xy1);
                    setSelectedCell(cellFeature);
                }
            });
        });

        return map;
    },
    [mapDiv.current, viewOptions, imagesContainer] );

    // whenever the selectedCell changes, set it as the current feature in the selectedFeatures vector layer
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

    // once after the first rendering, initialize the map view options
    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );

        const hashParams = new URLSearchParams(window.location.hash && window.location.hash.substring(1))
        setScriptName(hashParams.get('script') || 'conway');
    }, []);

    useEffect( () => {
        selectExample(scriptName);
    }, [scriptName]);

    /**
     * Evaluate a project descriptor script and set it as the current projectDescriptor
     * @param code
     */
    const evalCode = (code:string) => {
        const scope = {lib};
        const result: ProjectDescriptor = (new Function(...Object.keys(scope), code))(...Object.values(scope));

        setProjectDescriptor(result);
    };

    return <div className='mainApp'>
            <div className='mapPanel'>
                <SizeMeasurer>
                    {(props: {height: number, width: number} ) => (
                        <>
                        <div style={{height: props.height+'px'}} ref={mapDiv}/>
                        <ReactControl map={olmap}>
                            <LayerList map={olmap}/>
                        </ReactControl>
                        </>
                    )}

                </SizeMeasurer>
            </div>
            <div className='controlsPanel'>
                <div>
                    Select example
                    <select value={scriptName} onChange={(evt) => setScriptName(evt.currentTarget.value)}>
                        <option value="">blank</option>
                        <option>conway</option>
                        <option>waterflow1</option>
                    </select>
                </div>
                <div>
                    <Tabs defaultActiveKey="controls" id="menu">
                        <Tab eventKey="controls" title="Controls">
                            <div>
                                <button onClick={() => caImageSource && caImageSource.setInputImages(
                                    imagesContainer ? imagesContainer.getImages(): [],
                                    olmap.getSize(),
                                    olmap.getView().calculateExtent())}>SNAPSHOT</button>>
                                <button onClick={() => stepAutomata(1)}>STEP</button>>
                                <button onClick={() => stepAutomata(3)}>STEP50</button>>
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
