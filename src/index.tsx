import * as ReactDOM from 'react-dom';
import * as React from 'react';
import {HashRouter, Route} from 'react-router-dom';
import { Map, View } from 'ol';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Tab} from 'react-bootstrap';
import 'ol/ol.css';
import './ol-ca.scss';
import {useState, useMemo, useEffect, useContext, memo} from 'react';
import OSM from 'ol/source/OSM';
import * as raster from 'ol/source/Raster';
//import ImageStatic from 'ol/source/ImageStatic';
import * as layer from 'ol/layer';
import { ViewOptions } from 'ol/View';
import {ReactControl, LayerList, MapContainer, getResolutionFromScale} from "./spatial/ol-helpers";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import MousePosition from "ol/control/MousePosition";
import {
    TerrainCellStatus,
    TerrainCell,
    CellularAutomataSource,
    ProjectDescriptor,
    SpatialEnvironmentConstructor, SpatialEnvironment, animate
} from 'ca/spatial';

import {ErrorMessage, renderPromiseState, SizeMeasurer} from 'utils/ui';

import * as lib from 'lib';
import {CodeEditor} from "./utils/code-editor";
import Layer from "ol/layer/Layer";
import {Options as TileOptions} from "ol/layer/Tile";
import {Options as ImageOptions} from "ol/layer/Image";
import Nav from "react-bootstrap/Nav";
import '@fortawesome/fontawesome-free/scss/solid.scss';
import '@fortawesome/fontawesome-free/scss/regular.scss';
import '@fortawesome/fontawesome-free/scss/brands.scss';
import '@fortawesome/fontawesome-free/scss/fontawesome.scss';
import {transformExtent} from "ol/proj";
import {CkanClient, PackageDict, PackageSearchRequest, PackageSearchResponse, ResourceDict} from "./utils/ckan";
import WMSCapabilities from "ol/format/WMSCapabilities";
import {cancelableFetch, fetchParseError, proxify_url} from "./utils/net";
import {usePromiseFn} from 'utils/hooks';
import {
    createLayerFromDescriptor,
    descriptorFromString, descriptorFromWMSCapabilities, LayerDescriptor,
    ParsedWMSCapabilities,
    stripOGCParams, WMSCapabilities_Layer
} from "./spatial/utils";
import LayerGroup from "ol/layer/Group";
import {Options as GroupOptions} from "ol/layer/Group";
import BaseLayer from "ol/layer/Base";
import Attribution from "ol/control/Attribution";
import {mapInto} from "./ca/model";
import Markdown from 'markdown-to-jsx';
import {DebounceInput} from "react-debounce-input";


const AppContext = React.createContext<{proxy_url?: string}>({
    proxy_url: undefined
});

export const App = () => (
    <AppContext.Provider value={ {proxy_url: "https://demo.highlatitud.es/proxy" } }>
        <HashRouter>
            <div>
                <Route
                    exact
                    path="/"
                    render={props => <MainPage />}
                />
            </div>
        </HashRouter>
    </AppContext.Provider>
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

enum CodeStatus {
    'OK',
    'DIRTY',
    'ERROR',
}

const CodeEvalButton = memo((props: {status: CodeStatus, evalFn: () => void} & React.HTMLAttributes<HTMLElement>) => {

    const {status, evalFn, ...rest} = props;


    switch (status) {
        case CodeStatus.DIRTY:
            return <i className={"fas fa-play action"} onClick={evalFn} {...rest} style={{...rest.style, color: '#427bff'}}></i>
        case CodeStatus.OK:
            return <i className={"fas fa-check"} {...rest} style={{...rest.style, color: 'green'}}></i>
        case CodeStatus.ERROR:
            return <i className={"fas fa-times"} {...rest} style={{...rest.style, color: 'red'}}></i>
    }
})

/**
 * Main map component for the application
 * @constructor
 */
export const MainPage = memo(() => {

    // state variable for the active tab
    const [activeTab, setActiveTab] = useState<string>('controls');

    // state variable for the OL map view options
    const [viewOptions, setViewOptions] = useState<ViewOptions>();

    // state variable for the selected CA cell on the map
    const [selectedCell, setSelectedCell] = useState<{xy: [number, number], geom: Polygon, cell: [TerrainCellStatus, TerrainCell]}>();

    // state variable for the CA rendering state
    const [caState, setCaState] = useState<{iterationTime?: number, renderingtime?: number, totalSteps: number}>();

    // state variable for the name of the currently loaded script
    const [scriptName, setScriptName] = useState<string>();
    // state variable for the CA script
    const [code, setCode] = useState<string>("");
    // state variable for the code evaluation status. OK : evaluation correct; DIRTY : code has changed ; ERROR : code evaluation caused an error .
    const [codeStatus, setCodeStatus] = useState<CodeStatus>(CodeStatus.OK);
    // state variable for the project descriptor that results from the CA script code evaluation
    const [projectDescriptor, setProjectDescriptor] = useState<ProjectDescriptor<any, any>>();

    // state variable for the number of steps per click
    const [stepNb, setStepNb] = useState<number>(1);
    // state variable for generated GIF
    const [gifDataUrl, setGifDataUrl] = useState<string>();

    const [pendingIterations, setPendingIterations] = useState<number>(0);

    // state variable for execution error
    const [error, setError] = useState<string>();


    // memoized OL ImageSource that encapsulates the CA
    // recreated whenever the project descriptor changes
    const caImageSource = useMemo(
        () => {
            setGifDataUrl(undefined);

            if (projectDescriptor) {

                // define the constructor that will init the CA SpatialEnvironment from images and extent
                const envConstructor:SpatialEnvironmentConstructor =
                    (images, size, extent) => {
                    const [stateLattice, baseLattice] = projectDescriptor.init(images, size!);

                    if (!projectDescriptor.stepFn && !projectDescriptor.stepCellFn)
                        throw "ProjectDescriptor must have a stepFn or stepCellFn";

                    let stepFn;
                    if (projectDescriptor.stepFn)
                        stepFn = projectDescriptor.stepFn;
                    else if (projectDescriptor.stepCellFn) {
                        stepFn = (currentState: typeof stateLattice, base: typeof baseLattice) => {
                            return mapInto(
                                currentState,
                                currentState.newInstance(),
                                (x, y, source) => projectDescriptor.stepCellFn! (source.get(x,y), base.get(x,y), x, y, source, base) )
                        }
                    } else {
                        throw "ProjectDescriptor must have 1! stepFn or stepCellFn";
                    }

                    return new SpatialEnvironment(
                        stateLattice,
                        baseLattice,
                        {step: stepFn},
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
                        renderingtime: source.renderingTime,
                        totalSteps: source.getEnv()?.totalSteps || 0
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

        return projectDescriptor.data_layers.map( (layerDescriptor) => {
            // assume the layer URL is of the form <service_URL>#<layer_name>
            const ld:LayerDescriptor = typeof layerDescriptor == "string" ?
                descriptorFromString(layerDescriptor) :
                {tiled: true /* default value for tiling*/, ...layerDescriptor};
            return createLayerFromDescriptor(ld);
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
    /*
    const selectExample = (name?:string) => {
        if (name) {
            console.log("Fetching "+name);
            fetch("examples/" + name + ".js").then(
                (value) => {
                    value.text().then(code => {
                        console.log("Fetched "+name);
                        setCode(code);
                        evalCode(code);
                    });
                }
            )
        } else {
            console.log("Fetching blank");
            fetch("examples/blank.js").then(
                (value) => {
                    value.text().then(code => {
                        console.log("Fetched blank");
                        setCode(code);
                    });
                }
            )
        }
    }
     */

    // Memoized OL Map
    // Recreated whener mapDiv, viewOptions or imagesContainer changes
    const olmap = useMemo( () => {

        const layers: BaseLayer[] = [
            // basemap
            new layer.Tile({
                source: new OSM(),
                // 'title' is not advertised in the OL types, so we have to cast the options object as a custom type
                title: 'Basemap'
            } as TileOptions),
            // display the CA image sources
            new LayerGroup({
                layers: imageSources,
                title: 'CA Sources'
            } as GroupOptions)
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
            controls: [
                new MousePosition({
                    projection: "EPSG:4326",
                    coordinateFormat: p => p ? p.map(coord => coord.toFixed(2)).join(',') : '' ,
                    className: 'ol-control ol-mouse-position'
                }),
                new Attribution({
                    collapsible: true
                })
            ],
            //target: undefined, // target will be set by the MapContainer element
            layers,
            view: new View(viewOptions)
        });

        if (projectDescriptor?.extent) {
            map.once("precompose", () => {
                // hardcoded transform into Mercator. This assumes the basemap is in Mercator (like OSM)
                // TODO adjust transform on the actual map projection
                const mapExtent = transformExtent(projectDescriptor.extent!, "EPSG:4326", "EPSG:3857");
                map.getView().fit(mapExtent);
            })
        }

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
    [viewOptions, imagesContainer] );

    // whenever the selectedCell changes, set it as the current feature in the selectedFeatures vector layer
    useEffect( () => {
        selectedFeatures.clear();
        selectedFeatures.addFeature(new Feature(selectedCell?.geom));
        selectedFeatures.changed();
    }, [selectedFeatures, selectedCell?.geom])


    useEffect( () => {
        if (caImageSource && pendingIterations > 0) {
            try {
                caImageSource.stepAutomata(1);
                selectedCell && setSelectedCell(caImageSource.getEnv()?.getCellAtPixel(selectedCell.xy));
                setPendingIterations(pendingIterations - 1);
            } catch (err) {
                setPendingIterations(0);
                handleError(err);
            }
        }
    }, [pendingIterations])

    // once after the first rendering, initialize the script and the view options
    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );

        const hashParams = new URLSearchParams(window.location.hash && window.location.hash.substring(1))
        setScriptName(hashParams.get('script') || 'conway');
    }, []);

    usePromiseFn(() =>
        cancelableFetch("examples/" + (scriptName || 'blank') + ".js").then(
            (value) => {
                setProjectDescriptor(undefined);
                value.text().then(code => {
                    setCode(code);
                    scriptName && evalCode(code); // do not evaluate automatically the empty code template
                });
            }
        ).catch(reason => {
            console.log("Failed to load example script : "+reason.toString())
        }
        ),
        [scriptName]);

    useEffect( () => {
        setCodeStatus(CodeStatus.DIRTY);
    }, [code]);

    /**
     * Evaluate a project descriptor script and set it as the current projectDescriptor
     * @param code
     */
    const evalCode = (code:string) => {
        try {
            const scope = {lib};
            const result: ProjectDescriptor = (new Function(...Object.keys(scope), code))(...Object.values(scope));

            setProjectDescriptor(result);
            setCodeStatus(CodeStatus.OK);
            setError(undefined);
        } catch (err) {
            handleError(err);
        }

    };

    const handleError = (err: any) => {
        setCodeStatus(CodeStatus.ERROR);
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError(err.toString());
        }
        console.warn(err);
    }

    const initCAWithImages = () => {
        try {
            caImageSource?.setInputImages(
                imagesContainer ? imagesContainer.getImages() : [],
                olmap.getSize(),
                olmap.getView().calculateExtent())
        } catch (err) {
            handleError(err);
        }
    }

    const animateGIF = async (frameNb: number, stepsPerFrame: number = 4) => {
        caImageSource && animate(caImageSource, olmap, frameNb, stepsPerFrame).then(
            blob => setGifDataUrl(URL.createObjectURL(blob)),
            err => handleError(err)
        );
    }

    const previewLayer = (url: string, name: string, layerCapas?: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities) => {
        if (olmap) {
            const layerDescriptor = layerCapas ?
                descriptorFromWMSCapabilities(url, layerCapas, capas) :
                descriptorFromString(url + "#" + name);
            const layer = createLayerFromDescriptor(layerDescriptor);
            olmap.addLayer(layer);
        }
    }

    return <div className='mainApp'>
            <div className='mapPanel' style={{flex: 2.5}}>
                <SizeMeasurer>
                    {(props: {height: number, width: number} ) => (
                        <>
                        <MapContainer map={olmap} height={props.height} width={props.width}/>
                        <ReactControl map={olmap}>
                            <LayerList layersParent={olmap}
                                       onFitToExtent={(extent, scale) => {
                                           olmap.getView().fit(transformExtent(extent, "EPSG:4326", "EPSG:3857"));
                                           scale && olmap.getView().setResolution(getResolutionFromScale(olmap, scale));
                                       }}/>
                        </ReactControl>
                        </>
                    )}

                </SizeMeasurer>
            </div>
            <div className='controlsPanel' style={{flex: (activeTab=='controls' || activeTab=='about')?1.5:5, maxWidth: '66%'}}>
                <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                    <Tab.Container activeKey={activeTab} defaultActiveKey="controls" id="menu">
                        <Nav variant={"tabs"} onSelect={(eventKey: string) => setActiveTab(eventKey)}>
                            <select style={{marginBottom: 3, marginRight: 'auto'}}
                                    value={scriptName}
                                    onChange={(evt) => setScriptName(evt.currentTarget.value)}>
                                <option value="">blank</option>
                                <option>conway</option>
                                <option>waterflow1</option>
                                <option>winds</option>
                            </select>

                            <Nav.Item>
                                <Nav.Link eventKey="about">
                                    <i className="fas fa-question-circle"></i>
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link eventKey="controls">Controls</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link eventKey="code">
                                    Code
                                    <CodeEvalButton status={codeStatus} evalFn={() => evalCode(code)} style={{marginLeft: 5}}/>
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link eventKey="datasearch">
                                    Search data
                                </Nav.Link>
                            </Nav.Item>
                        </Nav>
                        <Tab.Content style={{position: "relative"}}>
                            <Tab.Pane eventKey="controls">
                                <div className="controls-actions">
                                    {projectDescriptor?.description &&
                                    <div className="ca-description">
                                        <Markdown >{projectDescriptor?.description}</Markdown>
                                    </div>
                                    }
                                    <div className="controls-action">
                                        <button onClick={initCAWithImages}>
                                            Init CA
                                        </button>
                                        {caImageSource?.getEnv() ? "Initialized" : <i>Initialize the Cellular Automaton</i> }
                                    </div>
                                    {caImageSource?.getEnv() && <>
                                        <div className="controls-action">
                                            <button onClick={
                                                (e) =>
                                                    (e.target as HTMLElement).tagName.toLowerCase() == 'button' && stepAutomata(stepNb)
                                                }
                                            >
                                                Step <input style={{width: "3em"}} type="number" value={stepNb} onChange={e => setStepNb(e.target.valueAsNumber)} />
                                            </button>
                                            {caState?.totalSteps ?
                                                <span>{caState?.totalSteps} steps; last iteration : {caState?.iterationTime}ms</span>:
                                                <i>Step the CA <span style={{fontFamily: "monospace"}}>n</span> time(s)</i>
                                            }
                                        </div>
                                        <div className="controls-action">
                                            <CreateGifAction animate={(frameNb, stepsPerFrame) => animateGIF(frameNb, stepsPerFrame)}/><br/>
                                            {gifDataUrl && <img src={gifDataUrl} width="200" />}
                                        </div>
                                    </>
                                    }

                                </div>

                                {selectedCell && (
                                    <div className="controls-status">
                                        {projectDescriptor?.renderHtml ?
                                            projectDescriptor.renderHtml(selectedCell.cell[0], selectedCell.cell[1]) :
                                            JSON.stringify(selectedCell.cell)
                                        }
                                    </div>
                                )}
                            </Tab.Pane>
                            <Tab.Pane eventKey="code" style={{flex: 2}}>
                                {error && (
                                    <div className="error">
                                        {error}
                                    </div>
                                )}
                                <SizeMeasurer>
                                    {(props: {height: number, width: number} ) => (
                                        <CodeEditor code={code} height={props.height} onCodeChange={setCode}/>
                                    )}
                                </SizeMeasurer>
                            </Tab.Pane>
                            <Tab.Pane eventKey="datasearch">
                                <DataSearchPanel onLayerClick={
                                    (url, name, layerCapas, capas) =>
                                        previewLayer(url, name, layerCapas, capas)}/>
                            </Tab.Pane>
                            <Tab.Pane eventKey="about">
                                <Markdown className="absolute-fill">{` 
This is an attempt at a serverless, in-browser cellular automata tool running on geospatial data.
It is also the excuse for experimenting with a blend of [Openlayers](http://openlayers.org), React, Typescript, and the massive amounts of
open geospatial data available (only WMS is currently supported).

A cellular automata (CA) is described using a so-called ProjectDescriptor, editable in the \`Code\` tab. 
This descriptor must contain the list of WMS layers that will be used to initialize the CA, and several functions:

  * \`init\` : intializes the CA from the provided raster data 
  * \`stepFn\` : performs one step of the CA
  * \`renderFn\` : renders the CA state into a displayable raster   

The CA raster inputs are displayed on the map in the \`Sources\` layer group.

Sources available at https://github.com/pduchesne/spatial-ca .
                                `}
                                </Markdown>
                            </Tab.Pane>
                        </Tab.Content>
                    </Tab.Container>
                </div>
            </div>
        </div>
})


export const CreateGifAction = memo ( (props: {animate: (frameNb: number, stepsPerFrame:number) => void}) => {

    const [params, setParams] = useState({frameNb: 10, stepsPerFrame:1});

    return <>
        <button onClick={() => props.animate(params.frameNb, params.stepsPerFrame)}>
            Create GIF
        </button>
        Frame Nb:<input type="number" style={{width: '3em', marginRight: '5px'}} value={params.frameNb} placeholder="Frame Nb" onChange={e => setParams({...params, frameNb: e.target.valueAsNumber})} />
        Steps/Frame:<input type="number" style={{width: '3em', marginRight: '5px'}} value={params.stepsPerFrame} placeholder="Steps/Frame" onChange={e => setParams({...params, stepsPerFrame: e.target.valueAsNumber})} />
        </>
    }
)

export const DataSearchPanel = memo((props: {onLayerClick?: (url: string, name: string, layerCapas?: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities) => void}) => {

    const [searchStr, setSearchStr] = useState<string>();

    const ckan_urls = [
        'https://www.europeandataportal.eu/data/search/ckan',
        'https://data.jrc.ec.europa.eu/api/action',
        //'https://opendata.vlaanderen.be/api/action',
        'https://catalog.data.gov/api/action'
        //'https://data.europa.eu/euodp/data'
    ];

    const [selectedUrl, setSelectedUrl] = useState<string>(ckan_urls[0]);

    return <div className="data-search absolute-fill" >
        <div>
            <select value={selectedUrl} onChange={e => setSelectedUrl(e.target.value)}>
                {ckan_urls.map( (url, idx) => <option key={idx} value={url}>{new URL(url).hostname}</option> )}
            </select>
            <DebounceInput
                minLength={2}
                placeholder="Search terms"
                debounceTimeout={300}
                style={{marginLeft: '5px'}}
                onChange={(e) => setSearchStr(e.target.value)} />
        </div>

        <CkanSearch ckanUrl={selectedUrl} searchStr={searchStr} onLayerClick={props.onLayerClick}/>
    </div>
})

export const CkanSearch = memo((props: {ckanUrl: string, searchStr?: string, onLayerClick?: (url: string, name: string, layerCapas?: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities) => void}) => {

    const maxResults = 20;

    const [currentQuery, setCurrentQuery] = useState<PackageSearchRequest & {start: number}>(
        {fq: 'res_format:WMS', q:props.searchStr, start: 0, rows: maxResults});
    const [currentResult, setCurrentResult] = useState<PackageSearchResponse>();
    const appCtx = useContext(AppContext);

    const setPage = (start: number) => setCurrentQuery({...currentQuery, start: Math.max(0,start)});


    const ckanClient = useMemo(
        () => new CkanClient(props.ckanUrl, appCtx.proxy_url ? ((url: URL) => proxify_url(url, appCtx.proxy_url!)) : undefined ),
        [props.ckanUrl]);

    const ckanResponse$ = usePromiseFn(
        () => ckanClient.package_search(currentQuery)
            .then(value => {
                setCurrentResult(value);
                return value;
            }),
        [currentQuery]);

    // reset the page if search string or url changes
    useEffect( () => {
        setCurrentResult(undefined);
        setCurrentQuery({...currentQuery, q:props.searchStr, start: 0});
    }, [ckanClient, props.searchStr]);

    return <div className="ckan-search">
        { currentResult ?
            <div className="results-header">
                {currentResult.count} datasets found, showing {currentQuery.start} to {currentQuery.start+currentResult.results.length}
                {currentQuery.start > 0 ? <a className="action" style={{margin: 4}} onClick={() => setPage(currentQuery.start-maxResults)}>[Prev]</a> : null}
                {currentResult.count > currentQuery.start+currentResult.results.length ? <a className="action" style={{margin: 4}} onClick={() => setPage(currentQuery.start+maxResults)}>[Next]</a> : null}
            </div> : undefined
        }
        { renderPromiseState(
            ckanResponse$,
            (response) => <div style={{flex: 1, position: "relative"}}>
                <div className="results absolute-fill">
                {response.results && response.results.map ( (r,idx) =>
                    <div key={idx}>
                        <ResultLine package={r}
                                    resource={r.resources.find(r => r.format && r.format.toUpperCase() == 'WMS')}
                                    onLayerClick={props.onLayerClick}
                        />
                    </div>
                )}
                </div>
            </div>)
        }
    </div>
})

export const ResultLine = memo((props: {resource?: ResourceDict, package: PackageDict, onLayerClick?: (url: string, name: string, layerCapas?: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities) => void}) => {

    const [showDetails, setShowDetails] = useState<boolean>();

    return <div>
        <div onClick={() => setShowDetails(!showDetails)} style={{whiteSpace: "nowrap"}}>
            <span style={{fontFamily: "monospace", fontSize: "80%"}}>[{props.resource?.format}]</span>
            {props.package.title || props.package.name}
        </div>
        {showDetails && props.resource && (props.resource.url || props.resource.access_url) && (
            <WMSLayers wms_url={ (props.resource.url || props.resource.access_url)! }
                       name_filter={props.package.title || props.package.name}
                       onLayerClick={props.onLayerClick}
            />
        )}
    </div>
})


export const WMSLayers = memo((props: {wms_url: string, name_filter?: string, onLayerClick?: (url: string, name: string, layerCapas?: WMSCapabilities_Layer, capas?: ParsedWMSCapabilities) => void}) => {

    const appCtx = useContext(AppContext);
    const [showAll, setShowAll] = useState<boolean>(false);

    const strippedUrl = useMemo( () => stripOGCParams(props.wms_url), [props.wms_url]);

    const capabilitiesUrl = useMemo( () => {
        const capabilitiesUrl = new URL(strippedUrl.href);
        capabilitiesUrl.searchParams.set("request", "GetCapabilities");
        capabilitiesUrl.searchParams.set("service", "WMS");
        return capabilitiesUrl;
    }, [strippedUrl]);

    const capabilities$ = usePromiseFn(
        () => {
            const parser = new WMSCapabilities();
            return fetchParseError(proxify_url(capabilitiesUrl, appCtx.proxy_url).href, undefined, true)
                .then(function(response) {
                    return response.text();
                }).then(function(text) {
                    return parser.read(text) as ParsedWMSCapabilities;
                });
        },
        [capabilitiesUrl]);

    return <div style={{marginLeft: 10}}>
        {renderPromiseState(capabilities$, capabilities => {
            try {
                const availableLayers = capabilities.Capability.Layer.Layer || [];
                let filteredLayers = availableLayers;
                if (props.name_filter) {
                    const replacedFilter = props.name_filter.toLowerCase().replace(/[- ]/g, '_');
                    filteredLayers = filteredLayers.filter(l =>
                        (l.Title && l.Title.toLowerCase().replace(/[- ]/g, '_') == replacedFilter) ||
                        (l.Name && l.Name.toLowerCase().replace(/[- ]/g, '_') == replacedFilter));
                }

                return <>
                    {filteredLayers.map(l =>
                        <div key={l.Name}><a href={strippedUrl.href + '#' + l.Name}>{l.Title || l.Name}</a></div>
                    )}
                    <div style={{fontSize: "80%"}}>
                        <div>
                            <span onClick={() => setShowAll(!showAll)}>All {availableLayers.length} layers</span> |
                            <a href={capabilitiesUrl?.href} target="NEW">Capabilities</a>
                        </div>
                        {showAll && availableLayers.map(l =>
                            <div key={l.Name}>
                                {l.Name != undefined ?
                                    <a href={strippedUrl.href + '#' + l.Name}
                                       onClick={ (e) => {
                                           e.preventDefault();
                                           props.onLayerClick && props.onLayerClick(strippedUrl.href, l.Name!, l, capabilities);
                                           return false;} }>
                                        {l.Title || l.Name}
                                    </a> :
                                    <span>{l.Title} (Undefined name)</span>
                                }
                            </div>
                        )}
                    </div>
                </>
            } catch (err) {
                return <>
                    <ErrorMessage message={err.toString()}/>
                    <a href={capabilitiesUrl?.href} target="NEW">Capabilities</a>
                </>
            }
        },
        error => <>
            <ErrorMessage message={error}/>
            <a href={capabilitiesUrl?.href} target="NEW">Capabilities</a>
        </>) }
    </div>
})


/*
 <Tab.Container defaultActiveKey="controls" id="menu">
                        <Nav>
                            <Nav.Item>
                                <Nav.Link eventKey="controls">Controls</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link eventKey="code">Code</Nav.Link>
                            </Nav.Item>
                        </Nav>
                        <Tab.Content>
                            <Tab.Pane eventKey="controls">
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
                            </Tab.Pane>
                            <Tab.Pane eventKey="code">
                                <div onClick={() => evalCode(code)}>EVAL</div>
                                <SizeMeasurer>
                                    {(props: {height: number, width: number} ) => (
                                        <CodeEditor code={code} height={props.height-80} onCodeChange={(code, event) => {
                                            setCode(code);
                                        }}/>
                                    )}

                                </SizeMeasurer>
                            </Tab.Pane>
                        </Tab.Content>
                    </Tab.Container>
 */

export const MatrixDisplay = memo((props: {matrix?: number[][]}) => {
    const {matrix} = props;
    return matrix ?
        <table>
            {matrix.map(row => <tr>{row.map(cell => <td>{cell.toFixed(2)}</td>)}</tr>)}
        </table> : null;
})

ReactDOM.render(<App />, document.getElementById('index'));
