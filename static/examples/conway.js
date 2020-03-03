

/** @type lib.spatial.ProjectDescriptor<[boolean], lib.spatial.TerrainCell> */
const projectDescriptor = {
    description: 'Geospatial take on the classical Conway\'s Game of Life' ,
    data_layers: [
        // European-wide DEM
        'https://image.discomap.eea.europa.eu/arcgis/services/Elevation/EUElev_DEM_V11/MapServer/WMSServer#DEM_v11_Masked2',
        // land use
        'https://image.discomap.eea.europa.eu/arcgis/services/GioLandPublic/ESM2012_Release2017_UAColours_WM/MapServer/WMSServer#1'
    ],
    extent: [5,50,6,51], // lon/lat extent

    // Initialize the model
    init: (images, size) => [
        // create the state lattice
        new lib.model.BaseLattice2D(
            size[0], size[1],
            // each state cell is a 1-dim array with a boolean [isAlive]
            (x, y) => ([
                Math.random() > 0.9, // init with randomly 10% of cells alive
            ])
        ),
        // create the static terrain lattice from DEM and LandUse WMS
        lib.spatial.TerrainLattice.createFromImages(images[0] /* DEM */, images[1] /* Land use */)
    ],

    stepCellFn: (
        stateCell, baseCell, x, y, state, base) => {
        let aliveNeighbours = 0;
        lib.model.iterateNeighbourhood(
            state, base, x, y, 1,
            (dx, dy, neighbourStateAndBase) => {
                const nb_state = neighbourStateAndBase[0];
                if ( (dx != 0 || dy != 0) && nb_state[0] ) {
                    aliveNeighbours ++;
                }
            });

        if (aliveNeighbours == 2)
            return [...stateCell]
        else if (aliveNeighbours == 3)
            return [true]
        else
            return [false];
    },

    renderFn: (state, base) => lib.model.ImageDataLattice.fromLattice(
        state,
        (x, y, stateCell) => [0,0,255, stateCell[0] ? 255 : 0]
    ).getData()
}

return projectDescriptor;