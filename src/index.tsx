import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View, ImageCanvas, ImageBase } from 'ol';
import 'ol/ol.css';
import { useState, useRef, useMemo, useEffect } from 'react';
import { TranslateAutomata, ImageDataLattice, Environment } from 'ca';
import * as control from 'ol/control/Control';
import OSM from 'ol/source/OSM';
import * as raster from 'ol/source/Raster';
import ImageStatic from 'ol/source/ImageStatic';
import * as layer from 'ol/layer';
import * as extent from 'ol/extent';
import { ViewOptions } from 'ol/View';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import ImageSource, {Options} from 'ol/source/Image';
import Projection from 'ol/proj/Projection';
import { getHeight } from 'ol/extent';
//import Event from 'ol/events/Event';
//import EventType from 'ol/events/EventType';

interface AppContext {
   
}

export const UserContext = React.createContext<AppContext>({});

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


export class ReactControl extends control.default {

    private container: Element;
    private controlFn: (map: Map) => JSX.Element;

    constructor(elementFn: (map: Map) => JSX.Element, options?: control.Options) {

        const container = document.createElement('div');
        container.className = "ol-control";
        container.style.top = '0px';

        super({...options, element: container});

        this.container = container;
        this.controlFn = elementFn;
    }

    setMap(map: Map) {
        super.setMap(map);

        ReactDOM.render( this.controlFn(map), this.container );
    }
}

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

export class SpatialEnvironment extends Environment<ImageDataLattice, ImageDataLattice> {
    private extent: extent.Extent;

    constructor(image: ImageData, extent: extent.Extent) {
        super(
            new ImageDataLattice(image), 
            new ImageDataLattice(new ImageData(image.width, image.height)),
            new TranslateAutomata());

        this.extent = extent;
    }

    getExtent() {
        return this.extent;
    }

    renderOnCanvas() {
        const canvas: HTMLCanvasElement = document.createElement('canvas');       

        canvas.setAttribute('width', this.getOutput().getWidth()+'px');             
        canvas.setAttribute('height', this.getOutput().getHeight()+'px'); 
        canvas.getContext('2d')!.putImageData(this.getOutput().getData(), 0, 0);

        return canvas;
    }

}

export class CellularAutomataSource2 extends ImageSource {

    private caEnv: SpatialEnvironment | undefined;
    private renderedImage: ImageBase;
    
    constructor(options: Options) {
        super(options);
    }

    setInputImages(images: ImageData[] | undefined, extent: extent.Extent) {
        if (images && images.length > 0) {
            this.caEnv = new SpatialEnvironment(images[0], extent);
          } else {
            this.caEnv = undefined;
          }
    }

    getEnv() {
        return this.caEnv;
    }

    getImageInternal(extent: extent.Extent, resolution: number, pixelRatio: number, projection: Projection) {
        return this.renderedImage;
    };

    renderOutput () {
        if (this.caEnv) {
            const image = this.caEnv.renderOnCanvas();
            const resolution = getHeight(this.caEnv.getExtent()) / image.height;
            this.renderedImage = new ImageCanvas(this.caEnv.getExtent(), resolution, 1, image);
        } else
            this.renderedImage = undefined as unknown as ImageBase;

        //super.handleImageChange(new Event(EventType.CHANGE));
        this.changed(); 
    };

    stepAutomata() {
      if (this.caEnv) {
          this.caEnv.applyAutomata();
          //this.handleImageChange(new Event(EventType.CHANGE));
          this.renderOutput();
      }
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

                   canvas.getContext('2d')!.putImageData(caEnv.getOutput().getData(), 0, 0);
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
                new TranslateAutomata() );
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

    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );
    }, []);

    const imagesContainer = useMemo( () => {
        const container = new RenderedImagesContainer({
        sources: [new OSM()]
      });
      return container;
    } , 
      [] );

      const caImageSource = useMemo( () => {
        
        //return new ImageImageData({ projection: 'EPSG:4326', imageExtent: [-180,-90,180,90] });

        return new CellularAutomataSource2({});

        } , 
        [] );
      

      const imageSource = useMemo( () => {
        return new layer.Tile({
            source: new OSM(),
            //visible: false
          });
    }, 
      [] );

      const stepAutomata = () => {
        caImageSource.stepAutomata();
      }

    const olmap = useMemo( () => {

        const map = new Map({
        target: mapDiv.current || undefined,
        controls: [new ReactControl( (map: Map) => <button onMouseUp={() => map.getView().setRotation(Math.PI/2)}>OK</button> )],
        layers: [
          imageSource,
          new layer.Image({
              source: imagesContainer,
              opacity: 0.5
            }),
            
            new layer.Image({
                source: new ImageStatic({
                  attributions: '© <a href="http://xkcd.com/license.html">xkcd</a>',
                  url: 'https://imgs.xkcd.com/comics/online_communities.png',
                  projection: 'EPSG:4326',
                  imageExtent: [-180,-90,180,90]
                })
              }),
              
              new layer.Image({
                source: caImageSource
              })
        ],
        view: new View(viewOptions)
      });
   
        return map;
    }, 
      [mapDiv.current, viewOptions, imagesContainer] );
      imageSource


      olmap.getLayers()//.item(0).

      return <div>
          <button onMouseUp={() => caImageSource.setInputImages(imagesContainer.getImages(), olmap.getView().calculateExtent())}>SNAPSHOT</button>>
          <button onMouseUp={stepAutomata}>STEP</button>>
          <div style={{height: '400px'}} ref={mapDiv}/>
          </div>
}

ReactDOM.render(<App />, document.getElementById('index'));
