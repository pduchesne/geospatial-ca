# spatial-ca

This is an attempt at a serverless, in-browser cellular automata tool running on geospatial data.
It is also the excuse for experimenting with a blend of [Openlayers](http://openlayers.org), React, Typescript, and the massive amounts of
open geospatial data available (only WMS is currently supported).

## Demo
This application is live on https://demo.highlatitud.es/spatial-ca

## Usage
A cellular automata (CA) is described using a so-called ProjectDescriptor, editable in the `Code` tab. 
This descriptor must contain the list of WMS layers that will be used to initialize the CA, and several functions:

  * `init` : intializes the CA from the provided raster data 
  * `stepFn` : performs one step of the CA
  * `renderFn` : renders the CA state into a displayable raster   

The CA raster inputs are displayed on the map in the `Sources` layer group.

### Controls
Once the code has been successfully executed, the `Controls` panel offers 3 buttons :

  * `Init` : (Re-)Initialize the CA from the raster sources
  * `Step` : Step the CA
  * `Generate GIF` : Create an animated GIF of the current map and CA with `n` frames and `m` CA steps per frame 

## License
This material is open and licensed under the BSD 3-clause license.