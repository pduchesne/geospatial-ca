

// Transform water level into alpha transparency for the rendering
// The more water, the less transparent
const level2alpha = (level) => 1 - 1 / Math.pow(1 + level/5 , 2);

return {
    // Take a WMS that provides elevation as a blue to red gradient
    layers: [
        {url: 'https://demo.highlatitud.es/proxy?_uri=https://opendata.meteo.be/service/alaro/ows&TIME=2020-02-27T01:00:00.000Z',
            name:'10_m_u__wind_component',
            tiled:false,
            attribution: 'Royal Meteorological Institute of Belgium'},
        {url: 'https://demo.highlatitud.es/proxy?_uri=https://opendata.meteo.be/service/alaro/ows&TIME=2020-02-27T01:00:00.000Z',
            name:'10_m_v__wind_component',
            tiled:false,
            attribution: 'Royal Meteorological Institute of Belgium'},
        "https://image.discomap.eea.europa.eu/arcgis/services/Elevation/EUElev_DEM_V11/MapServer/WMSServer#DEM_v11_Masked2"
    ],

    // Default extent
    extent: [3,48,6,53],

    // use the CA step function from the imported model
    stepCellFn: (stateCell, baseCell, x, y, state, base) => {
        const newStateCell = [stateCell[0]];
        lib.model.iterateNeighbourhood(
            state, base, x, y, 1,
            (dx, dy, neighbourStateAndBase) => {
                if (dx == 0 && dy == 0) {
                    // first remove what's leaving the cell
                    const delta = (Math.abs(baseCell[0])+Math.abs(baseCell[1]))/2 * stateCell[0];
                    newStateCell[0] -= delta;
                } else if (dx == 0) {
                    // vertical drift
                    if (neighbourStateAndBase[1][1]*dy>0) {
                        const delta = Math.abs(neighbourStateAndBase[1][1]) * neighbourStateAndBase[0][0] / 2;
                        newStateCell[0] += delta;
                    }
                } else if (dy == 0) {
                    // horizontal drift
                    if (neighbourStateAndBase[1][0]*dx<0) {
                        const delta = Math.abs(neighbourStateAndBase[1][0]) * neighbourStateAndBase[0][0] / 2;
                        newStateCell[0] += delta;
                    }
                }
            });

        return newStateCell;
    },

    // Initialize the model
    init: (images, size) => {
        const windU = new lib.model.ImageDataLattice(images[0]);
        const windV = new lib.model.ImageDataLattice(images[1]);
        return [
            // create the state lattice
            new lib.model.BaseLattice2D(
                size[0], size[1],
                (x, y) => ([Math.random()>.95 ? 1 : 0]) // add random seeds
            ),
            // create the base lattice
            new lib.model.BaseLattice2D(
                size[0], size[1],
                // for each cell, init the TerrainCellStatus instance
                (x, y) => [
                    2*(lib.utils.rgbToHsl(windU.get(x,y))[2]-0.5),
                    2*(lib.utils.rgbToHsl(windV.get(x,y))[2]-0.5)].map(val => val == -1 ? 0 : val)
            )
        ]
    },

    // render the CA model state into a canvas image
    renderFn: (state, base) =>
        // use the fromLattice function that converts lattice to canvas
        // on a per-cell basis
        lib.model.ImageDataLattice.fromLattice(
            state,
            // set each to blue with transparency computed with level2alpha
            (x, y, cell) =>
                [0, 0, 0, Math.min(cell[0],1)*255]
        ).getData(),

    renderFn_old: (state, base) =>
        // use the fromLattice function that converts lattice to canvas
        // on a per-cell basis
        lib.model.ImageDataLattice.fromLattice(
            base,
            // set each to blue with transparency computed with level2alpha
            (x, y, cell) =>
                [cell[1]>0?cell[1]*255:0,
                    Math.abs(cell[0])*255,
                    cell[1]<0?-cell[1]*255:0,

                    Math.sqrt(cell[0]*cell[0]+cell[1]*cell[1])*255]
        ).getData()
}